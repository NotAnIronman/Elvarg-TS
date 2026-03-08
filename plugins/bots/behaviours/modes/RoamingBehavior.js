const {
  chooseNextTarget,
  isAtTarget,
  queueRouteAndFlagAppearance,
  randomInRange,
  retargetAfterBlocked,
} = require("../navigation/BotNavigation");
const {
  handlePlayerAttackReaction,
} = require("../policies/PlayerAttackReactionPolicy");
const { clearFollowState, setModeRoaming } = require("../state/PlayerBotState");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");

class RoamingBehavior {
  constructor(botStatesByName, options) {
    this.botStatesByName = botStatesByName;
    this.api = options.api ?? null;
    this.behaviorMode = options.behaviorMode;
    this.endpointLingerMs = options.endpointLingerMs;
    this.botWalkRadius = options.botWalkRadius;
    this.roamingMinMs = options.roamingMinMs ?? 22000;
    this.roamingMaxMs = options.roamingMaxMs ?? 80000;
    this.objectSearch = options.objectSearch ?? null;
    this.wildernessDitchObjectId = Number.isFinite(options.wildernessDitchObjectId)
      ? options.wildernessDitchObjectId
      : null;
    this.roamingDitchCrossMaxDistanceY = Number.isFinite(
      options.roamingDitchCrossMaxDistanceY
    )
      ? Math.max(0, Math.floor(options.roamingDitchCrossMaxDistanceY))
      : 12;
    this.ditchProbeRadius = Number.isFinite(options.ditchProbeRadius)
      ? Math.max(1, Math.floor(options.ditchProbeRadius))
      : Math.max(12, this.botWalkRadius * 3);
  }

  resolveNearestDitchY(player, preferredY = null) {
    if (Number.isFinite(preferredY)) {
      return preferredY;
    }
    if (
      !player ||
      !this.objectSearch?.findNearestObject ||
      !Number.isFinite(this.wildernessDitchObjectId)
    ) {
      return null;
    }
    const ditchObject = this.objectSearch.findNearestObject(
      player,
      this.wildernessDitchObjectId,
      this.ditchProbeRadius
    );
    const ditchY = ditchObject?.getLocation?.()?.getY?.();
    return Number.isFinite(ditchY) ? ditchY : null;
  }

  buildRoamingTargetConstraint(player, ditchYHint = null) {
    const currentY = player?.getLocation?.()?.getY?.();
    if (!Number.isFinite(currentY)) {
      return null;
    }
    const ditchY = this.resolveNearestDitchY(player, ditchYHint);
    if (!Number.isFinite(ditchY)) {
      return null;
    }
    if (Math.abs(currentY - ditchY) <= this.roamingDitchCrossMaxDistanceY) {
      return null;
    }
    const keepSouthSide = currentY <= ditchY;
    return {
      ditchY,
      acceptTarget: (target) => {
        if (!target || !Number.isFinite(target.y)) {
          return false;
        }
        return keepSouthSide ? target.y <= ditchY : target.y >= ditchY;
      },
    };
  }

  chooseRoamingTarget(player, state, ditchYHint = null) {
    const constraint = this.buildRoamingTargetConstraint(player, ditchYHint);
    const chooseOptions = constraint ? { acceptTarget: constraint.acceptTarget } : {};
    return {
      target: chooseNextTarget(player, state, this.botWalkRadius, chooseOptions),
      chooseOptions,
      constraintApplied: !!constraint,
    };
  }

  activateMode({ player, state }) {
    if (!player || !state) {
      return false;
    }
    setModeRoaming(player, state, this.behaviorMode);
    return true;
  }

  startMode({ player, state, nowMs, activeForMs, reason = "auto_switch" }) {
    if (!this.activateMode({ player, state })) {
      return false;
    }
    if (!state.autonomy) {
      state.autonomy = {
        nextDecisionAt: 0,
        modeEndsAt: 0,
        pvpCooldownUntil: 0,
        manualMode: null,
      };
    }
    const durationMs =
      Number.isInteger(activeForMs) && activeForMs > 0
        ? activeForMs
        : randomInRange(this.roamingMinMs, this.roamingMaxMs);
    if (Number.isInteger(nowMs)) {
      state.autonomy.modeEndsAt = nowMs + durationMs;
    }
    this.api?.log?.("bot_mode_switch", {
      username: player.getUsername?.(),
      mode: this.behaviorMode.ROAMING,
      reason,
      activeForMs: durationMs,
    });
    return true;
  }

  onPlayerAttackReaction(payload) {
    return handlePlayerAttackReaction({
      ...payload,
      behaviorMode: this.behaviorMode,
      api: this.api,
    });
  }

  appendStatusLines({ lines, state, nowMs, helpers = {} }) {
    if (!Array.isArray(lines) || !state?.roaming) {
      return;
    }
    const formatPoint = helpers?.formatPoint ?? (() => "n/a");
    const msRemainingLabel = helpers?.msRemainingLabel ?? (() => "n/a");
    lines.push(
      `roaming target=${formatPoint(
        state.roaming.target
      )} nextWalk=${msRemainingLabel(state.roaming.nextWalkAt, nowMs)}`
    );
  }

  handleBlocked({
    player,
    state,
    event,
    nowMs,
    traversalService,
    blockedRetargetMinDelayMs,
    blockedRetargetMaxDelayMs,
  }) {
    if (!player || !state || !traversalService) {
      return false;
    }
    if (!state.roaming?.target) {
      const { target: fallbackTarget } = this.chooseRoamingTarget(
        player,
        state,
        event?.to?.y
      );
      if (!fallbackTarget) {
        return true;
      }
      state.roaming.target = fallbackTarget;
    }

    const traversalObject = traversalService.findObjectOnRoute(
      player,
      event?.from,
      state.roaming.target
    );
    if (!traversalObject) {
      const { chooseOptions } = this.chooseRoamingTarget(player, state, event?.to?.y);
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "no_ditch_on_route",
        event,
        nowMs,
        blockedRetargetMinDelayMs,
        blockedRetargetMaxDelayMs,
        this.botWalkRadius,
        chooseOptions
      );
      return true;
    }

    const currentY = player.getLocation().getY();
    const targetY = state.roaming.target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!traversalService.isObjectBetween(currentY, targetY, objectY)) {
      const { chooseOptions } = this.chooseRoamingTarget(player, state, objectY);
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "ditch_not_between_current_and_target",
        event,
        nowMs,
        blockedRetargetMinDelayMs,
        blockedRetargetMaxDelayMs,
        this.botWalkRadius,
        chooseOptions
      );
      return true;
    }

    const requestedCross =
      traversalService.requestCross(player, state, traversalObject, nowMs) ===
      true;
    if (!requestedCross) {
      const { chooseOptions } = this.chooseRoamingTarget(player, state, objectY);
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "ditch_too_far_for_roaming_cross",
        event,
        nowMs,
        blockedRetargetMinDelayMs,
        blockedRetargetMaxDelayMs,
        this.botWalkRadius,
        chooseOptions
      );
    }
    return true;
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

    const { chooseOptions } = this.chooseRoamingTarget(player, state);
    let target = state.roaming.target;
    if (
      target &&
      typeof chooseOptions?.acceptTarget === "function" &&
      chooseOptions.acceptTarget(target) !== true
    ) {
      target = null;
    }
    if (!target) {
      target = chooseNextTarget(player, state, this.botWalkRadius, chooseOptions);
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
    const nextTarget = chooseNextTarget(
      player,
      state,
      this.botWalkRadius,
      chooseOptions
    );
    if (!nextTarget) {
      return "failure";
    }
    state.roaming.target = nextTarget;
    queueRouteAndFlagAppearance(player, nextTarget.x, nextTarget.y);
    return "success";
  }
}

const ROAMING_MODE_DESCRIPTOR = Object.freeze({
  key: "roaming",
  assignable: true,
  modeProperty: "ROAMING",
  autonomous: Object.freeze({
    strategy: "start",
    weight: 0.4,
    minMs: 22000,
    maxMs: 80000,
    priority: 60,
  }),
  requiredHooks: ["activateMode", "startMode", "handleBlocked"],
  create({ botStatesByName, api, behaviorMode, options = {}, objectSearch }) {
    return new RoamingBehavior(botStatesByName, {
      api,
      behaviorMode,
      endpointLingerMs: options.endpointLingerMs,
      botWalkRadius: options.botWalkRadius,
      roamingMinMs: options.roamingMinMs,
      roamingMaxMs: options.roamingMaxMs,
      objectSearch,
      wildernessDitchObjectId: options.wildernessDitchObjectId,
      roamingDitchCrossMaxDistanceY: options.roamingDitchCrossMaxDistanceY,
      ditchProbeRadius: options.roamingDitchProbeRadius,
    });
  },
});

module.exports = {
  RoamingBehavior,
  ROAMING_MODE_DESCRIPTOR,
};
