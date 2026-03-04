const { queueRouteAndFlagAppearance } = require("../navigation/BotNavigation");

const RETRY_WAIT_LOG_INTERVAL_MS = 3000;
const TRANSITION_WAIT_LOG_INTERVAL_MS = 2500;

class DitchTraversalService {
  constructor({
    api,
    traversalAssist,
    objectId,
    emitObjectInteraction,
    options,
  }) {
    this.api = api;
    this.traversalAssist = traversalAssist;
    this.objectId = objectId;
    this.behaviorMode = options.behaviorMode;
    this.ditchAttemptCooldownMs = options.ditchAttemptCooldownMs;
    this.ditchPostCrossRetryDelayMs = options.ditchPostCrossRetryDelayMs;
    this.ditchTransitionTimeoutMs = options.ditchTransitionTimeoutMs;
    this.emitObjectInteraction =
      typeof emitObjectInteraction === "function"
        ? emitObjectInteraction
        : () => false;
  }

  clearMovementQueue(player) {
    if (!player) {
      return;
    }
    player.getMovementQueue()?.walkToReset?.();
    player.getMovementQueue()?.reset?.();
  }

  getTraversalTarget(state) {
    if (!state) {
      return null;
    }
    if (state.mode === this.behaviorMode.WOODCUTTING) {
      return state.woodcutting?.target ?? null;
    }
    if (state.mode === this.behaviorMode.MINING) {
      return state.mining?.target ?? null;
    }
    if (state.mode === this.behaviorMode.BANK_RUN) {
      return state.bankRun?.travelTarget ?? null;
    }
    return state.roaming?.target ?? null;
  }

  setTraversalTarget(state, target) {
    if (!state) {
      return;
    }
    if (state.mode === this.behaviorMode.WOODCUTTING) {
      if (!state.woodcutting) {
        return;
      }
      state.woodcutting.target = target;
      return;
    }
    if (state.mode === this.behaviorMode.MINING) {
      if (!state.mining) {
        return;
      }
      state.mining.target = target;
      return;
    }
    if (state.mode === this.behaviorMode.BANK_RUN) {
      if (!state.bankRun) {
        return;
      }
      state.bankRun.travelTarget = target;
      return;
    }
    if (!state.roaming) {
      return;
    }
    state.roaming.target = target;
  }

  getModeContext(state) {
    if (!state) {
      return { mode: null, bankRunPhase: null };
    }
    return {
      mode: state.mode ?? null,
      bankRunPhase:
        state.mode === this.behaviorMode.BANK_RUN
          ? state.bankRun?.phase ?? null
          : null,
    };
  }

  findObjectOnRoute(player, from, to) {
    if (!player || !from || !to || !this.traversalAssist) {
      return null;
    }
    return this.traversalAssist.findObjectOnRoute(
      player,
      from,
      to,
      this.objectId
    );
  }

  isObjectBetween(fromY, targetY, objectY) {
    if (fromY === targetY) {
      return false;
    }
    return (
      (fromY < objectY && targetY > objectY) ||
      (fromY > objectY && targetY < objectY)
    );
  }

  requestCross(player, state, traversalObject, nowMs = Date.now()) {
    if (!player || !state || !traversalObject) {
      return false;
    }
    const traversalTarget = this.getTraversalTarget(state);
    if (!traversalTarget) {
      return false;
    }

    if (nowMs < state.nextDitchAttemptAt) {
      if (
        !Number.isInteger(state.lastDitchAttemptCooldownLogAt) ||
        nowMs - state.lastDitchAttemptCooldownLogAt >= RETRY_WAIT_LOG_INTERVAL_MS
      ) {
        state.lastDitchAttemptCooldownLogAt = nowMs;
        this.api.log("ditch_cross_cooldown_active", {
          username: player.getUsername(),
          nextAttemptAt: state.nextDitchAttemptAt,
          remainingMs: Math.max(0, state.nextDitchAttemptAt - nowMs),
          ...this.getModeContext(state),
        });
      }
      return false;
    }
    state.nextDitchAttemptAt = nowMs + this.ditchAttemptCooldownMs;

    const objectY = traversalObject.getLocation().getY();
    const startSide = player.getLocation().getY() <= objectY ? "south" : "north";
    state.awaitingDitchTransition = {
      ditchY: objectY,
      startSide,
      sourceX: player.getLocation().getX(),
      sourceY: player.getLocation().getY(),
      sourceZ: player.getLocation().getZ(),
      targetX: traversalTarget.x ?? player.getLocation().getX(),
      targetY: traversalTarget.y ?? player.getLocation().getY(),
      targetZ: traversalTarget.z ?? player.getLocation().getZ(),
      startedAt: nowMs,
      lastWaitLogAt: 0,
    };

    player.getMovementQueue().walkToObject(traversalObject, {
      execute: () => {
        const transition = state.awaitingDitchTransition;
        const executedAt = Date.now();
        if (transition) {
          transition.startedAt = executedAt;
          transition.sourceX = player.getLocation().getX();
          transition.sourceY = player.getLocation().getY();
          transition.sourceZ = player.getLocation().getZ();
        }
        this.clearMovementQueue(player);
        player.setPositionToFace(traversalObject.getLocation());
        const handled = this.emitObjectInteraction({
          player,
          object: traversalObject,
          objectId: traversalObject.getId(),
          clickType: 1,
          location: {
            x: traversalObject.getLocation().getX(),
            y: traversalObject.getLocation().getY(),
            z: traversalObject.getLocation().getZ(),
          },
          sourceLocation: {
            x: transition?.sourceX ?? player.getLocation().getX(),
            y: transition?.sourceY ?? player.getLocation().getY(),
            z: transition?.sourceZ ?? player.getLocation().getZ(),
          },
          handled: false,
        });
        this.api.log("ditch_cross_execute", {
          username: player.getUsername(),
          objectX: traversalObject.getLocation().getX(),
          objectY: traversalObject.getLocation().getY(),
          objectZ: traversalObject.getLocation().getZ(),
          handled,
          ...this.getModeContext(state),
        });

        if (!handled) {
          state.awaitingDitchTransition = null;
          this.api.log("ditch_cross_not_handled", {
            username: player.getUsername(),
            objectX: traversalObject.getLocation().getX(),
            objectY: traversalObject.getLocation().getY(),
            objectZ: traversalObject.getLocation().getZ(),
            ...this.getModeContext(state),
          });
        }
      },
    });

    this.api.log("ditch_cross_requested", {
      username: player.getUsername(),
      objectX: traversalObject.getLocation().getX(),
      objectY,
      objectZ: traversalObject.getLocation().getZ(),
      target: this.getTraversalTarget(state),
      ...this.getModeContext(state),
    });
    return true;
  }

  processTransition(player, state, nowMs = Date.now()) {
    const transition = state.awaitingDitchTransition;
    if (!transition) {
      return;
    }

    if (nowMs - transition.startedAt > this.ditchTransitionTimeoutMs) {
      this.completeTransitionWithRetry(
        player,
        state,
        transition,
        "timeout",
        nowMs
      );
      return;
    }

    if (player.getForceMovement() != null) {
      if (
        !Number.isInteger(transition.lastWaitLogAt) ||
        nowMs - transition.lastWaitLogAt >= TRANSITION_WAIT_LOG_INTERVAL_MS
      ) {
        transition.lastWaitLogAt = nowMs;
        this.api.log("ditch_cross_waiting_force_movement", {
          username: player.getUsername(),
          elapsedMs: nowMs - transition.startedAt,
          ditchY: transition.ditchY,
          startSide: transition.startSide,
          currentX: player.getLocation().getX(),
          currentY: player.getLocation().getY(),
          currentZ: player.getLocation().getZ(),
          ...this.getModeContext(state),
        });
      }
      return;
    }

    const currentY = player.getLocation().getY();
    const crossed =
      transition.startSide === "south"
        ? currentY > transition.ditchY
        : currentY < transition.ditchY;

    if (!crossed) {
      if (
        !Number.isInteger(transition.lastWaitLogAt) ||
        nowMs - transition.lastWaitLogAt >= TRANSITION_WAIT_LOG_INTERVAL_MS
      ) {
        transition.lastWaitLogAt = nowMs;
        this.api.log("ditch_cross_waiting_position", {
          username: player.getUsername(),
          elapsedMs: nowMs - transition.startedAt,
          ditchY: transition.ditchY,
          startSide: transition.startSide,
          currentX: player.getLocation().getX(),
          currentY,
          currentZ: player.getLocation().getZ(),
          ...this.getModeContext(state),
        });
      }
      return;
    }

    this.completeTransitionWithRetry(
      player,
      state,
      transition,
      "completed",
      nowMs
    );
  }

  processPendingRetry(player, state, nowMs = Date.now()) {
    const retry = state.roaming?.pendingRetry;
    if (!retry) {
      return;
    }
    if (nowMs < retry.readyAt) {
      return;
    }
    const queueSize = player.getMovementQueue?.()?.size?.() ?? 0;
    const forceMovement = player.getForceMovement() != null;
    if (forceMovement || queueSize > 0) {
      if (!Number.isInteger(retry.waitingSince)) {
        retry.waitingSince = nowMs;
      }
      if (
        !Number.isInteger(retry.lastWaitLogAt) ||
        nowMs - retry.lastWaitLogAt >= RETRY_WAIT_LOG_INTERVAL_MS
      ) {
        retry.lastWaitLogAt = nowMs;
        this.api.log("ditch_post_delay_retry_waiting", {
          username: player.getUsername(),
          retryX: retry.x,
          retryY: retry.y,
          retryZ: retry.z,
          queueSize,
          forceMovement,
          waitedMs: nowMs - retry.waitingSince,
          ...this.getModeContext(state),
        });
      }
      return;
    }

    state.roaming.pendingRetry = null;
    this.setTraversalTarget(state, { x: retry.x, y: retry.y, z: retry.z });
    this.clearMovementQueue(player);
    queueRouteAndFlagAppearance(player, retry.x, retry.y);
    this.api.log("ditch_post_delay_retry_walk", {
      username: player.getUsername(),
      retryX: retry.x,
      retryY: retry.y,
      retryZ: retry.z,
      ...this.getModeContext(state),
    });
  }

  completeTransitionWithRetry(
    player,
    state,
    transition,
    reason,
    nowMs = Date.now()
  ) {
    state.awaitingDitchTransition = null;
    if (!state.roaming) {
      return;
    }
    this.setTraversalTarget(state, {
      x: transition.targetX,
      y: transition.targetY,
      z: transition.targetZ,
    });

    const readyAt = nowMs + this.ditchPostCrossRetryDelayMs;
    state.roaming.pendingRetry = {
      x: transition.targetX,
      y: transition.targetY,
      z: transition.targetZ,
      readyAt,
      waitingSince: null,
      lastWaitLogAt: 0,
    };
    state.roaming.nextWalkAt = readyAt;
    state.nextDitchAttemptAt = readyAt;

    if (state.mode === this.behaviorMode.BANK_RUN && state.bankRun) {
      state.bankRun.nextActionAt = Math.min(
        Number(state.bankRun.nextActionAt ?? readyAt),
        readyAt
      );
    }

    this.clearMovementQueue(player);

    const eventName =
      reason === "timeout"
        ? "ditch_cross_timeout_delay_retry_walk"
        : "ditch_cross_completed_delay_retry_walk";

    this.api.log(eventName, {
      username: player.getUsername(),
      reason,
      elapsedMs: nowMs - Number(transition.startedAt ?? nowMs),
      sourceX: transition.sourceX,
      sourceY: transition.sourceY,
      sourceZ: transition.sourceZ,
      retryX: transition.targetX,
      retryY: transition.targetY,
      retryZ: transition.targetZ,
      retryInMs: this.ditchPostCrossRetryDelayMs,
      currentX: player.getLocation().getX(),
      currentY: player.getLocation().getY(),
      currentZ: player.getLocation().getZ(),
      ...this.getModeContext(state),
    });
  }
}

module.exports = {
  DitchTraversalService,
};
