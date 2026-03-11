"use strict";

const { PvpProfileId } = require("../../pvp/PvpProfileRegistry");
const { isVisibleRealPlayer } = require("../../pvp/PvpTargetFilters");
const { PrayerHandler } = require("../../../../../src/main/typescript/elvarg/game/content/PrayerHandler");
const { CombatFactory } = require("../../../../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { Task } = require("../../../../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../../../../src/main/typescript/elvarg/game/task/TaskManager");
const { Misc } = require("../../../../../src/main/typescript/elvarg/util/Misc");
const { EatFoodActionNode } = require("../actions/EatFoodActionNode");

const PROTECTION_DURATION_SECONDS = 10;
const RUNNING = Object.freeze({ handled: false, status: "running" });

class ReplenishAfterKillNode {
  constructor(botStatesByName, api) {
    this.eatFoodActionNode = new EatFoodActionNode(botStatesByName, api);
  }

  tick(context) {
    const { player, state } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp || pvp.replenishAfterKillPending !== true) {
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
    this.schedulePrayerClear(player, prayerId);
    return RUNNING;
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

  schedulePrayerClear(player, prayerId) {
    const token = Number(player.__replenishAfterKillPrayerToken ?? 0) + 1;
    player.__replenishAfterKillPrayerToken = token;
    TaskManager.submit(
      new (class extends Task {
        constructor() {
          super(Misc.getTicks(PROTECTION_DURATION_SECONDS), false);
        }

        execute() {
          this.stop();
          if (player.__replenishAfterKillPrayerToken !== token) {
            return;
          }
          if (player.isRegistered?.() !== true) {
            return;
          }
          if (PrayerHandler.isActivated(player, prayerId)) {
            PrayerHandler.deactivatePrayer(player, prayerId);
          }
        }
      })()
    );
  }
}

module.exports = {
  ReplenishAfterKillNode,
};
