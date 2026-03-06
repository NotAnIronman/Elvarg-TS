const { callModeHook } = require("../hooks/ModeHookContract");

const PATH_BLOCKED_HANDLE_MIN_INTERVAL_MS = 200;

class PathBlockedHandler {
  constructor({ botStatesByName, traversalService, api, modeHandlers = {}, options }) {
    this.botStatesByName = botStatesByName;
    this.traversalService = traversalService;
    this.api = api;
    this.modeHandlers = modeHandlers;
    this.blockedRetargetMinDelayMs = options.blockedRetargetMinDelayMs;
    this.blockedRetargetMaxDelayMs = options.blockedRetargetMaxDelayMs;
  }

  handle(event, nowMs = Date.now()) {
    const state = this.botStatesByName.get(event.username);
    if (!state || state.awaitingDitchTransition) {
      return;
    }
    if (
      Number.isInteger(state.lastPathBlockedHandledAt) &&
      nowMs - state.lastPathBlockedHandledAt < PATH_BLOCKED_HANDLE_MIN_INTERVAL_MS
    ) {
      return;
    }
    state.lastPathBlockedHandledAt = nowMs;
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

    this.handleModeBlocked(state.mode, player, state, event, nowMs);
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
