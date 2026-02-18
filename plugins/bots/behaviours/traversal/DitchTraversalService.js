const { queueRouteAndFlagAppearance } = require("../navigation/BotNavigation");
const { resetMovementState } = require("../state/PlayerBotState");

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

  getTraversalTarget(state) {
    if (!state) {
      return null;
    }
    if (state.mode === this.behaviorMode.WOODCUTTING) {
      return state.woodcutting?.target ?? null;
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
    if (!state.roaming) {
      return;
    }
    state.roaming.target = target;
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
    };

    player.getMovementQueue().walkToObject(traversalObject, {
      execute: () => {
        const transition = state.awaitingDitchTransition;
        resetMovementState(player);
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

        if (!handled) {
          state.awaitingDitchTransition = null;
        }
      },
    });

    this.api.log("ditch_cross_requested", {
      username: player.getUsername(),
      objectX: traversalObject.getLocation().getX(),
      objectY,
      objectZ: traversalObject.getLocation().getZ(),
      target: this.getTraversalTarget(state),
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
      return;
    }

    const currentY = player.getLocation().getY();
    const crossed =
      transition.startSide === "south"
        ? currentY > transition.ditchY
        : currentY < transition.ditchY;

    if (!crossed) {
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
    if (player.getForceMovement() != null) {
      return;
    }
    if (player.getMovementQueue()?.size?.() > 0) {
      return;
    }

    state.roaming.pendingRetry = null;
    this.setTraversalTarget(state, { x: retry.x, y: retry.y, z: retry.z });
    resetMovementState(player);
    queueRouteAndFlagAppearance(player, retry.x, retry.y);
    this.api.log("ditch_post_delay_retry_walk", {
      username: player.getUsername(),
      retryX: retry.x,
      retryY: retry.y,
      retryZ: retry.z,
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
    };
    state.roaming.nextWalkAt = readyAt;
    state.nextDitchAttemptAt = readyAt;

    resetMovementState(player);

    const eventName =
      reason === "timeout"
        ? "ditch_cross_timeout_delay_retry_walk"
        : "ditch_cross_completed_delay_retry_walk";

    this.api.log(eventName, {
      username: player.getUsername(),
      retryX: transition.targetX,
      retryY: transition.targetY,
      retryZ: transition.targetZ,
      retryInMs: this.ditchPostCrossRetryDelayMs,
      currentX: player.getLocation().getX(),
      currentY: player.getLocation().getY(),
      currentZ: player.getLocation().getZ(),
    });
  }
}

module.exports = {
  DitchTraversalService,
};
