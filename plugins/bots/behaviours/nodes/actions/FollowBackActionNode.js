const { World } = require("../../../../../src/main/typescript/elvarg/game/World");
const { queueRouteAndFlagAppearance } = require("../../navigation/BotNavigation");
const { setModeReturnHome } = require("../../state/PlayerBotState");
const { resolveBotNodeContext } = require("../context/BotNodeContext");

class FollowBackActionNode {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.followRepathIntervalMs = options.followRepathIntervalMs;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.FOLLOW_BACK,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    if (nowMs >= (state.followUntilMs ?? 0)) {
      setModeReturnHome(player, state, this.behaviorMode);
      this.api.log("follow_back_expired", { username: player.getUsername() });
      return "success";
    }

    const targetUsername = state.followTargetUsername;
    if (!targetUsername) {
      setModeReturnHome(player, state, this.behaviorMode);
      return "success";
    }

    const followTarget = World.getPlayerByName(targetUsername);
    if (!followTarget || !followTarget.isRegistered()) {
      setModeReturnHome(player, state, this.behaviorMode);
      this.api.log("follow_back_target_lost", {
        username: player.getUsername(),
        target: targetUsername,
      });
      return "success";
    }
    if (followTarget.getPrivateArea() != player.getPrivateArea()) {
      setModeReturnHome(player, state, this.behaviorMode);
      this.api.log("follow_back_target_private_area_mismatch", {
        username: player.getUsername(),
        target: targetUsername,
      });
      return "success";
    }

    player.setFollowing(followTarget);
    player.setMobileInteraction(followTarget);
    player.setPositionToFace(followTarget.getLocation());
    if (!state.roaming) {
      return "failure";
    }
    state.roaming.target = {
      x: followTarget.getLocation().getX(),
      y: followTarget.getLocation().getY(),
      z: followTarget.getLocation().getZ(),
    };

    if (nowMs < (state.nextFollowRepathAt ?? 0)) {
      return "running";
    }

    state.nextFollowRepathAt = nowMs + this.followRepathIntervalMs;
    if (nowMs < (state.roaming.nextWalkAt ?? 0)) {
      return "running";
    }
    if (player.getForceMovement() != null) {
      return "running";
    }

    const queue = player.getMovementQueue();
    if (!queue) {
      return "failure";
    }
    if (queue.size() > 0) {
      return "running";
    }

    let targetX = followTarget.getMovementQueue()?.followX;
    let targetY = followTarget.getMovementQueue()?.followY;
    if (targetX === -1 || targetY === -1 || targetX == null || targetY == null) {
      targetX = followTarget.getLocation().getX();
      targetY = followTarget.getLocation().getY();
    }

    queueRouteAndFlagAppearance(player, targetX, targetY);
    return "running";
  }
}

module.exports = {
  FollowBackActionNode,
};
