"use strict";

const { PrayerHandler } = require("../../../../../src/main/typescript/elvarg/game/content/PrayerHandler");
const {
  CombatFactory,
} = require("../../../../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const {
  CombatType,
} = require("../../../../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { randomInRange } = require("../../navigation/BotNavigation");

const MELEE_OFFENSIVE_PRAYERS = Object.freeze([
  PrayerHandler.PIETY,
  PrayerHandler.CHIVALRY,
  PrayerHandler.ULTIMATE_STRENGTH,
]);
const RANGED_OFFENSIVE_PRAYERS = Object.freeze([
  PrayerHandler.RIGOUR,
  PrayerHandler.EAGLE_EYE,
  PrayerHandler.HAWK_EYE,
  PrayerHandler.SHARP_EYE,
]);
const MAGIC_OFFENSIVE_PRAYERS = Object.freeze([
  PrayerHandler.AUGURY,
  PrayerHandler.MYSTIC_MIGHT,
  PrayerHandler.MYSTIC_LORE,
  PrayerHandler.MYSTIC_WILL,
]);

function deactivatePrayerSet(player, prayerIds, exceptPrayerId = null) {
  if (!player || !Array.isArray(prayerIds)) {
    return;
  }
  for (const prayerId of prayerIds) {
    if (prayerId === exceptPrayerId) {
      continue;
    }
    if (PrayerHandler.isActivated(player, prayerId)) {
      PrayerHandler.deactivatePrayer(player, prayerId);
    }
  }
}

function activateFirstAvailablePrayer(player, prayerIds) {
  if (!player || !Array.isArray(prayerIds)) {
    return null;
  }
  for (const prayerId of prayerIds) {
    if (PrayerHandler.isActivated(player, prayerId)) {
      return prayerId;
    }
    PrayerHandler.activatePrayerPrayerId(player, prayerId);
    if (PrayerHandler.isActivated(player, prayerId)) {
      return prayerId;
    }
  }
  return null;
}

class PvpCombatExecutionNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.tryStepOutOfStack = options.tryStepOutOfStack;
    this.maybeSwitchBackToPrimaryWeapon = options.maybeSwitchBackToPrimaryWeapon;
    this.maybeUseSpecialAttack = options.maybeUseSpecialAttack;
    this.scheduleCombatAction = options.scheduleCombatAction;
    this.scheduleSpecReview = options.scheduleSpecReview;
    this.scheduleReviewTimers = options.scheduleReviewTimers;
    this.getProfile = options.getProfile;
    this.pvpPhase = options.pvpPhase;
  }

  reviewPrayers(player, state, target, nowMs) {
    const pvp = state?.pvp;
    const profile = this.getProfile?.(state) ?? null;
    if (!player || !pvp || !target || !profile) {
      return false;
    }

    pvp.nextPrayerReviewAt =
      nowMs +
      randomInRange(
        Number(profile?.prayerReviewMs?.min ?? 1200),
        Number(profile?.prayerReviewMs?.max ?? 2400)
      );

    const confidenceTier = Number(profile?.confidenceTier ?? 0);
    if (confidenceTier < 3) {
      return false;
    }

    const desiredProtectionPrayer = this.resolveProtectionPrayer(player, target, confidenceTier);
    if (desiredProtectionPrayer != null) {
      activateFirstAvailablePrayer(player, [desiredProtectionPrayer]);
    } else {
      deactivatePrayerSet(player, PrayerHandler.PROTECTION_PRAYERS);
    }

    const offensivePrayerIds = this.resolveOffensivePrayerPriority(player, state);
    if (offensivePrayerIds.length === 0) {
      return false;
    }
    const activatedOffensivePrayer = activateFirstAvailablePrayer(player, offensivePrayerIds);
    if (activatedOffensivePrayer != null) {
      const managedOffensivePrayers = [
        ...MELEE_OFFENSIVE_PRAYERS,
        ...RANGED_OFFENSIVE_PRAYERS,
        ...MAGIC_OFFENSIVE_PRAYERS,
      ];
      deactivatePrayerSet(player, managedOffensivePrayers, activatedOffensivePrayer);
    }
    return true;
  }

  resolveProtectionPrayer(player, target, confidenceTier) {
    const targetMethodType = CombatFactory.getMethod(target)?.type?.();
    if (!Number.isInteger(targetMethodType)) {
      return null;
    }

    const targetCombat = target.getCombat?.();
    const playerCombat = player.getCombat?.();
    const targetIsThreatening =
      targetCombat?.getTarget?.() === player ||
      targetCombat?.getAttacker?.() === player ||
      playerCombat?.getTarget?.() === target ||
      playerCombat?.getAttacker?.() === target;
    if (!targetIsThreatening && confidenceTier < 4) {
      return null;
    }

    try {
      return PrayerHandler.getProtectingPrayer(targetMethodType);
    } catch (_error) {
      return null;
    }
  }

  resolveOffensivePrayerPriority(player, state) {
    const combatType = CombatFactory.getMethod(player)?.type?.();
    if (combatType === CombatType.RANGED) {
      return [...RANGED_OFFENSIVE_PRAYERS];
    }
    if (combatType === CombatType.MAGIC) {
      return [...MAGIC_OFFENSIVE_PRAYERS];
    }
    if (combatType === CombatType.MELEE) {
      return [...MELEE_OFFENSIVE_PRAYERS];
    }

    const preferredStyle = state?.pvp?.preferredCombatStyle;
    if (preferredStyle === "range") {
      return [...RANGED_OFFENSIVE_PRAYERS];
    }
    if (preferredStyle === "hybrid") {
      return [...MAGIC_OFFENSIVE_PRAYERS, ...RANGED_OFFENSIVE_PRAYERS];
    }
    return [...MELEE_OFFENSIVE_PRAYERS];
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
    if (nowMs >= Number(pvp.nextPrayerReviewAt ?? 0)) {
      this.reviewPrayers(player, state, target, nowMs);
    }

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
