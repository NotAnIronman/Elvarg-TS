const { PluginManager } = require("../../../../src/main/typescript/elvarg/plugins/PluginManager");
const { MapObjects } = require("../../../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { Skill } = require("../../../../src/main/typescript/elvarg/game/model/Skill");
const { Equipment } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { RegionManager } = require("../../../../src/main/typescript/elvarg/game/collision/RegionManager");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");
const { setModeBankRun, setModeMining } = require("../state/PlayerBotState");
const {
  queueRouteAndFlagAppearance,
  randomInRange,
} = require("../navigation/BotNavigation");
const { Item } = require("../../../../src/main/typescript/elvarg/game/model/Item");
const { ItemIds } = require("../../../../src/main/typescript/elvarg/util/IdEnums");
const Mining = require("../../../skills/Mining.plugin");

const RETRY_SEARCH_MS = 1500;
const WALK_COMMAND_COOLDOWN_MS = 900;
// Keep target selection aligned with the 1-region scan radius so bots can
// actually act on visible rocks across the local region neighborhood.
const MAX_ROCK_TARGET_DISTANCE_TILES = 64;
const ROCK_SEARCH_REGION_RADIUS = 1;
const SEARCH_WALK_ATTEMPTS = 12;
const ROCK_SELECTION_POOL_SIZE = 4;
const ROCK_SELECTION_CROWD_PENALTY_SQ = 36;
const ROCK_SELECTION_JITTER_SQ = 8;

class MiningBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.searchWalkRadius = options.botWalkRadius ?? 6;
  }

  activateMode({ player, state }) {
    if (!player || !state) {
      return false;
    }
    setModeMining(player, state, this.behaviorMode);
    if (state.mining) {
      state.mining.nextActionAt = 0;
    }
    return true;
  }

  startMode({ player, state, nowMs, activeForMs, reason = "auto_switch" }) {
    if (!this.activateMode({ player, state })) {
      return false;
    }
    if (!state.autonomy) {
      state.autonomy = {
        nextDecisionAt: 0,
        modeEndsAt: 0,
        pvpCooldownUntil: 0,
        manualMode: null,
      };
    }
    if (Number.isInteger(nowMs) && Number.isInteger(activeForMs) && activeForMs > 0) {
      state.autonomy.modeEndsAt = nowMs + activeForMs;
    }
    this.api?.log?.("bot_mode_switch", {
      username: player.getUsername?.(),
      mode: this.behaviorMode.MINING,
      reason,
      activeForMs: Number.isInteger(activeForMs) ? activeForMs : null,
    });
    return true;
  }

  onBankRunResume({ state, nowMs, bankRun }) {
    if (!state?.mining) {
      return false;
    }
    const resumeTarget = bankRun?.resumeMiningTarget
      ? {
          objectId: bankRun.resumeMiningTarget.objectId,
          x: bankRun.resumeMiningTarget.x,
          y: bankRun.resumeMiningTarget.y,
          z: bankRun.resumeMiningTarget.z,
        }
      : null;
    state.mining.target = resumeTarget;
    state.mining.nextActionAt = nowMs;
    state.mining.nextSearchAt = nowMs;
    return true;
  }

  getTraversalTarget(state) {
    return state?.mining?.target ?? null;
  }

  setTraversalTarget(stateOrPayload, maybeTarget) {
    const state = stateOrPayload?.state ?? stateOrPayload;
    const target = stateOrPayload?.target ?? maybeTarget;
    if (!state?.mining) {
      return false;
    }
    state.mining.target = target;
    return true;
  }

  handleBlocked({
    player,
    state,
    event,
    nowMs,
    traversalService,
    blockedRetargetMinDelayMs,
    blockedRetargetMaxDelayMs,
  }) {
    const target = state?.mining?.target;
    if (!target) {
      return true;
    }

    const traversalObject = traversalService.findObjectOnRoute(
      player,
      event.from,
      target
    );
    if (!traversalObject) {
      state.mining.target = null;
      state.mining.nextSearchAt = nowMs + blockedRetargetMaxDelayMs;
      state.mining.nextActionAt = nowMs + blockedRetargetMinDelayMs;
      return true;
    }

    const currentY = player.getLocation().getY();
    const targetY = target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!traversalService.isObjectBetween(currentY, targetY, objectY)) {
      state.mining.target = null;
      state.mining.nextSearchAt = nowMs + blockedRetargetMaxDelayMs;
      state.mining.nextActionAt = nowMs + blockedRetargetMinDelayMs;
      return true;
    }

    traversalService.requestCross(player, state, traversalObject, nowMs);
    return true;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.MINING,
      requireNotBusy: false,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    if (!state.mining) {
      return "failure";
    }

    if (Mining.isMiningActive?.(player)) {
      return "running";
    }

    if (nowMs < (state.mining.nextActionAt ?? 0)) {
      return "running";
    }

    if (player.getInventory().isFull()) {
      const miningTarget = state.mining?.target;
      const currentLoc = player.getLocation();
      const returnTo = {
        x: currentLoc.getX(),
        y: currentLoc.getY(),
        z: currentLoc.getZ(),
      };
      setModeBankRun(player, state, this.behaviorMode, {
        returnMode: this.behaviorMode.MINING,
        returnTo,
        resumeMiningTarget: miningTarget
          ? {
              objectId: miningTarget.objectId,
              x: miningTarget.x,
              y: miningTarget.y,
              z: miningTarget.z,
            }
          : null,
      });
      this.api.log("bot_mode_switch", {
        username: player.getUsername(),
        mode: this.behaviorMode.BANK_RUN,
        reason: "inventory_full_bank_run_mining",
      });
      return "running";
    }

    const pickaxe = this.equipBestPickaxeForMining(player);
    if (!pickaxe) {
      state.mining.nextActionAt = nowMs + RETRY_SEARCH_MS;
      return "failure";
    }

    let targetRock = this.resolveTargetRockObject(player, state);
    if (!targetRock) {
      if (nowMs < (state.mining.nextSearchAt ?? 0)) {
        return "running";
      }
      state.mining.nextSearchAt = nowMs + RETRY_SEARCH_MS;

      const rockTiers = this.resolveRockTiersForLevel(player);
      if (!rockTiers || rockTiers.length === 0) {
        return "failure";
      }

      for (const rockTier of rockTiers) {
        targetRock = this.findNearestRockObjectForTier(player, rockTier);
        if (targetRock) {
          break;
        }
      }

      if (!targetRock) {
        state.mining.target = null;
        if (this.queueSearchWalk(player, state)) {
          state.mining.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
        }
        return "running";
      }

      const distanceToTarget = this.getDistanceToRock(player, targetRock);
      if (distanceToTarget > MAX_ROCK_TARGET_DISTANCE_TILES) {
        state.mining.target = null;
        if (this.queueSearchWalk(player, state)) {
          state.mining.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
        } else {
          state.mining.nextActionAt = nowMs + RETRY_SEARCH_MS;
        }
        state.mining.nextSearchAt = nowMs + RETRY_SEARCH_MS;
        return "running";
      }

      state.mining.target = {
        objectId: targetRock.getId(),
        x: targetRock.getLocation().getX(),
        y: targetRock.getLocation().getY(),
        z: targetRock.getLocation().getZ(),
      };
    }

    if (player.getForceMovement() != null) {
      return "running";
    }
    if (player.getMovementQueue()?.size?.() > 0) {
      return "running";
    }

    const targetLocation = targetRock.getLocation();
    player.getMovementQueue().walkToObject(targetRock, {
      execute: () => {
        PluginManager.emitObjectInteraction({
          player,
          object: targetRock,
          objectId: targetRock.getId(),
          clickType: 1,
          location: {
            x: targetLocation.getX(),
            y: targetLocation.getY(),
            z: targetLocation.getZ(),
          },
          sourceLocation: {
            x: player.getLocation().getX(),
            y: player.getLocation().getY(),
            z: player.getLocation().getZ(),
          },
          handled: false,
        });
      },
    });
    state.mining.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
    return "running";
  }

  getMiningLevel(player) {
    return player.getSkillManager().getCurrentLevel(Skill.MINING);
  }

  equipBestPickaxeForMining(player) {
    const level = this.getMiningLevel(player);
    const pickaxe = (Mining.PICKAXES_DESC ?? []).find(
      (entry) => level >= entry.requiredLevel
    );
    if (!pickaxe) {
      return null;
    }

    const equipment = player.getEquipment();
    const equipped = equipment.getItems()[Equipment.WEAPON_SLOT];
    if (equipped && equipped.getId() === pickaxe.id) {
      return pickaxe;
    }

    equipment.set(Equipment.WEAPON_SLOT, new Item(pickaxe.id, 1));
    equipment.refreshItems();
    player.getUpdateFlag().flag(Flag.APPEARANCE);
    return pickaxe;
  }

  resolveRockTiersForLevel(player) {
    const level = this.getMiningLevel(player);
    const rocks = (Mining.ROCKS ?? []).filter((rock) => rock.objectIds?.length);
    if (rocks.length === 0) {
      return [];
    }

    if (level < 30) {
      return this.resolveCopperTinTiers(player, rocks, level);
    }

    return rocks
      .filter((rock) => rock.level <= level && rock.oreId !== ItemIds.CLAY)
      .sort((a, b) => b.level - a.level);
  }

  resolveCopperTinTiers(player, rocks, level) {
    const inv = player.getInventory();
    const copperCount = inv.getAmount(ItemIds.COPPER_ORE);
    const tinCount = inv.getAmount(ItemIds.TIN_ORE);
    const preferCopper = copperCount <= tinCount;
    const firstOre = preferCopper ? ItemIds.COPPER_ORE : ItemIds.TIN_ORE;
    const secondOre = preferCopper ? ItemIds.TIN_ORE : ItemIds.COPPER_ORE;

    const first = rocks
      .filter((rock) => rock.level <= level && rock.oreId === firstOre)
      .sort((a, b) => b.level - a.level);
    const second = rocks
      .filter((rock) => rock.level <= level && rock.oreId === secondOre)
      .sort((a, b) => b.level - a.level);
    return [...first, ...second];
  }

  rockTargetKey(objectId, x, y, z) {
    return `${objectId}:${x}:${y}:${z}`;
  }

  getCurrentMiningTargetCounts() {
    const counts = new Map();
    if (!this.botStatesByName?.values) {
      return counts;
    }

    for (const state of this.botStatesByName.values()) {
      const target = state?.mining?.target;
      if (!target) {
        continue;
      }
      const key = this.rockTargetKey(
        target.objectId,
        target.x,
        target.y,
        target.z
      );
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  findNearestRockObjectForTier(player, rockTier) {
    if (!player || !rockTier) {
      return null;
    }
    this.ensureNearbyRegionsLoaded(player);
    const loc = player.getLocation();
    const privateArea = player.getPrivateArea();
    const rockIds = new Set(rockTier.objectIds);
    const currentRegionX = loc.getX() >> 6;
    const currentRegionY = loc.getY() >> 6;
    const maxDistSq = MAX_ROCK_TARGET_DISTANCE_TILES * MAX_ROCK_TARGET_DISTANCE_TILES;
    const targetCounts = this.getCurrentMiningTargetCounts();
    const candidates = [];
    const playerUsername = player.getUsername?.();
    const selfState = playerUsername
      ? this.botStatesByName?.get?.(playerUsername)
      : null;

    for (const objects of MapObjects.mapObjects.values()) {
      if (!objects || objects.length === 0) {
        continue;
      }
      for (const object of objects) {
        if (!object || !rockIds.has(object.getId())) {
          continue;
        }
        if (object.getPrivateArea() !== privateArea) {
          continue;
        }
        const objectLoc = object.getLocation();
        if (!objectLoc || objectLoc.getZ() !== loc.getZ()) {
          continue;
        }
        const objectRegionX = objectLoc.getX() >> 6;
        const objectRegionY = objectLoc.getY() >> 6;
        if (
          Math.abs(objectRegionX - currentRegionX) > 1 ||
          Math.abs(objectRegionY - currentRegionY) > 1
        ) {
          continue;
        }
        const dx = objectLoc.getX() - loc.getX();
        const dy = objectLoc.getY() - loc.getY();
        const distSq = dx * dx + dy * dy;
        if (distSq > maxDistSq) {
          continue;
        }

        const key = this.rockTargetKey(
          object.getId(),
          objectLoc.getX(),
          objectLoc.getY(),
          objectLoc.getZ()
        );
        let crowdCount = targetCounts.get(key) ?? 0;
        const selfTarget = selfState?.mining?.target;
        if (
          selfTarget &&
          selfTarget.objectId === object.getId() &&
          selfTarget.x === objectLoc.getX() &&
          selfTarget.y === objectLoc.getY() &&
          selfTarget.z === objectLoc.getZ()
        ) {
          crowdCount = Math.max(0, crowdCount - 1);
        }

        const jitter = randomInRange(0, ROCK_SELECTION_JITTER_SQ);
        const score = distSq + crowdCount * ROCK_SELECTION_CROWD_PENALTY_SQ + jitter;
        candidates.push({ object, score });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => a.score - b.score);
    const poolSize = Math.min(ROCK_SELECTION_POOL_SIZE, candidates.length);
    const pickIndex = randomInRange(0, poolSize - 1);
    return candidates[pickIndex].object;
  }

  ensureNearbyRegionsLoaded(player) {
    const loc = player?.getLocation?.();
    if (!loc) {
      return;
    }
    const baseX = loc.getX();
    const baseY = loc.getY();
    for (let rx = -ROCK_SEARCH_REGION_RADIUS; rx <= ROCK_SEARCH_REGION_RADIUS; rx++) {
      for (let ry = -ROCK_SEARCH_REGION_RADIUS; ry <= ROCK_SEARCH_REGION_RADIUS; ry++) {
        RegionManager.loadMapFiles(baseX + rx * 64, baseY + ry * 64);
      }
    }
  }

  resolveTargetRockObject(player, state) {
    const target = state?.mining?.target;
    if (!target) {
      return null;
    }
    const location = player.getLocation().clone();
    location.set(target.x, target.y, target.z);
    return MapObjects.get(target.objectId, location, player.getPrivateArea());
  }

  getDistanceToRock(player, rockObject) {
    if (!player || !rockObject) {
      return Number.MAX_SAFE_INTEGER;
    }
    return player.getLocation().getDistance(rockObject.getLocation());
  }

  queueSearchWalk(player, state) {
    if (!player || !state?.mining) {
      return false;
    }
    if (player.getForceMovement() != null) {
      return false;
    }
    const queue = player.getMovementQueue?.();
    if (!queue || queue.size() > 0) {
      return false;
    }

    const loc = player.getLocation();
    const centerX = state?.home?.x ?? loc.getX();
    const centerY = state?.home?.y ?? loc.getY();
    const centerZ = state?.home?.z ?? loc.getZ();
    const radius = this.searchWalkRadius;
    const radiusSq = radius * radius;

    for (let attempt = 0; attempt < SEARCH_WALK_ATTEMPTS; attempt++) {
      const dx = randomInRange(-radius, radius);
      const dy = randomInRange(-radius, radius);
      if (dx * dx + dy * dy > radiusSq) {
        continue;
      }
      const targetX = centerX + dx;
      const targetY = centerY + dy;
      if (
        targetX === loc.getX() &&
        targetY === loc.getY() &&
        centerZ === loc.getZ()
      ) {
        continue;
      }

      queueRouteAndFlagAppearance(player, targetX, targetY);
      state.mining.searchTarget = { x: targetX, y: targetY, z: centerZ };
      return true;
    }

    return false;
  }
}

module.exports = {
  MiningBehavior,
};
