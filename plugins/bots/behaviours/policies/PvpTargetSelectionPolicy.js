"use strict";

const { randomInRange } = require("../navigation/BotNavigation");
const { getPvpLoadout, getPvpProfile } = require("../pvp/PvpAssignment");

function scorePvpCandidate(sourceEntry, candidateEntry) {
  const sourcePlayer = sourceEntry?.player;
  const sourceState = sourceEntry?.state;
  const candidatePlayer = candidateEntry?.player;
  const candidateState = candidateEntry?.state;
  if (!sourcePlayer || !sourceState || !candidatePlayer || !candidateState) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceProfile = getPvpProfile(sourceState?.pvp?.profileId);
  const sourceLoadout = getPvpLoadout(sourceState?.pvp?.loadoutId);
  const distance = sourcePlayer.getLocation().getDistance(candidatePlayer.getLocation());
  let score = 100 - distance * 6;

  if (sourceState.pvp?.hotspotId && sourceState.pvp.hotspotId === candidateState.pvp?.hotspotId) {
    score += 32;
  }
  if (
    sourceLoadout.tags.includes("hybrid") &&
    candidateState.pvp?.preferredCombatStyle === "hybrid"
  ) {
    score += 8;
  }
  if (candidateState.pvp?.confidenceTier != null) {
    score += Math.max(
      -8,
      10 - Math.abs((sourceProfile.confidenceTier ?? 2) - candidateState.pvp.confidenceTier) * 4
    );
  }
  if (distance <= sourceProfile.chaseDistanceTiles) {
    score += 10;
  }
  return score;
}

function pickPvpOpponent({
  sourceEntry,
  entries,
  nowMs,
  pvpMaxDistanceTiles,
  isInCombat,
  isPvpCandidate,
}) {
  const sourcePlayer = sourceEntry?.player;
  const sourceState = sourceEntry?.state;
  if (!sourcePlayer || !sourceState || !Array.isArray(entries)) {
    return null;
  }

  const sourceHotspotId = sourceState?.pvp?.hotspotId ?? null;
  const requireSameHotspot = false;

  const candidates = [];
  for (const other of entries) {
    if (
      typeof isPvpCandidate === "function" &&
      !isPvpCandidate({
        sourceEntry,
        candidateEntry: other,
        entries,
        nowMs,
        isInCombat,
      })
    ) {
      continue;
    }
    if (
      requireSameHotspot &&
      (other?.state?.pvp?.hotspotId ?? null) !== sourceHotspotId
    ) {
      continue;
    }
    const distance = sourcePlayer.getLocation().getDistance(other.player.getLocation());
    if (distance > pvpMaxDistanceTiles) {
      continue;
    }
    candidates.push({
      entry: other,
      distance,
      score: scorePvpCandidate(sourceEntry, other),
    });
  }

  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.distance - b.distance;
  });
  const topPool = candidates.slice(0, Math.min(3, candidates.length));
  return topPool[randomInRange(0, topPool.length - 1)].entry;
}

module.exports = {
  scorePvpCandidate,
  pickPvpOpponent,
};
