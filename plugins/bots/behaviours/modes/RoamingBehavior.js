const {
  chooseNextTarget,
  isAtTarget,
  queueRouteAndFlagAppearance,
} = require("../navigation/BotNavigation");
const { clearFollowState } = require("../state/PlayerBotState");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");

class RoamingBehavior {
  constructor(botStatesByName, options) {
    this.botStatesByName = botStatesByName;
    this.behaviorMode = options.behaviorMode;
    this.endpointLingerMs = options.endpointLingerMs;
    this.botWalkRadius = options.botWalkRadius;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.ROAMING,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    if (!state.roaming || nowMs < (state.roaming.nextWalkAt ?? 0)) {
      return "failure";
    }

    const queue = player.getMovementQueue();
    if (!queue || queue.size() > 0) {
      return "failure";
    }

    clearFollowState(player, state);

    let target = state.roaming.target;
    if (!target) {
      target = chooseNextTarget(player, state, this.botWalkRadius);
      if (!target) {
        return "failure";
      }
      state.roaming.target = target;
    }

    if (!isAtTarget(player, target)) {
      queueRouteAndFlagAppearance(player, target.x, target.y);
      return "success";
    }

    if ((state.roaming.endpointPauseUntil ?? 0) === 0) {
      state.roaming.endpointPauseUntil = nowMs + this.endpointLingerMs;
      return "failure";
    }
    if (nowMs < state.roaming.endpointPauseUntil) {
      return "failure";
    }

    state.roaming.endpointPauseUntil = 0;
    const nextTarget = chooseNextTarget(player, state, this.botWalkRadius);
    if (!nextTarget) {
      return "failure";
    }
    state.roaming.target = nextTarget;
    queueRouteAndFlagAppearance(player, nextTarget.x, nextTarget.y);
    return "success";
  }
}

module.exports = {
  RoamingBehavior,
};
