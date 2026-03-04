const { resolveBotNodeContext } = require("../context/BotNodeContext");
const {
  clearMovementRequest,
  dispatchMovementRequest,
  peekMovementRequest,
} = require("../../navigation/BotNavigation");

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
    clearMovementRequest(player);
    if (!segmentTarget) {
      return "failure";
    }

    if (this.api?.log) {
      this.api.log("bot_movement_node_dispatch", {
        username: player.getUsername?.(),
        targetX: request.x,
        targetY: request.y,
        targetZ: request.z,
        segmentX: segmentTarget.x,
        segmentY: segmentTarget.y,
        reason: request.reason ?? null,
      });
    }
    return "running";
  }
}

module.exports = {
  ProcessPendingMovementActionNode,
};
