"use strict";

class PvpJumpKilledTargetNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.resolveTargetPlayer = options.resolveTargetPlayer;
    this.isValidTarget = options.isValidTarget;
    this.setModePvp = options.setModePvp;
    this.scheduleCombatAction = options.scheduleCombatAction;
    this.scheduleReviewTimers = options.scheduleReviewTimers;
    this.applyGeneratedPvpLoadout = options.applyGeneratedPvpLoadout;
    this.randomInRange = options.randomInRange;
    this.pvpPhase = options.pvpPhase;
    this.behaviorMode = options.behaviorMode;
  }

  tick(context) {
    const { player, state, nowMs, pvpMinMs, pvpMaxMs } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp) {
      return { handled: false };
    }
    if (pvp.targetUsername) {
      return { handled: false };
    }
    if (!pvp.pjTargetUsername || nowMs >= Number(pvp.pjExpiresAt ?? 0)) {
      pvp.pjTargetUsername = null;
      pvp.pjExpiresAt = 0;
      return { handled: false };
    }

    const target = this.resolveTargetPlayer?.({
      pvp: { targetUsername: pvp.pjTargetUsername, targetPlayer: null },
    }) ?? null;
    if (!this.isValidTarget?.(player, target)) {
      pvp.pjTargetUsername = null;
      pvp.pjExpiresAt = 0;
      return { handled: false };
    }

    const durationMs = this.randomInRange?.(pvpMinMs, pvpMaxMs) ?? pvpMaxMs ?? 30000;
    if (
      !this.setModePvp?.(
        player,
        state,
        target,
        nowMs,
        durationMs,
        this.behaviorMode
      )
    ) {
      return { handled: false };
    }

    pvp.pjTargetUsername = null;
    pvp.pjExpiresAt = 0;
    pvp.phase = this.pvpPhase?.COMBAT ?? "combat";
    this.scheduleCombatAction?.(state, nowMs);
    this.scheduleReviewTimers?.(state, nowMs);
    this.applyGeneratedPvpLoadout?.(player, state);
    player.getMovementQueue?.().reset?.();
    player.getCombat?.()?.attack?.(target);
    this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
    return { handled: true, status: "running", target };
  }
}

module.exports = {
  PvpJumpKilledTargetNode,
};
