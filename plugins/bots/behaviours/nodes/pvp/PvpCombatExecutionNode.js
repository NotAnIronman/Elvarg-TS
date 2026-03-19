"use strict";

const { PrayerHandler } = require("../../../../../src/main/typescript/elvarg/game/content/PrayerHandler");
const {
  CombatType,
} = require("../../../../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { ServerPerf } = require("../../../../../src/main/typescript/elvarg/util/ServerPerf");
const { randomInRange } = require("../../navigation/BotNavigation");
const {
  getPvpCombatSnapshot,
  getWeaponId,
  resolveCurrentCombatType,
} = require("../../policies/PvpCombatRuntimeCache");

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
const HYBRID_OFFENSIVE_PRAYERS = Object.freeze([
  ...MAGIC_OFFENSIVE_PRAYERS,
  ...RANGED_OFFENSIVE_PRAYERS,
]);
const MANAGED_OFFENSIVE_PRAYERS = Object.freeze([
  ...MELEE_OFFENSIVE_PRAYERS,
  ...RANGED_OFFENSIVE_PRAYERS,
  ...MAGIC_OFFENSIVE_PRAYERS,
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

function isPrayerActive(player, prayerId) {
  return player?.getPrayerActive?.()?.[prayerId] === true;
}

function hasOtherActivePrayer(player, prayerIds, exceptPrayerId = null) {
  if (!player || !Array.isArray(prayerIds)) {
    return false;
  }
  const activePrayers = player.getPrayerActive?.() ?? [];
  for (const prayerId of prayerIds) {
    if (prayerId === exceptPrayerId) {
      continue;
    }
    if (activePrayers[prayerId] === true) {
      return true;
    }
  }
  return false;
}

class PvpCombatExecutionNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.tryStepOutOfStack = options.tryStepOutOfStack;
    this.maybeSwitchBackToPrimaryWeapon = options.maybeSwitchBackToPrimaryWeapon;
    this.maybeUseSpecialAttack = options.maybeUseSpecialAttack;
    this.maybeRunPressureCombatScript = options.maybeRunPressureCombatScript;
    this.scheduleCombatAction = options.scheduleCombatAction;
    this.scheduleFreezeReview = options.scheduleFreezeReview;
    this.scheduleSpecReview = options.scheduleSpecReview;
    this.scheduleReviewTimers = options.scheduleReviewTimers;
    this.getProfile = options.getProfile;
    this.pvpPhase = options.pvpPhase;
  }

  reviewPrayers(player, state, target, nowMs, profile = null) {
    const pvp = state?.pvp;
    const resolvedProfile = profile ?? this.getProfile?.(state) ?? null;
    if (!player || !pvp || !target || !resolvedProfile) {
      return false;
    }

    const basePrayerReviewMinMs = Number(resolvedProfile?.prayerReviewMs?.min ?? 1200);
    const basePrayerReviewMaxMs = Number(resolvedProfile?.prayerReviewMs?.max ?? 2400);

    const confidenceTier = Number(resolvedProfile?.confidenceTier ?? 0);
    if (confidenceTier < 3) {
      pvp.nextPrayerReviewAt =
        nowMs + randomInRange(basePrayerReviewMinMs, basePrayerReviewMaxMs);
      return false;
    }

    const combatSnapshot = getPvpCombatSnapshot(player, state, nowMs);
    const playerCombatType =
      combatSnapshot?.currentCombatType ??
      resolveCurrentCombatType(player, player?.getWeapon?.(), getWeaponId(player));
    const targetCombatType = resolveCurrentCombatType(
      target,
      target?.getWeapon?.(),
      getWeaponId(target)
    );
    const targetUsername = target.getUsername?.() ?? null;
    const desiredProtectionPrayer = this.resolveProtectionPrayer(
      player,
      target,
      confidenceTier,
      targetCombatType
    );
    const protectionStable =
      desiredProtectionPrayer != null
        ? pvp.cachedProtectionPrayerId === desiredProtectionPrayer &&
          pvp.cachedPrayerTargetCombatType === targetCombatType &&
          pvp.cachedPrayerTargetUsername === targetUsername &&
          isPrayerActive(player, desiredProtectionPrayer) &&
          !hasOtherActivePrayer(player, PrayerHandler.PROTECTION_PRAYERS, desiredProtectionPrayer)
        : !hasOtherActivePrayer(player, PrayerHandler.PROTECTION_PRAYERS);
    const shouldRefreshProtectionPrayers = !protectionStable;
    if (desiredProtectionPrayer != null) {
      if (shouldRefreshProtectionPrayers) {
        activateFirstAvailablePrayer(player, [desiredProtectionPrayer]);
        deactivatePrayerSet(player, PrayerHandler.PROTECTION_PRAYERS, desiredProtectionPrayer);
      }
    } else {
      if (shouldRefreshProtectionPrayers) {
        deactivatePrayerSet(player, PrayerHandler.PROTECTION_PRAYERS);
      }
    }

    const offensivePrayerIds = this.resolveOffensivePrayerPriority(state, playerCombatType);
    if (offensivePrayerIds.length === 0) {
      return false;
    }
    const preferredOffensivePrayer = offensivePrayerIds[0] ?? null;
    const offensiveStable =
      preferredOffensivePrayer == null
        ? !hasOtherActivePrayer(player, MANAGED_OFFENSIVE_PRAYERS)
        : pvp.cachedOffensivePrayerId === preferredOffensivePrayer &&
          pvp.cachedPrayerPlayerCombatType === playerCombatType &&
          isPrayerActive(player, preferredOffensivePrayer) &&
          !hasOtherActivePrayer(player, MANAGED_OFFENSIVE_PRAYERS, preferredOffensivePrayer);
    const shouldRefreshOffensivePrayers = !offensiveStable;
    let activatedOffensivePrayer = pvp.cachedOffensivePrayerId ?? null;
    if (shouldRefreshOffensivePrayers) {
      activatedOffensivePrayer = activateFirstAvailablePrayer(player, offensivePrayerIds);
      if (activatedOffensivePrayer != null) {
        deactivatePrayerSet(player, MANAGED_OFFENSIVE_PRAYERS, activatedOffensivePrayer);
      } else {
        deactivatePrayerSet(player, MANAGED_OFFENSIVE_PRAYERS);
      }
    }
    pvp.cachedProtectionPrayerId = desiredProtectionPrayer;
    pvp.cachedOffensivePrayerId = activatedOffensivePrayer ?? null;
    pvp.cachedPrayerTargetCombatType = targetCombatType;
    pvp.cachedPrayerPlayerCombatType = playerCombatType;
    pvp.cachedPrayerTargetUsername = targetUsername;
    pvp.nextPrayerReviewAt =
      nowMs +
      randomInRange(
        protectionStable && offensiveStable
          ? Math.max(basePrayerReviewMinMs + 200, Math.floor(basePrayerReviewMinMs * 2))
          : basePrayerReviewMinMs,
        protectionStable && offensiveStable
          ? Math.max(basePrayerReviewMaxMs + 400, Math.floor(basePrayerReviewMaxMs * 2))
          : basePrayerReviewMaxMs
      );
    return true;
  }

  resolveProtectionPrayer(player, target, confidenceTier, targetMethodType = null) {
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

  resolveOffensivePrayerPriority(state, combatType) {
    if (combatType === CombatType.RANGED) {
      return RANGED_OFFENSIVE_PRAYERS;
    }
    if (combatType === CombatType.MAGIC) {
      return MAGIC_OFFENSIVE_PRAYERS;
    }
    if (combatType === CombatType.MELEE) {
      return MELEE_OFFENSIVE_PRAYERS;
    }

    const preferredStyle = state?.pvp?.preferredCombatStyle;
    if (preferredStyle === "range") {
      return RANGED_OFFENSIVE_PRAYERS;
    }
    if (preferredStyle === "hybrid") {
      return HYBRID_OFFENSIVE_PRAYERS;
    }
    return MELEE_OFFENSIVE_PRAYERS;
  }

  shouldForcePrayerSync(player, state, target, nowMs, forcedCombatType = null) {
    const pvp = state?.pvp;
    if (!player || !pvp || !target) {
      return false;
    }
    if (nowMs >= Number(pvp.nextPrayerReviewAt ?? 0)) {
      return true;
    }
    if (
      Number.isInteger(forcedCombatType) &&
      pvp.cachedPrayerPlayerCombatType !== forcedCombatType
    ) {
      return true;
    }
    const targetCombatType = resolveCurrentCombatType(
      target,
      target?.getWeapon?.(),
      getWeaponId(target)
    );
    return pvp.cachedPrayerTargetCombatType !== targetCombatType;
  }

  forcePrayerSync(player, state, target, nowMs, profile = null) {
    if (!player || !state || !target) {
      return false;
    }
    return this.reviewPrayers(player, state, target, nowMs, profile);
  }

  tick(context) {
    const { player, state, nowMs, target } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp || !target) {
      return "failure";
    }

    const steppedOutOfStack = ServerPerf.measurePhase(
      "bot.pvp.combat_execution.combat_sync_or_reissue",
      () =>
        ServerPerf.measurePhase("bot.pvp.combat_sync.stack_resolution", () => {
          if (player.getFollowing?.() !== target) {
            player.setFollowing?.(target);
          }
          if (player.getInteractingMobile?.() !== target) {
            player.setMobileInteraction?.(target);
          }
          return this.tryStepOutOfStack?.(player, state, target, nowMs) === true;
        })
    );
    if (steppedOutOfStack) {
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      return "running";
    }

    const profile = this.getProfile?.(state) ?? null;
    ServerPerf.measurePhase("bot.pvp.combat_execution.spec", () =>
      this.maybeUseSpecialAttack?.({
        player,
        state,
        nowMs,
        target,
        profile,
        scheduleSpecReview: this.scheduleSpecReview,
      })
    );
    const pressureResult = ServerPerf.measurePhase(
      "bot.pvp.combat_execution.pressure_script",
      () =>
        this.maybeRunPressureCombatScript?.({
          player,
          state,
          nowMs,
          target,
          profile,
          scheduleCombatAction: this.scheduleCombatAction,
          scheduleFreezeReview: this.scheduleFreezeReview,
        })
    );
    if (pressureResult?.handled === true) {
      if (
        this.shouldForcePrayerSync(
          player,
          state,
          target,
          nowMs,
          pressureResult?.forcedCombatType ?? null
        )
      ) {
        ServerPerf.measurePhase("bot.pvp.combat_execution.prayer_review", () =>
          this.forcePrayerSync(player, state, target, nowMs, profile)
        );
      }
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      if (nowMs >= (pvp.nextTargetReviewAt ?? 0)) {
        this.scheduleReviewTimers?.(state, nowMs);
      }
      return "running";
    }
    ServerPerf.measurePhase("bot.pvp.combat_execution.combat_sync_or_reissue", () =>
      ServerPerf.measurePhase("bot.pvp.combat_sync.switchback", () =>
        this.maybeSwitchBackToPrimaryWeapon?.({
          player,
          state,
          nowMs,
        })
      )
    );
    if (nowMs >= Number(pvp.nextPrayerReviewAt ?? 0)) {
      ServerPerf.measurePhase("bot.pvp.combat_execution.prayer_review", () =>
        this.reviewPrayers(player, state, target, nowMs, profile)
      );
    }

    if (nowMs < (pvp.nextActionAt ?? 0)) {
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      return "running";
    }

    const combat = player.getCombat?.();
    if (!combat) {
      return "failure";
    }

    ServerPerf.measurePhase("bot.pvp.combat_execution.combat_sync_or_reissue", () =>
      ServerPerf.measurePhase("bot.pvp.combat_sync.attack_reissue", () => {
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
      })
    );

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
