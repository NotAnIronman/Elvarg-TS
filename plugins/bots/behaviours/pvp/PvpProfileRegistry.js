"use strict";

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    targetReviewMs: Object.freeze({ ...profile.targetReviewMs }),
    prayerReviewMs: Object.freeze({ ...profile.prayerReviewMs }),
    specReviewMs: Object.freeze({ ...profile.specReviewMs }),
    freezeReviewMs: Object.freeze({ ...profile.freezeReviewMs }),
    combatActionMs: Object.freeze({ ...profile.combatActionMs }),
  });
}

const PVP_PROFILES = Object.freeze({
  novice: freezeProfile({
    id: "novice",
    label: "Novice",
    targetReviewMs: { min: 2200, max: 4200 },
    prayerReviewMs: { min: 1800, max: 3200 },
    specReviewMs: { min: 3200, max: 5200 },
    freezeReviewMs: { min: 9000, max: 15000 },
    combatActionMs: { min: 850, max: 1850 },
    eatAtHpRatio: 0.56,
    comboEatChance: 0.08,
    switchChance: 0.08,
    specUseChance: 0.18,
    specSwitchChance: 0.26,
    specFinisherHpRatio: 0.34,
    specPressureHpRatio: 0.22,
    retreatHpRatio: 0.28,
    chaseDistanceTiles: 7,
    freezeFollowUpChance: 0.06,
    freezeUseChance: 0,
    smiteUseChance: 0.04,
    riskTolerance: 0.15,
    confidenceTier: 1,
  }),
  standard: freezeProfile({
    id: "standard",
    label: "Standard",
    targetReviewMs: { min: 1400, max: 2600 },
    prayerReviewMs: { min: 1100, max: 2200 },
    specReviewMs: { min: 2500, max: 4200 },
    freezeReviewMs: { min: 7500, max: 12000 },
    combatActionMs: { min: 650, max: 1450 },
    eatAtHpRatio: 0.48,
    comboEatChance: 0.16,
    switchChance: 0.18,
    specUseChance: 0.34,
    specSwitchChance: 0.45,
    specFinisherHpRatio: 0.42,
    specPressureHpRatio: 0.28,
    retreatHpRatio: 0.24,
    chaseDistanceTiles: 9,
    freezeFollowUpChance: 0.12,
    freezeUseChance: 0.16,
    smiteUseChance: 0.1,
    riskTolerance: 0.3,
    confidenceTier: 2,
  }),
  veteran: freezeProfile({
    id: "veteran",
    label: "Veteran",
    targetReviewMs: { min: 900, max: 1800 },
    prayerReviewMs: { min: 750, max: 1500 },
    specReviewMs: { min: 1800, max: 3200 },
    freezeReviewMs: { min: 5500, max: 9500 },
    combatActionMs: { min: 500, max: 1200 },
    eatAtHpRatio: 0.42,
    comboEatChance: 0.26,
    switchChance: 0.35,
    specUseChance: 0.52,
    specSwitchChance: 0.64,
    specFinisherHpRatio: 0.52,
    specPressureHpRatio: 0.34,
    retreatHpRatio: 0.21,
    chaseDistanceTiles: 12,
    freezeFollowUpChance: 0.2,
    freezeUseChance: 0.32,
    smiteUseChance: 0.18,
    riskTolerance: 0.5,
    confidenceTier: 3,
  }),
  elite: freezeProfile({
    id: "elite",
    label: "Elite",
    targetReviewMs: { min: 650, max: 1350 },
    prayerReviewMs: { min: 500, max: 1100 },
    specReviewMs: { min: 1400, max: 2600 },
    freezeReviewMs: { min: 3800, max: 7000 },
    combatActionMs: { min: 420, max: 950 },
    eatAtHpRatio: 0.38,
    comboEatChance: 0.4,
    switchChance: 0.52,
    specUseChance: 0.72,
    specSwitchChance: 0.82,
    specFinisherHpRatio: 0.64,
    specPressureHpRatio: 0.42,
    retreatHpRatio: 0.18,
    chaseDistanceTiles: 15,
    freezeFollowUpChance: 0.32,
    freezeUseChance: 0.52,
    smiteUseChance: 0.28,
    riskTolerance: 0.72,
    confidenceTier: 4,
  }),
});

const PVP_PROFILE_IDS = Object.freeze(Object.keys(PVP_PROFILES));

function getPvpProfile(profileId) {
  return PVP_PROFILES[profileId] ?? PVP_PROFILES.standard;
}

function listPvpProfiles() {
  return PVP_PROFILE_IDS.map((profileId) => PVP_PROFILES[profileId]);
}

module.exports = {
  PVP_PROFILE_IDS,
  PVP_PROFILES,
  getPvpProfile,
  listPvpProfiles,
};
