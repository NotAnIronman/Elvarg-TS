const { PluginManager } = require("../../../../src/main/typescript/elvarg/plugins/PluginManager");
const { MapObjects } = require("../../../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { RegionManager } = require("../../../../src/main/typescript/elvarg/game/collision/RegionManager");
const { ObjectManager } = require("../../../../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager");
const { Bank } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");
const { ObjectIds } = require("../../../../src/main/typescript/elvarg/util/IdEnums");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");
const { queueRouteAndFlagAppearance } = require("../navigation/BotNavigation");
const {
  setModeFiremaking,
  setModeWoodcutting,
} = require("../state/PlayerBotState");
const Woodcutting = require("../../../skills/Woodcutting.plugin");
const Firemaking = require("../../../skills/Firemaking.plugin");

const RETRY_ACTION_MS = 600;
const START_ACTION_COOLDOWN_MS = 900;
const WALK_COMMAND_COOLDOWN_MS = 900;
const POST_WITHDRAW_DELAY_MS = 350;
const BANK_SEARCH_REGION_RADIUS = 2;
const LIGHT_TILE_SEARCH_MAX_RADIUS = 8;
const LIGHT_TILE_MIN_DIST_FROM_BANK = 3;

const BANK_BOOTH_IDS = new Set(
  Object.entries(ObjectIds)
    .filter(
      ([name, id]) =>
        typeof name === "string" &&
        name.includes("BANK_BOOTH") &&
        Number.isInteger(id)
    )
    .map(([, id]) => id)
);

function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class FiremakingBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
  }

  registerEvents({ api }) {
    api.onFiremakingBlocked((event) => {
      const nowMs = Date.now();
      this.handleFiremakingBlockedEvent(event, nowMs);
    });
  }

  getTraversalTarget(state) {
    return state?.firemaking?.travelTarget ?? null;
  }

  setTraversalTarget(stateOrPayload, maybeTarget) {
    const state = stateOrPayload?.state ?? stateOrPayload;
    const target = stateOrPayload?.target ?? maybeTarget;
    if (!state?.firemaking) {
      return false;
    }
    state.firemaking.travelTarget = target;
    return true;
  }

  behaviorRequirementsMet(playerOrPayload) {
    const player = playerOrPayload?.player ?? playerOrPayload;
    const inventory = player?.getInventory?.();
    if (!inventory) {
      return false;
    }
    return this.findBestLogId(inventory) != null || this.hasBankLogs(player);
  }

  activateMode({ player, state }) {
    if (!player || !state) {
      return false;
    }
    setModeFiremaking(player, state, this.behaviorMode);
    if (state.firemaking) {
      state.firemaking.nextActionAt = 0;
    }
    return true;
  }

  startMode({ player, state, nowMs, activeForMs, reason = "auto_switch" }) {
    if (!this.activateMode({ player, state })) {
      return false;
    }
    this.api?.log?.("bot_mode_switch", {
      username: player.getUsername?.(),
      mode: this.behaviorMode.FIREMAKING,
      reason,
      activeForMs,
    });
    if (state.firemaking && Number.isInteger(nowMs)) {
      state.firemaking.nextActionAt = nowMs;
    }
    return true;
  }

  onBankRunResume({ state, nowMs }) {
    if (!state?.firemaking) {
      return false;
    }
    state.firemaking.nextActionAt = nowMs;
    return true;
  }

  handleFiremakingBlockedEvent(event, nowMs = Date.now()) {
    const player = event?.player;
    if (!player?.isPlayerBot?.()) {
      return false;
    }
    const username = player.getUsername?.();
    if (!username) {
      return false;
    }
    const state = this.botStatesByName.get(username);
    if (!state || state.mode !== this.behaviorMode.FIREMAKING) {
      return false;
    }
    if (player.getForceMovement?.() != null) {
      return false;
    }
    if (player.getMovementQueue?.()?.size?.() > 0) {
      return false;
    }

    const firemaking = state.firemaking;
    const nextTile = this.findLightableTileNear(player, firemaking?.bankTarget ?? null);
    if (!nextTile) {
      return false;
    }
    queueRouteAndFlagAppearance(player, nextTile.x, nextTile.y);
    if (firemaking) {
      firemaking.phase = "to_light_tile";
      firemaking.lightTile = { x: nextTile.x, y: nextTile.y, z: nextTile.z };
      firemaking.travelTarget = { x: nextTile.x, y: nextTile.y, z: nextTile.z };
      firemaking.nextActionAt = nowMs + 500;
    }
    event.handled = true;
    this.api?.log?.("bot_firemaking_reposition", {
      username,
      toX: nextTile.x,
      toY: nextTile.y,
      toZ: nextTile.z,
    });
    return true;
  }

  handleBlocked({
    player,
    state,
    event,
    nowMs,
    traversalService,
    blockedRetargetMinDelayMs,
  }) {
    const firemaking = state?.firemaking;
    const target = firemaking?.travelTarget;
    if (!player || !target) {
      return false;
    }

    const traversalObject = traversalService.findObjectOnRoute(
      player,
      event.from,
      target
    );
    if (!traversalObject) {
      firemaking.nextActionAt = nowMs + blockedRetargetMinDelayMs;
      this.api?.log?.("firemaking_blocked_no_traversal_object", {
        username: player.getUsername?.(),
        phase: firemaking?.phase ?? null,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
      });
      return true;
    }

    const currentY = player.getLocation().getY();
    const objectY = traversalObject.getLocation().getY();
    if (!traversalService.isObjectBetween(currentY, target.y, objectY)) {
      firemaking.nextActionAt = nowMs + blockedRetargetMinDelayMs;
      this.api?.log?.("firemaking_blocked_traversal_not_between", {
        username: player.getUsername?.(),
        phase: firemaking?.phase ?? null,
        currentY,
        targetY: target.y,
        objectX: traversalObject.getLocation().getX(),
        objectY,
        objectZ: traversalObject.getLocation().getZ(),
      });
      return true;
    }

    const requested = traversalService.requestCross(
      player,
      state,
      traversalObject,
      nowMs
    );
    this.api?.log?.("firemaking_blocked_request_cross", {
      username: player.getUsername?.(),
      phase: firemaking?.phase ?? null,
      requested,
      objectX: traversalObject.getLocation().getX(),
      objectY: traversalObject.getLocation().getY(),
      objectZ: traversalObject.getLocation().getZ(),
      targetX: target.x,
      targetY: target.y,
      targetZ: target.z,
    });
    return true;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.FIREMAKING,
      requireNotBusy: false,
    });
    if (!resolved) {
      return "failure";
    }

    const { player, state, nowMs } = resolved;
    const firemaking = state.firemaking;
    if (!firemaking) {
      return "failure";
    }
    this.ensureState(firemaking);

    if (nowMs < (firemaking.nextActionAt ?? 0)) {
      return "running";
    }

    const inventory = player.getInventory?.();
    if (!inventory) {
      return "failure";
    }

    const logId = this.findBestLogId(inventory);
    if (!logId) {
      return this.acquireLogsFromBank(player, state, nowMs);
    }

    if (firemaking.phase === "to_light_tile") {
      this.moveToLightTile(player, state, nowMs);
      return "running";
    }
    firemaking.phase = "burning";
    firemaking.travelTarget = null;

    if (player.getForceMovement?.() != null) {
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return "running";
    }
    if (player.getMovementQueue?.()?.size?.() > 0) {
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return "running";
    }

    if (Firemaking.isFiremakingActive?.(player)) {
      firemaking.nextActionAt = nowMs + START_ACTION_COOLDOWN_MS;
      return "running";
    }

    const started =
      Firemaking.startBotInventoryFiremaking?.(player, logId) === true;
    firemaking.nextActionAt =
      nowMs + (started ? START_ACTION_COOLDOWN_MS : RETRY_ACTION_MS);
    return "running";
  }

  ensureState(firemaking) {
    if (!firemaking) {
      return;
    }
    if (!firemaking.phase) {
      firemaking.phase = "burning";
    }
    if (!Number.isInteger(firemaking.nextActionAt)) {
      firemaking.nextActionAt = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(firemaking, "bankTarget")) {
      firemaking.bankTarget = null;
    }
    if (!Object.prototype.hasOwnProperty.call(firemaking, "lightTile")) {
      firemaking.lightTile = null;
    }
    if (!Object.prototype.hasOwnProperty.call(firemaking, "travelTarget")) {
      firemaking.travelTarget = null;
    }
  }

  findBestLogId(inventory) {
    for (let i = Woodcutting.TREE_LOG_IDS.length - 1; i >= 0; i--) {
      const logId = Woodcutting.TREE_LOG_IDS[i];
      if (inventory.contains(logId) && Firemaking.isWoodcuttingLog?.(logId)) {
        return logId;
      }
    }
    return null;
  }

  hasBankLogs(player) {
    for (let i = Woodcutting.TREE_LOG_IDS.length - 1; i >= 0; i--) {
      const logId = Woodcutting.TREE_LOG_IDS[i];
      const tab = Bank.getTabForItem(player, logId);
      const bank = player.getBank?.(tab);
      if ((bank?.getAmount?.(logId) ?? 0) > 0) {
        return true;
      }
    }
    return false;
  }

  acquireLogsFromBank(player, state, nowMs) {
    const firemaking = state.firemaking;
    if (!this.hasBankLogs(player)) {
      firemaking.travelTarget = null;
      setModeWoodcutting(player, state, this.behaviorMode);
      this.api?.log?.("bot_mode_switch", {
        username: player.getUsername?.(),
        mode: this.behaviorMode.WOODCUTTING,
        reason: "firemaking_no_logs_in_bank",
      });
      return "running";
    }

    if (firemaking.phase !== "to_light_tile") {
      firemaking.phase = "to_bank";
      firemaking.lightTile = null;
      firemaking.travelTarget = null;
    }

    if (firemaking.phase === "to_light_tile") {
      this.moveToLightTile(player, state, nowMs);
      return "running";
    }

    let bankBooth = this.resolveTargetBankBooth(player, firemaking.bankTarget);
    if (!bankBooth) {
      this.ensureNearbyRegionsLoaded(player);
      bankBooth = this.findNearestBankBooth(player);
      if (!bankBooth) {
        firemaking.bankTarget = null;
        firemaking.travelTarget = null;
        firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
        this.api?.log?.("firemaking_no_booth_found", {
          username: player.getUsername?.(),
          x: player.getLocation().getX(),
          y: player.getLocation().getY(),
          z: player.getLocation().getZ(),
        });
        return "running";
      }

      firemaking.bankTarget = {
        objectId: bankBooth.getId(),
        x: bankBooth.getLocation().getX(),
        y: bankBooth.getLocation().getY(),
        z: bankBooth.getLocation().getZ(),
      };
    }
    firemaking.travelTarget = {
      x: bankBooth.getLocation().getX(),
      y: bankBooth.getLocation().getY(),
      z: bankBooth.getLocation().getZ(),
    };

    if (player.getForceMovement?.() != null) {
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return "running";
    }
    if (player.getMovementQueue?.()?.size?.() > 0) {
      return "running";
    }

    player.getMovementQueue().walkToObject(bankBooth, {
      execute: () => {
        if (state.mode !== this.behaviorMode.FIREMAKING || !state.firemaking) {
          return;
        }
        const fireState = state.firemaking;
        const boothLoc = bankBooth.getLocation();
        player.setPositionToFace(boothLoc);
        const handled = PluginManager.emitObjectInteraction({
          player,
          object: bankBooth,
          objectId: bankBooth.getId(),
          clickType: 1,
          location: {
            x: boothLoc.getX(),
            y: boothLoc.getY(),
            z: boothLoc.getZ(),
          },
          sourceLocation: {
            x: player.getLocation().getX(),
            y: player.getLocation().getY(),
            z: player.getLocation().getZ(),
          },
          handled: false,
        });

        const withdrew = this.withdrawLogsFromBank(player);
        this.api?.log?.("firemaking_bank_withdraw", {
          username: player.getUsername?.(),
          handled,
          objectId: bankBooth.getId(),
          withdrewLogId: withdrew.logId,
          withdrewAmount: withdrew.amount,
        });

        if (withdrew.amount <= 0) {
          setModeWoodcutting(player, state, this.behaviorMode);
          this.api?.log?.("bot_mode_switch", {
            username: player.getUsername?.(),
            mode: this.behaviorMode.WOODCUTTING,
            reason: "firemaking_bank_empty_after_arrival",
          });
          return;
        }

        fireState.phase = "to_light_tile";
        fireState.lightTile = this.findLightableTileNear(
          player,
          fireState.bankTarget
        );
        fireState.travelTarget = fireState.lightTile
          ? {
              x: fireState.lightTile.x,
              y: fireState.lightTile.y,
              z: fireState.lightTile.z,
            }
          : null;
        fireState.nextActionAt = Date.now() + POST_WITHDRAW_DELAY_MS;
      },
    });

    firemaking.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
    return "running";
  }

  withdrawLogsFromBank(player) {
    const inventory = player.getInventory?.();
    if (!inventory) {
      return { logId: null, amount: 0 };
    }
    const freeSlots = inventory.getFreeSlots?.() ?? 0;
    if (freeSlots <= 0) {
      return { logId: null, amount: 0 };
    }

    for (let i = Woodcutting.TREE_LOG_IDS.length - 1; i >= 0; i--) {
      const logId = Woodcutting.TREE_LOG_IDS[i];
      if (!Firemaking.isWoodcuttingLog?.(logId)) {
        continue;
      }
      const tab = Bank.getTabForItem(player, logId);
      const bank = player.getBank?.(tab);
      const available = bank?.getAmount?.(logId) ?? 0;
      if (available <= 0) {
        continue;
      }
      const withdrawAmount = Math.min(available, freeSlots);
      bank.deleteNumber(logId, withdrawAmount);
      inventory.adds(logId, withdrawAmount);
      inventory.refreshItems?.();
      bank.refreshItems?.();
      return { logId, amount: withdrawAmount };
    }
    return { logId: null, amount: 0 };
  }

  moveToLightTile(player, state, nowMs) {
    const firemaking = state.firemaking;
    if (!this.findBestLogId(player.getInventory?.())) {
      firemaking.phase = "to_bank";
      firemaking.lightTile = null;
      firemaking.travelTarget = null;
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return;
    }

    if (
      !firemaking.lightTile ||
      !this.isTileLightable(
        firemaking.lightTile.x,
        firemaking.lightTile.y,
        firemaking.lightTile.z
      )
    ) {
      firemaking.lightTile = this.findLightableTileNear(
        player,
        firemaking.bankTarget
      );
    }

    const target = firemaking.lightTile;
    if (!target) {
      firemaking.travelTarget = null;
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return;
    }
    firemaking.travelTarget = {
      x: target.x,
      y: target.y,
      z: target.z,
    };

    if (this.isAtTarget(player, target)) {
      firemaking.phase = "burning";
      firemaking.travelTarget = null;
      firemaking.nextActionAt = nowMs;
      this.api?.log?.("firemaking_light_tile_reached", {
        username: player.getUsername?.(),
        x: target.x,
        y: target.y,
        z: target.z,
      });
      return;
    }

    if (player.getForceMovement?.() != null) {
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return;
    }
    if (player.getMovementQueue?.()?.size?.() > 0) {
      firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return;
    }

    queueRouteAndFlagAppearance(player, target.x, target.y);
    firemaking.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
    this.api?.log?.("firemaking_move_to_light_tile", {
      username: player.getUsername?.(),
      x: target.x,
      y: target.y,
      z: target.z,
    });
  }

  findLightableTileNear(player, bankTarget) {
    const loc = player.getLocation?.();
    if (!loc) {
      return null;
    }
    const baseX = loc.getX();
    const baseY = loc.getY();
    const z = loc.getZ();
    const bankX = bankTarget?.x ?? null;
    const bankY = bankTarget?.y ?? null;
    const minDistSq = LIGHT_TILE_MIN_DIST_FROM_BANK * LIGHT_TILE_MIN_DIST_FROM_BANK;

    for (let radius = 1; radius <= LIGHT_TILE_SEARCH_MAX_RADIUS; radius++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const dx = randomInRange(-radius, radius);
        const dy = randomInRange(-radius, radius);
        const x = baseX + dx;
        const y = baseY + dy;
        if (x === baseX && y === baseY) {
          continue;
        }
        if (!this.isTileLightable(x, y, z)) {
          continue;
        }
        if (bankX != null && bankY != null) {
          const bdx = x - bankX;
          const bdy = y - bankY;
          if (bdx * bdx + bdy * bdy < minDistSq) {
            continue;
          }
        }
        return { x, y, z };
      }
    }
    return null;
  }

  isTileLightable(x, y, z) {
    return !ObjectManager.existsLocation(new Location(x, y, z));
  }

  isAtTarget(player, target) {
    if (!player || !target) {
      return false;
    }
    const loc = player.getLocation();
    return (
      loc.getX() === target.x &&
      loc.getY() === target.y &&
      loc.getZ() === target.z
    );
  }

  ensureNearbyRegionsLoaded(player) {
    const loc = player?.getLocation?.();
    if (!loc) {
      return;
    }
    const baseX = loc.getX();
    const baseY = loc.getY();
    for (let rx = -BANK_SEARCH_REGION_RADIUS; rx <= BANK_SEARCH_REGION_RADIUS; rx++) {
      for (let ry = -BANK_SEARCH_REGION_RADIUS; ry <= BANK_SEARCH_REGION_RADIUS; ry++) {
        RegionManager.loadMapFiles(baseX + rx * 64, baseY + ry * 64);
      }
    }
  }

  resolveTargetBankBooth(player, target) {
    if (!player || !target) {
      return null;
    }
    const loc = new Location(target.x, target.y, target.z);
    const object = MapObjects.get(target.objectId, loc, player.getPrivateArea());
    if (!object || !BANK_BOOTH_IDS.has(object.getId())) {
      return null;
    }
    return object;
  }

  findNearestBankBooth(player) {
    const loc = player?.getLocation?.();
    if (!loc) {
      return null;
    }
    const privateArea = player.getPrivateArea();
    let nearest = null;
    let bestDistSq = Number.MAX_SAFE_INTEGER;

    for (const objects of MapObjects.mapObjects.values()) {
      if (!objects || objects.length === 0) {
        continue;
      }
      for (const object of objects) {
        if (!object || !BANK_BOOTH_IDS.has(object.getId())) {
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
          nearest = object;
        }
      }
    }

    return nearest;
  }
}

module.exports = {
  FiremakingBehavior,
};
