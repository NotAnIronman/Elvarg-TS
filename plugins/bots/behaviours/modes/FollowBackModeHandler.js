const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { setModeReturnHome } = require("../state/PlayerBotState");

class FollowBackModeHandler {
  constructor(options = {}) {
    this.behaviorMode = options.behaviorMode;
    this.followBlockedRetryMs = options.followBlockedRetryMs ?? 200;
  }

  handleBlocked({ player, state, event, nowMs, traversalService }) {
    if (!player || !state || !traversalService) {
      return false;
    }

    const followTarget = state.followTargetUsername
      ? World.getPlayerByName(state.followTargetUsername)
      : null;
    if (!followTarget || !followTarget.isRegistered()) {
      setModeReturnHome(player, state, this.behaviorMode);
      return true;
    }

    if (!state.roaming) {
      return true;
    }
    state.roaming.target = {
      x: followTarget.getLocation().getX(),
      y: followTarget.getLocation().getY(),
      z: followTarget.getLocation().getZ(),
    };

    const traversalObject = traversalService.findObjectOnRoute(
      player,
      event?.from,
      state.roaming.target
    );
    if (!traversalObject) {
      state.roaming.nextWalkAt = nowMs + this.followBlockedRetryMs;
      return true;
    }

    const currentY = player.getLocation().getY();
    const targetY = state.roaming.target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!traversalService.isObjectBetween(currentY, targetY, objectY)) {
      state.roaming.nextWalkAt = nowMs + this.followBlockedRetryMs;
      return true;
    }

    traversalService.requestCross(player, state, traversalObject, nowMs);
    return true;
  }
}

module.exports = {
  FollowBackModeHandler,
};
