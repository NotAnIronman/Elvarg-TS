"use strict";

const { Skill } = require("../../../../../src/main/typescript/elvarg/game/model/Skill");

class PvpDefensiveActionNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.stopPvp = options.stopPvp;
    this.isActivelyEngagedWithTarget = options.isActivelyEngagedWithTarget;
    this.getProfile = options.getProfile;
    this.isFullTimePvp = options.isFullTimePvp;
    this.pvpPhase = options.pvpPhase;
  }

  tick(context) {
    const { player, state, nowMs, target } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp || !target) {
      return { handled: true, status: "failure" };
    }

    if (this.isFullTimePvp?.(state) === true) {
      if (player.getForceMovement?.() != null) {
        this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
        return { handled: true, status: "running" };
      }
      return { handled: false, status: "running" };
    }

    const currentHp = Number(player.getHitpoints?.() ?? 0);
    const maxHp = Number(
      player.getSkillManager?.()?.getMaxLevel?.(Skill.HITPOINTS) ?? currentHp
    );
    const escapeThreshold = Number(
      state?.pvp?.escapeThreshold ?? this.getProfile?.(state)?.retreatHpRatio ?? 0.24
    );
    if (
      maxHp > 0 &&
      nowMs >= (pvp.nextEscapeReviewAt ?? 0) &&
      currentHp / maxHp <= escapeThreshold &&
      !this.isActivelyEngagedWithTarget?.(player, target)
    ) {
      this.setPhase?.(state, this.pvpPhase?.SEEKING ?? "seeking");
      this.stopPvp?.(player, state, nowMs, "retreat_threshold");
      return { handled: true, status: "success" };
    }

    if (player.getForceMovement?.() != null) {
      this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
      return { handled: true, status: "running" };
    }

    return { handled: false, status: "running" };
  }
}

module.exports = {
  PvpDefensiveActionNode,
};
