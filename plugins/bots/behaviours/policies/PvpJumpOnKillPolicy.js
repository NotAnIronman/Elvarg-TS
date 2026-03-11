"use strict";

const { Wilderness } = require("../../../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { World } = require("../../../../src/main/typescript/elvarg/game/World");

const IMMEDIATE_PJ_DURATION_MS = 30000;

class PvpJumpOnKillPolicy {
  constructor(options = {}) {
    this.botStatesByName = options.botStatesByName ?? new Map();
    this.behaviorMode = options.behaviorMode ?? {};
    this.config = options.config ?? {};
  }

  isPersistentPvpState(state) {
    return !!(
      state?.pvp &&
      (state.autonomy?.fullTimePvp === true ||
        state.autonomy?.wildernessRoamerPvp === true ||
        state.autonomy?.persistentPvpLoadout === true)
    );
  }

  resolveSoloRealPlayerDamager(victim) {
    const damageEntries = [
      ...((victim?.__recentDeathDamagerEntries ?? victim?.getCombat?.().getRecentDamagerEntries?.()) ??
        []),
    ];
    if (damageEntries.length !== 1) {
      return null;
    }

    const target = damageEntries[0]?.player;
    if (!target || target.isPlayerBot?.() === true) {
      return null;
    }
    if (!target.isRegistered?.() || (target.getHitpoints?.() ?? 0) <= 0) {
      return null;
    }
    return target;
  }

  resolveNearbyJumpBot(victim, target, distanceTiles) {
    if (!victim || !target) {
      return null;
    }

    const nearbyPlayers = World.getNearbyPlayersForUpdate?.(victim) ?? [];
    const victimLoc = victim.getLocation?.();
    const victimPrivateArea = victim.getPrivateArea?.();
    let bestBot = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of nearbyPlayers) {
      if (!candidate || candidate === victim || candidate === target) {
        continue;
      }
      if (candidate.isPlayerBot?.() !== true || !candidate.isRegistered?.()) {
        continue;
      }
      if ((candidate.getHitpoints?.() ?? 0) <= 0) {
        continue;
      }
      if (candidate.getPrivateArea?.() !== victimPrivateArea) {
        continue;
      }

      const state = this.botStatesByName.get(candidate.getUsername?.());
      if (!this.isPersistentPvpState(state)) {
        continue;
      }

      const candidateLoc = candidate.getLocation?.();
      if (
        !victimLoc ||
        !candidateLoc ||
        victimLoc.getZ?.() !== candidateLoc.getZ?.()
      ) {
        continue;
      }
      const distance = victimLoc.getDistance(candidateLoc);
      if (distance > distanceTiles || distance >= bestDistance) {
        continue;
      }
      bestBot = candidate;
      bestDistance = distance;
    }

    return bestBot;
  }

  signalJump(bot, state, target, nowMs) {
    if (!bot || !state?.pvp || !target) {
      return false;
    }
    if (state.mode !== this.behaviorMode.PVP) {
      return false;
    }

    const durationMs = Math.max(
      1000,
      Number(this.config.immediatePjDurationMs ?? IMMEDIATE_PJ_DURATION_MS)
    );
    const targetUsername = target.getUsername?.();
    if (!targetUsername) {
      return false;
    }

    state.pvp.pjTargetUsername = targetUsername;
    state.pvp.pjExpiresAt = nowMs + durationMs;
    state.pvp.pjVictimUsername = null;
    state.pvp.pjVictimExpiresAt = 0;
    state.pvp.nextActionAt = nowMs;
    return true;
  }

  handle({ victim, nowMs = Date.now() }) {
    if (!victim || victim.isPlayerBot?.() !== true || !Wilderness.isIn(victim)) {
      return;
    }

    const target = this.resolveSoloRealPlayerDamager(victim);
    if (!target || !Wilderness.isIn(target)) {
      return;
    }

    const bot = this.resolveNearbyJumpBot(
      victim,
      target,
      Number(this.config.pjObserveDistanceTiles ?? 12)
    );
    if (!bot) {
      return;
    }

    const state = this.botStatesByName.get(bot.getUsername?.());
    if (!this.isPersistentPvpState(state)) {
      return;
    }

    this.signalJump(bot, state, target, nowMs);
  }
}

module.exports = {
  PvpJumpOnKillPolicy,
};
