"use strict";

class PvpCombatExecutionNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.tryStepOutOfStack = options.tryStepOutOfStack;
    this.maybeSwitchBackToPrimaryWeapon = options.maybeSwitchBackToPrimaryWeapon;
    this.maybeUseSpecialAttack = options.maybeUseSpecialAttack;
    this.scheduleCombatAction = options.scheduleCombatAction;
    this.scheduleSpecReview = options.scheduleSpecReview;
    this.scheduleReviewTimers = options.scheduleReviewTimers;
    this.pvpPhase = options.pvpPhase;
  }

  tick(context) {
    const { player, state, nowMs, target } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp || !target) {
      return "failure";
    }

    if (player.getFollowing?.() !== target) {
      player.setFollowing?.(target);
    }
    if (player.getInteractingMobile?.() !== target) {
      player.setMobileInteraction?.(target);
    }
    if (this.tryStepOutOfStack?.(player, state, target, nowMs)) {
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      return "running";
    }

    this.maybeUseSpecialAttack?.({
      player,
      state,
      nowMs,
      target,
      scheduleSpecReview: this.scheduleSpecReview,
    });
    this.maybeSwitchBackToPrimaryWeapon?.({
      player,
      state,
      nowMs,
    });

    if (nowMs < (pvp.nextActionAt ?? 0)) {
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      return "running";
    }

    const combat = player.getCombat?.();
    if (!combat) {
      return "failure";
    }

    const currentTarget = combat.getTarget?.();
    if (currentTarget && currentTarget !== target) {
      combat.reset?.();
    }

    if (combat.getTarget?.() !== target) {
      player.getMovementQueue?.().reset?.();
      player.setFollowing?.(target);
      player.setMobileInteraction?.(target);
      player.setPositionToFace?.(target.getLocation());
      combat.attack(target);
    }

    this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
    this.scheduleCombatAction?.(state, nowMs);
    if (nowMs >= (pvp.nextTargetReviewAt ?? 0)) {
      this.scheduleReviewTimers?.(state, nowMs);
    }
    return "running";
  }
}

module.exports = {
  PvpCombatExecutionNode,
};
