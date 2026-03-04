const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { callModeHook } = require("../hooks/ModeHookContract");
const {
  chooseNextTarget,
  retargetAfterBlocked,
} = require("../navigation/BotNavigation");
const { setModeReturnHome } = require("../state/PlayerBotState");

class PathBlockedHandler {
  constructor({ botStatesByName, traversalService, api, modeHandlers = {}, options }) {
    this.botStatesByName = botStatesByName;
    this.traversalService = traversalService;
    this.api = api;
    this.modeHandlers = modeHandlers;
    this.behaviorMode = options.behaviorMode;
    this.followBlockedRetryMs = options.followBlockedRetryMs;
    this.blockedRetargetMinDelayMs = options.blockedRetargetMinDelayMs;
    this.blockedRetargetMaxDelayMs = options.blockedRetargetMaxDelayMs;
    this.botWalkRadius = options.botWalkRadius;
  }

  handle(event, nowMs = Date.now()) {
    const state = this.botStatesByName.get(event.username);
    if (!state || state.awaitingDitchTransition) {
      return;
    }
    if (nowMs < (state.roaming?.nextWalkAt ?? 0)) {
      return;
    }

    const player = event.entity;
    if (!player || !player.isRegistered()) {
      return;
    }
    if (player.getForceMovement() != null) {
      return;
    }
    if (player.getMovementQueue()?.size?.() > 0) {
      return;
    }

    if (state.mode === this.behaviorMode.RETURN_HOME) {
      return;
    }

    if (state.mode === this.behaviorMode.FOLLOW_BACK) {
      this.handleFollowBackBlocked(player, state, event, nowMs);
      return;
    }

    if (state.mode !== this.behaviorMode.ROAMING) {
      this.handleModeBlocked(state.mode, player, state, event, nowMs);
      return;
    }

    this.handleRoamBlocked(player, state, event, nowMs);
  }

  handleFollowBackBlocked(player, state, event, nowMs) {
    const followTarget = state.followTargetUsername
      ? World.getPlayerByName(state.followTargetUsername)
      : null;

    if (!followTarget || !followTarget.isRegistered()) {
      setModeReturnHome(player, state, this.behaviorMode);
      return;
    }

    if (!state.roaming) {
      return;
    }
    state.roaming.target = {
      x: followTarget.getLocation().getX(),
      y: followTarget.getLocation().getY(),
      z: followTarget.getLocation().getZ(),
    };

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      state.roaming.target
    );
    if (!traversalObject) {
      state.roaming.nextWalkAt = nowMs + this.followBlockedRetryMs;
      return;
    }

    const currentY = player.getLocation().getY();
    const targetY = state.roaming.target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, targetY, objectY)) {
      state.roaming.nextWalkAt = nowMs + this.followBlockedRetryMs;
      return;
    }

    this.traversalService.requestCross(player, state, traversalObject, nowMs);
  }

  handleRoamBlocked(player, state, event, nowMs) {
    if (!state.roaming?.target) {
      const fallbackTarget = chooseNextTarget(
        player,
        state,
        this.botWalkRadius
      );
      if (!fallbackTarget) {
        return;
      }
      state.roaming.target = fallbackTarget;
    }

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      state.roaming.target
    );
    if (!traversalObject) {
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "no_ditch_on_route",
        event,
        nowMs,
        this.blockedRetargetMinDelayMs,
        this.blockedRetargetMaxDelayMs,
        this.botWalkRadius
      );
      return;
    }

    const currentY = player.getLocation().getY();
    const targetY = state.roaming.target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, targetY, objectY)) {
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "ditch_not_between_current_and_target",
        event,
        nowMs,
        this.blockedRetargetMinDelayMs,
        this.blockedRetargetMaxDelayMs,
        this.botWalkRadius
      );
      return;
    }

    this.traversalService.requestCross(player, state, traversalObject, nowMs);
  }

  handleModeBlocked(mode, player, state, event, nowMs) {
    return (
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "handleBlocked",
        payload: {
          player,
          state,
          event,
          nowMs,
          traversalService: this.traversalService,
          blockedRetargetMinDelayMs: this.blockedRetargetMinDelayMs,
          blockedRetargetMaxDelayMs: this.blockedRetargetMaxDelayMs,
        },
        fallback: false,
        api: this.api,
        errorEvent: "bot_mode_blocked_handler_error",
      }) === true
    );
  }
}

module.exports = {
  PathBlockedHandler,
};
