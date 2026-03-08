const { resolveBotNodeContext } = require("../context/BotNodeContext");
const {
  clearMovementRequest,
  dispatchMovementRequest,
  peekMovementRequest,
} = require("../../navigation/BotNavigation");

const MOVEMENT_DISPATCH_LOG_INTERVAL_MS = 4000;
const lastMovementDispatchLogByUsername = new Map();

class ProcessPendingMovementActionNode {
  constructor(botStatesByName, api, options = {}) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.traversalService = options.traversalService ?? null;
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

    const { player, state } = resolved;
    const nowMs = Number.isFinite(resolved?.nowMs) ? resolved.nowMs : Date.now();
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
    if (
      Number.isFinite(request.nextDispatchAtMs) &&
      request.nextDispatchAtMs > nowMs
    ) {
      return "running";
    }
    if (
      this.traversalService?.maybeRequestCrossForTarget?.(
        player,
        state,
        request,
        nowMs
      ) === true
    ) {
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

    const dispatchResult = dispatchMovementRequest(player, request);
    const latestRequest = peekMovementRequest(player);
    // Path dispatch can emit path-blocked hooks which enqueue a replacement
    // movement request in the same tick. Only clear if nothing replaced it.
    if (
      latestRequest === request &&
      dispatchResult &&
      dispatchResult.hasRoute === true
    ) {
      clearMovementRequest(player);
    }
    if (!dispatchResult || !dispatchResult.segmentTarget) {
      return "failure";
    }

    if (this.api?.log) {
      const username = player.getUsername?.();
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
          segmentX: dispatchResult.segmentTarget.x,
          segmentY: dispatchResult.segmentTarget.y,
          routeBuilt: dispatchResult.hasRoute === true,
          routeSteps: dispatchResult.steps ?? 0,
          reason: request.reason ?? null,
        });
      }
    }
    if (dispatchResult.hasRoute !== true) {
      return "running";
    }
    return "running";
  }
}

module.exports = {
  ProcessPendingMovementActionNode,
};
