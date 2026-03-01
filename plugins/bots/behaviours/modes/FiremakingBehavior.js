const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");
const { setModeWoodcutting } = require("../state/PlayerBotState");
const Woodcutting = require("../../../skills/Woodcutting.plugin");
const Firemaking = require("../../../skills/Firemaking.plugin");

const RETRY_ACTION_MS = 600;
const START_ACTION_COOLDOWN_MS = 900;

class FiremakingBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
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
    if (!state.firemaking) {
      return "failure";
    }
    if (nowMs < (state.firemaking.nextActionAt ?? 0)) {
      return "running";
    }

    const inventory = player.getInventory?.();
    if (!inventory) {
      return "failure";
    }

    const logId = this.findBestLogId(inventory);
    if (!logId) {
      setModeWoodcutting(player, state, this.behaviorMode);
      this.api?.log?.("bot_mode_switch", {
        username: player.getUsername?.(),
        mode: this.behaviorMode.WOODCUTTING,
        reason: "firemaking_out_of_logs",
      });
      return "running";
    }

    if (player.getForceMovement?.() != null) {
      state.firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return "running";
    }
    if (player.getMovementQueue?.()?.size?.() > 0) {
      state.firemaking.nextActionAt = nowMs + RETRY_ACTION_MS;
      return "running";
    }

    if (Firemaking.isFiremakingActive?.(player)) {
      state.firemaking.nextActionAt = nowMs + START_ACTION_COOLDOWN_MS;
      return "running";
    }

    const started = Firemaking.startBotInventoryFiremaking?.(player, logId) === true;
    state.firemaking.nextActionAt = nowMs + (started ? START_ACTION_COOLDOWN_MS : RETRY_ACTION_MS);
    return "running";
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
}

module.exports = {
  FiremakingBehavior,
};
