const { World } = require("../../src/main/typescript/elvarg/game/World");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { Wilderness } = require("../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");

const GLOW_PRESET_ATTRIBUTE = "visual:glowPreset";
const GLOW_INTENSITY_ATTRIBUTE = "visual:glowIntensity";
const LAST_GLOW_PRESET_ATTRIBUTE = "killstreaks:lastGlowPreset";

const GLOW_PRESETS = Object.freeze({
  off: 0,
  blood: 1,
  gold: 2,
  toxic: 3,
  ice: 4,
  royal: 5,
  infernal: 6,
});

const COLOR_TIERS = Object.freeze([
  Object.freeze({
    minKills: 3,
    preset: GLOW_PRESETS.blood,
    label: "Blood",
    messageColorTag: "@red@",
    intensityThresholds: Object.freeze([3, 4, 5]),
  }),
  Object.freeze({
    minKills: 6,
    preset: GLOW_PRESETS.toxic,
    label: "Toxic",
    messageColorTag: "@gre@",
    intensityThresholds: Object.freeze([6, 7, 9]),
  }),
  Object.freeze({
    minKills: 10,
    preset: GLOW_PRESETS.ice,
    label: "Ice",
    messageColorTag: "@cya@",
    intensityThresholds: Object.freeze([10, 12, 14]),
  }),
  Object.freeze({
    minKills: 15,
    preset: GLOW_PRESETS.gold,
    label: "Gold",
    messageColorTag: "@yel@",
    intensityThresholds: Object.freeze([15, 17, 19]),
  }),
  Object.freeze({
    minKills: 20,
    preset: GLOW_PRESETS.royal,
    label: "Royal",
    messageColorTag: "@mag@",
    intensityThresholds: Object.freeze([20, 23, 26]),
  }),
  Object.freeze({
    minKills: 30,
    preset: GLOW_PRESETS.infernal,
    label: "Infernal",
    messageColorTag: "@or2@",
    intensityThresholds: Object.freeze([30, 35, 45]),
  }),
]);

function parseAttributeInt(value, fallback = 0) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function normalizeKillstreak(player) {
  const streak = parseAttributeInt(player?.getKillstreak?.(), 0);
  return streak > 0 ? streak : 0;
}

function isEligibleKillstreakPlayer(player) {
  return player?.isPlayer?.() === true && player?.isPlayerBot?.() !== true;
}

function resolveColorTier(killstreak) {
  for (let index = COLOR_TIERS.length - 1; index >= 0; index--) {
    const tier = COLOR_TIERS[index];
    if (killstreak >= tier.minKills) {
      return tier;
    }
  }
  return null;
}

function resolveTierIntensity(tier, killstreak) {
  if (!tier) {
    return 1;
  }
  let intensity = 0;
  for (const threshold of tier.intensityThresholds) {
    if (killstreak >= threshold) {
      intensity++;
    }
  }
  return Math.max(1, Math.min(3, intensity));
}

function flagAppearance(player) {
  player?.getUpdateFlag?.()?.flag?.(Flag.APPEARANCE);
}

function syncKillstreakGlow(player) {
  if (!isEligibleKillstreakPlayer(player)) {
    return {
      streak: 0,
      tier: null,
      previousPreset: 0,
      nextPreset: 0,
    };
  }

  const streak = normalizeKillstreak(player);
  const tier = resolveColorTier(streak);
  const nextPreset = tier?.preset ?? GLOW_PRESETS.off;
  const nextIntensity = resolveTierIntensity(tier, streak);

  const rawStoredPreset = player.getAttribute?.(LAST_GLOW_PRESET_ATTRIBUTE);
  const hasStoredPreset = rawStoredPreset !== undefined && rawStoredPreset !== null;
  const storedPreset = parseAttributeInt(rawStoredPreset, 0);
  const previousPreset = hasStoredPreset
    ? storedPreset
    : resolveColorTier(Math.max(0, streak - 1))?.preset ?? GLOW_PRESETS.off;

  // Only override visible glow state when the plugin is actively managing it.
  if (nextPreset > 0 || storedPreset > 0) {
    const currentGlowPreset = parseAttributeInt(
      player.getAttribute?.(GLOW_PRESET_ATTRIBUTE),
      GLOW_PRESETS.off
    );
    const rawCurrentGlowIntensity = player.getAttribute?.(GLOW_INTENSITY_ATTRIBUTE);
    const hasCurrentGlowIntensity =
      rawCurrentGlowIntensity !== undefined && rawCurrentGlowIntensity !== null;
    const currentGlowIntensity = parseAttributeInt(rawCurrentGlowIntensity, 1);

    let appearanceDirty = false;
    if (currentGlowPreset !== nextPreset) {
      player.setAttribute?.(GLOW_PRESET_ATTRIBUTE, nextPreset);
      appearanceDirty = true;
    }
    if (!hasCurrentGlowIntensity || currentGlowIntensity !== nextIntensity) {
      player.setAttribute?.(GLOW_INTENSITY_ATTRIBUTE, nextIntensity);
      appearanceDirty = true;
    }
    if (appearanceDirty) {
      flagAppearance(player);
    }
  }

  if (storedPreset !== nextPreset) {
    player.setAttribute?.(LAST_GLOW_PRESET_ATTRIBUTE, nextPreset);
  }

  return {
    streak,
    tier,
    previousPreset,
    nextPreset,
  };
}

function formatThresholdAnnouncement(player, tier, streak) {
  const username = player?.getUsername?.() ?? "A player";
  return `@red@[Killstreak] @whi@${username} has reached ${tier.messageColorTag}${tier.label}@whi@ status with ${streak} kills in a row!`;
}

function shouldIncrementForBotKill(killer, victim) {
  return (
    isEligibleKillstreakPlayer(killer) &&
    victim?.isPlayerBot?.() === true &&
    killer !== victim &&
    Wilderness.isIn?.(killer) === true &&
    Wilderness.isIn?.(victim) === true
  );
}

function incrementBotKillstreak(killer) {
  if (!isEligibleKillstreakPlayer(killer)) {
    return;
  }
  killer.incrementKillstreak?.();
  const current = normalizeKillstreak(killer);
  if (current > parseAttributeInt(killer.getHighestKillstreak?.(), 0)) {
    killer.setHighestKillstreak?.(current);
    killer
      .getPacketSender?.()
      .sendMessage?.(
        `Congratulations! Your highest killstreak is now ${killer.getHighestKillstreak?.()}.`
      );
  } else {
    killer
      .getPacketSender?.()
      .sendMessage?.(`Your killstreak is now ${current}.`);
  }
}

function handleVictimDefeat(victim) {
  if (!isEligibleKillstreakPlayer(victim)) {
    return;
  }

  const previousStreak = normalizeKillstreak(victim);
  if (previousStreak > 0) {
    victim.setKillstreak?.(0);
    victim
      .getPacketSender?.()
      .sendMessage?.(`Your ${previousStreak} killstreak has ended.`);
  }
  syncKillstreakGlow(victim);
}

function handleKillerProgress(killer, victim) {
  if (!isEligibleKillstreakPlayer(killer) || killer === victim) {
    return;
  }

  const outcome = syncKillstreakGlow(killer);
  if (!outcome.tier || outcome.nextPreset === outcome.previousPreset) {
    return;
  }

  World.sendMessage(formatThresholdAnnouncement(killer, outcome.tier, outcome.streak));
}

module.exports = {
  name: "KillStreaks",
  dependsOn: ["Wilderness"],
  register(api) {
    api.onPlayerLogin(({ player }) => {
      syncKillstreakGlow(player);
    });

    api.onPlayerDefeated(({ killer, victim }) => {
      if (shouldIncrementForBotKill(killer, victim)) {
        incrementBotKillstreak(killer);
      }
      handleVictimDefeat(victim);
      handleKillerProgress(killer, victim);
    });
  },
};
