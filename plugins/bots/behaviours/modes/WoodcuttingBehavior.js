const { PluginManager } = require("../../../../src/main/typescript/elvarg/plugins/PluginManager");
const { MapObjects } = require("../../../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { ItemOnGroundManager } = require("../../../../src/main/typescript/elvarg/game/entity/impl/grounditem/ItemOnGroundManager");
const { Item } = require("../../../../src/main/typescript/elvarg/game/model/Item");
const { Skill } = require("../../../../src/main/typescript/elvarg/game/model/Skill");
const { Equipment } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { RegionManager } = require("../../../../src/main/typescript/elvarg/game/collision/RegionManager");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");
const {
  queueRouteAndFlagAppearance,
  randomInRange,
} = require("../navigation/BotNavigation");
const Woodcutting = require("../../../skills/Woodcutting.plugin");

const RETRY_SEARCH_MS = 1500;
const WALK_COMMAND_COOLDOWN_MS = 900;
const DROP_LOGS_COOLDOWN_MS = 300;
const MAX_NEXT_TREE_DISTANCE_TILES = 10;
const TREE_SEARCH_REGION_RADIUS = 1;
const SEARCH_WALK_ATTEMPTS = 12;
const SEARCH_TREE_VISIBILITY_RADIUS_TILES = 18;
const TREE_DEBUG_CHAT_COOLDOWN_MS = 4000;

class WoodcuttingBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.searchWalkRadius = options.botWalkRadius ?? 6;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.WOODCUTTING,
      requireNotBusy: false,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    if (!state.woodcutting) {
      return "failure";
    }

    if (Woodcutting.isWoodcuttingActive(player)) {
      return "running";
    }

    if (nowMs < (state.woodcutting.nextActionAt ?? 0)) {
      return "running";
    }

    if (player.getInventory().isFull()) {
      const dropped = this.dropAllWoodcuttingLogs(player);
      state.woodcutting.nextActionAt = nowMs + DROP_LOGS_COOLDOWN_MS;
      if (dropped) {
        this.api.log("woodcutting_drop_logs", { username: player.getUsername() });
      }
      return "running";
    }

    const axe = this.equipBestAxeForWoodcutting(player);
    if (!axe) {
      state.woodcutting.nextActionAt = nowMs + RETRY_SEARCH_MS;
      return "failure";
    }

    let targetTree = this.resolveTargetTreeObject(player, state);
    if (!targetTree) {
      if (nowMs < (state.woodcutting.nextSearchAt ?? 0)) {
        return "running";
      }
      state.woodcutting.nextSearchAt = nowMs + RETRY_SEARCH_MS;

      const treeTiers = this.resolveBestTreeTiersForLevel(
        this.getWoodcuttingLevel(player)
      );
      if (!treeTiers || treeTiers.length === 0) {
        return "failure";
      }
      for (const treeTier of treeTiers) {
        targetTree = this.findNearestTreeObjectForTier(player, treeTier);
        if (targetTree) {
          break;
        }
      }
      if (!targetTree) {
        state.woodcutting.target = null;
        const visibleTrees = this.countVisibleTreesInRange(
          player,
          treeTiers,
          SEARCH_TREE_VISIBILITY_RADIUS_TILES
        );
        if (nowMs >= (state.woodcutting.nextDebugChatAt ?? 0)) {
          player.sendChat(`I can see ${visibleTrees} trees.`);
          state.woodcutting.nextDebugChatAt = nowMs + TREE_DEBUG_CHAT_COOLDOWN_MS;
        }
        if (this.queueSearchWalk(player, state)) {
          state.woodcutting.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
        }
        this.api.log("woodcutting_no_tree_found", {
          username: player.getUsername(),
          level: this.getWoodcuttingLevel(player),
          visibleTrees,
          loadedObjectBuckets: MapObjects.mapObjects.size,
        });
        return "running";
      }

      // If the next available tree is too far away, keep waiting at the
      // previous tree location for its respawn instead of running off.
      if (
        state.woodcutting.target &&
        this.getDistanceToTree(player, targetTree) > MAX_NEXT_TREE_DISTANCE_TILES
      ) {
        state.woodcutting.nextActionAt = nowMs + RETRY_SEARCH_MS;
        state.woodcutting.nextSearchAt = nowMs + RETRY_SEARCH_MS;
        return "running";
      }

      state.woodcutting.target = {
        objectId: targetTree.getId(),
        x: targetTree.getLocation().getX(),
        y: targetTree.getLocation().getY(),
        z: targetTree.getLocation().getZ(),
      };
    }

    if (player.getForceMovement() != null) {
      return "running";
    }
    if (player.getMovementQueue()?.size?.() > 0) {
      return "running";
    }

    const targetLocation = targetTree.getLocation();
    player.getMovementQueue().walkToObject(targetTree, {
      execute: () => {
        PluginManager.emitObjectInteraction({
          player,
          object: targetTree,
          objectId: targetTree.getId(),
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
    state.woodcutting.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
    return "running";
  }

  getWoodcuttingLevel(player) {
    return player.getSkillManager().getCurrentLevel(Skill.WOODCUTTING);
  }

  resolveBestTreeTiersForLevel(level) {
    return Woodcutting.TREES.filter(
      (tree) => tree.objectIds?.length && tree.requiredLevel <= level
    ).sort((a, b) => b.requiredLevel - a.requiredLevel);
  }

  findNearestTreeObjectForTier(player, treeTier) {
    if (!player || !treeTier) {
      return null;
    }
    this.ensureNearbyRegionsLoaded(player);
    const loc = player.getLocation();
    const privateArea = player.getPrivateArea();
    const treeIds = new Set(treeTier.objectIds);
    let bestObject = null;
    let bestDistSq = Number.MAX_SAFE_INTEGER;

    for (const objects of MapObjects.mapObjects.values()) {
      if (!objects || objects.length === 0) {
        continue;
      }
      for (const object of objects) {
        if (!object || !treeIds.has(object.getId())) {
          continue;
        }
        if (object.getPrivateArea() !== privateArea) {
          continue;
        }
        const objectLoc = object.getLocation();
        if (!objectLoc || objectLoc.getZ() !== loc.getZ()) {
          continue;
        }
        const dx = objectLoc.getX() - loc.getX();
        const dy = objectLoc.getY() - loc.getY();
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestObject = object;
        }
      }
    }

    return bestObject;
  }

  ensureNearbyRegionsLoaded(player) {
    const loc = player?.getLocation?.();
    if (!loc) {
      return;
    }
    const baseX = loc.getX();
    const baseY = loc.getY();
    for (let rx = -TREE_SEARCH_REGION_RADIUS; rx <= TREE_SEARCH_REGION_RADIUS; rx++) {
      for (let ry = -TREE_SEARCH_REGION_RADIUS; ry <= TREE_SEARCH_REGION_RADIUS; ry++) {
        RegionManager.loadMapFiles(baseX + rx * 64, baseY + ry * 64);
      }
    }
  }

  equipBestAxeForWoodcutting(player) {
    const level = this.getWoodcuttingLevel(player);
    const axe = Woodcutting.findBestUsableAxeByLevel(level);
    if (!axe) {
      return null;
    }

    const equipment = player.getEquipment();
    const equipped = equipment.getItems()[Equipment.WEAPON_SLOT];
    if (equipped && equipped.getId() === axe.id) {
      return axe;
    }

    equipment.set(Equipment.WEAPON_SLOT, new Item(axe.id, 1));
    equipment.refreshItems();
    player.getUpdateFlag().flag(Flag.APPEARANCE);
    return axe;
  }

  dropAllWoodcuttingLogs(player) {
    const inventory = player.getInventory();
    let droppedAny = false;
    for (const logId of Woodcutting.TREE_LOG_IDS) {
      const amount = inventory.getAmount(logId);
      if (amount <= 0) {
        continue;
      }
      inventory.delete(logId, amount);
      ItemOnGroundManager.registerLocation(
        player,
        new Item(logId, amount),
        player.getLocation().clone()
      );
      droppedAny = true;
    }
    return droppedAny;
  }

  resolveTargetTreeObject(player, state) {
    const target = state?.woodcutting?.target;
    if (!target) {
      return null;
    }
    const location = player.getLocation().clone();
    location.set(target.x, target.y, target.z);
    return MapObjects.get(target.objectId, location, player.getPrivateArea());
  }

  getDistanceToTree(player, treeObject) {
    if (!player || !treeObject) {
      return Number.MAX_SAFE_INTEGER;
    }
    return player.getLocation().getDistance(treeObject.getLocation());
  }

  queueSearchWalk(player, state) {
    if (!player || !state?.woodcutting) {
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
      state.woodcutting.searchTarget = { x: targetX, y: targetY, z: centerZ };
      return true;
    }

    return false;
  }

  countVisibleTreesInRange(player, treeTiers, radiusTiles) {
    if (!player || !treeTiers || treeTiers.length === 0) {
      return 0;
    }
    const loc = player.getLocation();
    const privateArea = player.getPrivateArea();
    const radiusSq = radiusTiles * radiusTiles;
    const treeIds = new Set();
    for (const tier of treeTiers) {
      for (const objectId of tier.objectIds ?? []) {
        treeIds.add(objectId);
      }
    }

    let count = 0;
    for (const objects of MapObjects.mapObjects.values()) {
      if (!objects || objects.length === 0) {
        continue;
      }
      for (const object of objects) {
        if (!object || !treeIds.has(object.getId())) {
          continue;
        }
        if (object.getPrivateArea() !== privateArea) {
          continue;
        }
        const objectLoc = object.getLocation();
        if (!objectLoc || objectLoc.getZ() !== loc.getZ()) {
          continue;
        }
        const dx = objectLoc.getX() - loc.getX();
        const dy = objectLoc.getY() - loc.getY();
        if (dx * dx + dy * dy <= radiusSq) {
          count++;
        }
      }
    }
    return count;
  }
}

module.exports = {
  WoodcuttingBehavior,
};
