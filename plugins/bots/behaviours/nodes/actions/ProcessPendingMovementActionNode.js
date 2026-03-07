const { resolveBotNodeContext } = require("../context/BotNodeContext");
const {
  clearMovementRequest,
  dispatchMovementRequest,
  peekMovementRequest,
} = require("../../navigation/BotNavigation");

const MOVEMENT_DISPATCH_LOG_INTERVAL_MS = 4000;
const lastMovementDispatchLogByUsername = new Map();

class ProcessPendingMovementActionNode {
  constructor(botStatesByName, api) {
    this.botStatesByName = botStatesByName;
    this.api = api;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requireNotBusy: false,
      requireNoTraversalTransition: false,
      requireNotInCombat: false,
    });
    if (!resolved) {
      return "failure";
    }

    const { player } = resolved;
    const request = peekMovementRequest(player);
    if (!request) {
      return "failure";
    }

    const loc = player.getLocation?.();
    if (!loc) {
      clearMovementRequest(player);
      return "failure";
    }

    if (loc.getX() === request.x && loc.getY() === request.y) {
      clearMovementRequest(player);
      return "success";
    }

    if (player.getForceMovement?.() != null) {
      return "running";
    }

    const queue = player.getMovementQueue?.();
    if (!queue) {
      clearMovementRequest(player);
      return "failure";
    }
    if (queue.size?.() > 0) {
      return "running";
    }

    const segmentTarget = dispatchMovementRequest(player, request);
    const latestRequest = peekMovementRequest(player);
    // Path dispatch can emit path-blocked hooks which enqueue a replacement
    // movement request in the same tick. Only clear if nothing replaced it.
    if (!latestRequest || latestRequest === request) {
      clearMovementRequest(player);
    }
    if (!segmentTarget) {
      return "failure";
    }

    if (this.api?.log) {
      const username = player.getUsername?.();
      const nowMs = Number.isFinite(resolved?.nowMs) ? resolved.nowMs : Date.now();
      const lastLogAt = username ? lastMovementDispatchLogByUsername.get(username) ?? 0 : 0;
      if (!username || nowMs - lastLogAt >= MOVEMENT_DISPATCH_LOG_INTERVAL_MS) {
        if (username) {
          lastMovementDispatchLogByUsername.set(username, nowMs);
        }
        this.api.log("bot_movement_node_dispatch", {
          username: username ?? null,
          targetX: request.x,
          targetY: request.y,
          targetZ: request.z,
          segmentX: segmentTarget.x,
          segmentY: segmentTarget.y,
          reason: request.reason ?? null,
        });
      }
    }
    return "running";
  }
}

module.exports = {
  ProcessPendingMovementActionNode,
};
