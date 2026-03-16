"use strict";

const { PvpProfileId } = require("../../pvp/PvpProfileRegistry");
const { isVisibleRealPlayer } = require("../../pvp/PvpTargetFilters");
const { PrayerHandler } = require("../../../../../src/main/typescript/elvarg/game/content/PrayerHandler");
const { CombatFactory } = require("../../../../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { EatFoodActionNode } = require("../actions/EatFoodActionNode");

const PROTECTION_DURATION_MS = 10_000;
const RUNNING = Object.freeze({ handled: false, status: "running" });

class ReplenishAfterKillNode {
  constructor(botStatesByName, api) {
    this.eatFoodActionNode = new EatFoodActionNode(botStatesByName, api);
  }

  tick(context) {
    const { player, state } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp) {
      return RUNNING;
    }
    this.clearExpiredPrayerProtection(player, pvp);
    if (pvp.replenishAfterKillPending !== true) {
      return RUNNING;
    }

    pvp.replenishAfterKillPending = false;
    this.eatFoodActionNode.tick(context);

    const profileId = pvp.profileId;
    if (profileId !== PvpProfileId.VETERAN && profileId !== PvpProfileId.ELITE) {
      return RUNNING;
    }

    const closestRealPlayer = this.findClosestRealLocalPlayer(player);
    if (!closestRealPlayer) {
      return RUNNING;
    }

    const prayerId =
      profileId === PvpProfileId.ELITE
        ? this.resolveProtectPrayerForTarget(closestRealPlayer)
        : PrayerHandler.PROTECT_FROM_MELEE;

    PrayerHandler.activatePrayerPrayerId(player, prayerId);
    pvp.replenishPrayerId = prayerId;
    pvp.replenishPrayerUntil = Date.now() + PROTECTION_DURATION_MS;
    return RUNNING;
  }

  clearExpiredPrayerProtection(player, pvp) {
    const expiresAt = Number(pvp?.replenishPrayerUntil ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0 || Date.now() < expiresAt) {
      return;
    }
    const prayerId = Number(pvp?.replenishPrayerId);
    if (Number.isInteger(prayerId) && PrayerHandler.isActivated(player, prayerId)) {
      PrayerHandler.deactivatePrayer(player, prayerId);
    }
    pvp.replenishPrayerId = null;
    pvp.replenishPrayerUntil = 0;
  }

  findClosestRealLocalPlayer(player) {
    const localPlayers = player.getLocalPlayers?.() ?? [];
    const playerLoc = player.getLocation?.();
    let bestTarget = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of localPlayers) {
      if (!isVisibleRealPlayer(player, candidate)) {
        continue;
      }
      const candidateLoc = candidate.getLocation?.();
      const distance = playerLoc && candidateLoc ? playerLoc.getDistance(candidateLoc) : 9999;
      if (distance < bestDistance) {
        bestTarget = candidate;
        bestDistance = distance;
      }
    }

    return bestTarget;
  }

  resolveProtectPrayerForTarget(target) {
    const combatType = CombatFactory.getMethod(target)?.type?.();
    return Number.isInteger(combatType)
      ? PrayerHandler.getProtectingPrayer(combatType)
      : PrayerHandler.PROTECT_FROM_MELEE;
  }
}

module.exports = {
  ReplenishAfterKillNode,
};
