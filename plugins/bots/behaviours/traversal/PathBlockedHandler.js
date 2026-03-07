const { callModeHook } = require("../hooks/ModeHookContract");

const PATH_BLOCKED_HANDLE_MIN_INTERVAL_MS = 200;
const DEFAULT_DUPLICATE_EVENT_WINDOW_MS = 650;
const DEFAULT_MEANINGFUL_RECHECK_MS = 1500;
const DEFAULT_MAX_REPEAT_BEFORE_BACKOFF = 4;
const DEFAULT_BACKOFF_BASE_MS = 400;
const DEFAULT_BACKOFF_MAX_MS = 8000;

function toTileSignature(point) {
  if (!point) {
    return "n/a";
  }
  return `${point.x ?? "?"},${point.y ?? "?"},${point.z ?? "?"}`;
}

function toTargetSignature(target) {
  if (!target) {
    return "target:n/a";
  }
  const idPart =
    Number.isInteger(target.objectId) || Number.isInteger(target.id)
      ? `:${target.objectId ?? target.id}`
      : "";
  return `target:${target.x ?? "?"},${target.y ?? "?"},${target.z ?? "?"}${idPart}`;
}

function clampMs(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

class PathBlockedHandler {
  constructor({ botStatesByName, traversalService, api, modeHandlers = {}, options = {} }) {
    this.botStatesByName = botStatesByName;
    this.traversalService = traversalService;
    this.api = api;
    this.modeHandlers = modeHandlers;
    this.blockedRetargetMinDelayMs = options.blockedRetargetMinDelayMs;
    this.blockedRetargetMaxDelayMs = options.blockedRetargetMaxDelayMs;
    this.duplicateEventWindowMs = clampMs(
      options.duplicateEventWindowMs,
      DEFAULT_DUPLICATE_EVENT_WINDOW_MS
    );
    this.meaningfulRecheckMs = clampMs(
      options.meaningfulRecheckMs,
      DEFAULT_MEANINGFUL_RECHECK_MS
    );
    this.maxRepeatBeforeBackoff = Math.max(
      1,
      clampMs(
        options.maxRepeatBeforeBackoff,
        DEFAULT_MAX_REPEAT_BEFORE_BACKOFF
      )
    );
    this.backoffBaseMs = Math.max(
      1,
      clampMs(options.backoffBaseMs, DEFAULT_BACKOFF_BASE_MS)
    );
    this.backoffMaxMs = Math.max(
      this.backoffBaseMs,
      clampMs(options.backoffMaxMs, DEFAULT_BACKOFF_MAX_MS)
    );
  }

  ensureTracker(state) {
    if (!state.pathBlockedTracker) {
      state.pathBlockedTracker = {
        lastSignature: null,
        lastMode: null,
        lastTargetSignature: null,
        repeatCount: 0,
        lastReceivedAt: 0,
        lastHandledAt: 0,
        lastMeaningfulAt: 0,
        backoffUntil: 0,
      };
    }
    return state.pathBlockedTracker;
  }

  resolveTraversalTarget(mode, state) {
    if (!mode || !state) {
      return null;
    }
    const handler = this.modeHandlers?.[mode];
    if (!handler || typeof handler.getTraversalTarget !== "function") {
      return null;
    }
    try {
      return handler.getTraversalTarget(state) ?? null;
    } catch (err) {
      this.api?.log?.("path_blocked_target_resolve_error", {
        mode,
        error: String(err?.message ?? err),
      });
      return null;
    }
  }

  buildPathBlockedSignature(mode, event, target) {
    return [
      `mode:${mode ?? "n/a"}`,
      `from:${toTileSignature(event?.from)}`,
      `to:${toTileSignature(event?.to)}`,
      toTargetSignature(target),
      `basic:${event?.basicPather === true ? 1 : 0}`,
      `size:${event?.requestedSize ?? "?"}`,
      `dir:${event?.direction ?? "?"}`,
      `mask:${event?.blockingMask ?? "?"}`,
    ].join("|");
  }

  applyBackoffIfNeeded(tracker, state, nowMs, context = {}) {
    if (!tracker || tracker.repeatCount < this.maxRepeatBeforeBackoff) {
      return;
    }
    const overflow = tracker.repeatCount - this.maxRepeatBeforeBackoff;
    const backoffMs = Math.min(
      this.backoffMaxMs,
      this.backoffBaseMs * 2 ** Math.min(overflow, 6)
    );
    const previousBackoffUntil = Number(tracker.backoffUntil ?? 0);
    const nextBackoffUntil = Math.max(previousBackoffUntil, nowMs + backoffMs);
    tracker.backoffUntil = nextBackoffUntil;
    if (state?.roaming) {
      state.roaming.nextWalkAt = Math.max(
        Number(state.roaming.nextWalkAt ?? 0),
        tracker.backoffUntil
      );
    }
    if (nextBackoffUntil > previousBackoffUntil) {
      this.api?.log?.("path_blocked_backoff_applied", {
        username: context.username ?? null,
        mode: context.mode ?? null,
        repeatCount: tracker.repeatCount,
        backoffMs,
        backoffUntil: nextBackoffUntil,
        target: context.targetSignature ?? null,
      });
    }
  }

  handle(event, nowMs = Date.now()) {
    if (!event || !event.username) {
      return;
    }
    const state = this.botStatesByName.get(event.username);
    if (!state || state.awaitingDitchTransition) {
      return;
    }
    const tracker = this.ensureTracker(state);
    if (
      Number.isInteger(tracker.lastReceivedAt) &&
      nowMs - tracker.lastReceivedAt < PATH_BLOCKED_HANDLE_MIN_INTERVAL_MS
    ) {
      return;
    }
    tracker.lastReceivedAt = nowMs;
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

    const mode = state.mode;
    const target = this.resolveTraversalTarget(mode, state);
    const targetSignature = toTargetSignature(target);
    const signature = this.buildPathBlockedSignature(mode, event, target);
    const signatureChanged = signature !== tracker.lastSignature;

    if (signatureChanged) {
      tracker.lastSignature = signature;
      tracker.repeatCount = 0;
      tracker.backoffUntil = 0;
    } else {
      tracker.repeatCount += 1;
    }

    if (!signatureChanged && nowMs < tracker.backoffUntil) {
      return;
    }

    // Debounce duplicates from repeated pathfinder failures on the same route.
    if (
      !signatureChanged &&
      nowMs - Number(tracker.lastHandledAt ?? 0) < this.duplicateEventWindowMs
    ) {
      this.applyBackoffIfNeeded(tracker, state, nowMs, {
        username: player.getUsername?.() ?? event?.username ?? null,
        mode,
        targetSignature,
      });
      return;
    }

    const modeChanged = tracker.lastMode !== mode;
    const targetChanged = tracker.lastTargetSignature !== targetSignature;
    const meaningfulChange =
      signatureChanged ||
      modeChanged ||
      targetChanged ||
      nowMs - Number(tracker.lastMeaningfulAt ?? 0) >= this.meaningfulRecheckMs;

    // Skip expensive mode-specific blocked recovery until state meaningfully changes.
    if (!meaningfulChange) {
      tracker.lastHandledAt = nowMs;
      this.applyBackoffIfNeeded(tracker, state, nowMs, {
        username: player.getUsername?.() ?? event?.username ?? null,
        mode,
        targetSignature,
      });
      return;
    }

    const handled = this.handleModeBlocked(mode, player, state, event, nowMs) === true;
    tracker.lastHandledAt = nowMs;
    tracker.lastMode = mode;
    tracker.lastTargetSignature = targetSignature;
    if (handled) {
      tracker.lastMeaningfulAt = nowMs;
    }
    this.applyBackoffIfNeeded(tracker, state, nowMs, {
      username: player.getUsername?.() ?? event?.username ?? null,
      mode,
      targetSignature,
    });
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
