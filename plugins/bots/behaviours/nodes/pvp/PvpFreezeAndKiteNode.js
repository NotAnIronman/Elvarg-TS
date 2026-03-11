"use strict";

const { CombatSpells } = require("../../../../../src/main/typescript/elvarg/game/content/combat/magic/CombatSpells");
const { MagicSpellbook } = require("../../../../../src/main/typescript/elvarg/game/model/MagicSpellbook");
const { Equipment } = require("../../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { RegionManager } = require("../../../../../src/main/typescript/elvarg/game/collision/RegionManager");
const { Location } = require("../../../../../src/main/typescript/elvarg/game/model/Location");
const { TimerKey } = require("../../../../../src/main/typescript/elvarg/util/timers/TimerKey");
const { WeaponInterfaces } = require("../../../../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces");

const RANGED_WEAPON_INTERFACES = new Set([
  WeaponInterfaces.SHORTBOW,
  WeaponInterfaces.LONGBOW,
  WeaponInterfaces.DARK_BOW,
  WeaponInterfaces.CROSSBOW,
  WeaponInterfaces.KARILS_CROSSBOW,
  WeaponInterfaces.KNIFE,
  WeaponInterfaces.OBBY_RINGS,
  WeaponInterfaces.THROWNAXE,
  WeaponInterfaces.DART,
  WeaponInterfaces.JAVELIN,
]);

const PROFILE_FREEZE_SPELLS = Object.freeze({
  standard: CombatSpells.BIND,
  veteran: CombatSpells.SNARE,
  elite: CombatSpells.ENTANGLE,
});

class PvpFreezeAndKiteNode {
  constructor(options = {}) {
    this.setPhase = options.setPhase;
    this.getProfile = options.getProfile;
    this.scheduleCombatAction = options.scheduleCombatAction;
    this.scheduleFreezeReview = options.scheduleFreezeReview;
    this.pvpPhase = options.pvpPhase;
  }

  tick(context) {
    const { player, state, nowMs, target } = context ?? {};
    const pvp = state?.pvp;
    if (!player || !state || !pvp || !target) {
      return { handled: false, status: "failure" };
    }
    if (typeof pvp.loadoutId === "string" && pvp.loadoutId.startsWith("f2p_")) {
      return { handled: false, status: "running" };
    }

    const profile = this.getProfile?.(state) ?? null;
    const openerFreeze = this.shouldOpenWithFreeze(player, state, target, profile);

    if (!openerFreeze && nowMs < Number(pvp.nextFreezeReviewAt ?? 0)) {
      return { handled: false, status: "running" };
    }

    const finish = (handled = false, status = "running") => {
      this.scheduleFreezeReview?.(state, nowMs);
      return { handled, status };
    };

    if (!openerFreeze && nowMs < Number(pvp.nextActionAt ?? 0)) {
      return finish(false, "running");
    }

    if (!this.isMeleeOpponent(target)) {
      return finish(false, "running");
    }
    if (!this.hasBindableMagic(player)) {
      return finish(false, "running");
    }
    if (target.getTimers?.().has?.(TimerKey.FREEZE) || target.getTimers?.().has?.(TimerKey.FREEZE_IMMUNITY)) {
      return finish(false, "running");
    }

    const freezeSpell = PROFILE_FREEZE_SPELLS[profile?.id ?? ""] ?? null;
    if (!freezeSpell) {
      return finish(false, "running");
    }

    const freezeUseChance = Number(profile?.freezeUseChance ?? 0);
    if (!openerFreeze && (freezeUseChance <= 0 || Math.random() > freezeUseChance)) {
      return finish(false, "running");
    }

    const combat = player.getCombat?.();
    if (!combat) {
      return finish(false, "failure");
    }

    const currentTarget = combat.getTarget?.();
    if (currentTarget && currentTarget !== target) {
      combat.reset?.();
    }

    combat.castSpellOn?.(target, freezeSpell);
    pvp.lastFreezeAt = nowMs;
    this.scheduleCombatAction?.(state, nowMs);
    this.setPhase?.(state, this.pvpPhase?.COMBAT ?? "combat");
    this.tryKiteAway(player, target, profile);
    return finish(true, "running");
  }

  shouldOpenWithFreeze(player, state, target, profile) {
    const profileId = profile?.id ?? "";
    if (profileId !== "veteran" && profileId !== "elite") {
      return false;
    }
    if (state?.pvp?.preferredCombatStyle === "melee") {
      return false;
    }
    const combat = player?.getCombat?.();
    const currentTarget = combat?.getTarget?.() ?? null;
    const attacker = combat?.getAttacker?.() ?? null;
    const alreadyEngaged =
      currentTarget === target ||
      attacker === target ||
      player?.getFollowing?.() === target ||
      player?.getCombatFollowing?.() === target;
    if (alreadyEngaged) {
      return false;
    }
    if (target?.getTimers?.().has?.(TimerKey.FREEZE) || target?.getTimers?.().has?.(TimerKey.FREEZE_IMMUNITY)) {
      return false;
    }
    return true;
  }

  hasBindableMagic(player) {
    if (!player) {
      return false;
    }
    if (player.getSpellbook?.() !== MagicSpellbook.NORMAL) {
      return false;
    }

    const autocastSpell = player.getCombat?.().getAutocastSpell?.() ?? null;
    if (autocastSpell?.spellId?.() === CombatSpells.ICE_BARRAGE.spellId()) {
      return false;
    }
    if (autocastSpell) {
      return true;
    }
    if (player.getEquipment?.().hasStaffEquipped?.()) {
      return true;
    }

    const inventoryItems = player.getInventory?.().getItems?.() ?? [];
    for (const item of inventoryItems) {
      const itemId = item?.getId?.() ?? -1;
      if (itemId <= 0) {
        continue;
      }
      const weaponInterface = item.getDefinition?.()?.getWeaponInterface?.();
      if (weaponInterface === WeaponInterfaces.STAFF || weaponInterface === WeaponInterfaces.ANCIENT_STAFF) {
        return true;
      }
    }
    return false;
  }

  isMeleeOpponent(target) {
    if (!target?.isPlayer?.()) {
      return false;
    }
    if (target.getEquipment?.().hasStaffEquipped?.()) {
      return false;
    }
    const weaponInterface = target.getWeapon?.();
    return !RANGED_WEAPON_INTERFACES.has(weaponInterface);
  }

  tryKiteAway(player, target, profile) {
    const playerLoc = player.getLocation?.();
    const targetLoc = target.getLocation?.();
    const movementQueue = player.getMovementQueue?.();
    if (!playerLoc || !targetLoc || !movementQueue) {
      return false;
    }

    const size = Number(player.getSize?.() ?? 1);
    const privateArea = player.getPrivateArea?.() ?? null;
    const dx = Math.sign(playerLoc.getX() - targetLoc.getX());
    const dy = Math.sign(playerLoc.getY() - targetLoc.getY());
    const directionCandidates = this.buildDirectionCandidates(dx, dy);
    const kiteDistance =
      Number(profile?.id === "elite" ? 3 : profile?.id === "veteran" ? 2 : 2);

    let bestPath = null;
    let bestDistance = playerLoc.getDistance?.(targetLoc) ?? 0;
    for (const [stepX, stepY] of directionCandidates) {
      const path = [];
      let cursor = playerLoc.clone?.() ?? new Location(playerLoc.getX(), playerLoc.getY(), playerLoc.getZ());
      for (let i = 0; i < kiteDistance; i++) {
        const next = cursor.transform(stepX * size, stepY * size);
        if (RegionManager.blocked(next, privateArea)) {
          break;
        }
        if (!RegionManager.canMovestart(cursor, next, size, size, privateArea)) {
          break;
        }
        if (this.isOccupied(next, player, target, privateArea)) {
          break;
        }
        path.push(next);
        cursor = next;
      }
      if (path.length === 0) {
        continue;
      }
      const finalDistance = path[path.length - 1].getDistance(targetLoc);
      if (finalDistance > bestDistance) {
        bestDistance = finalDistance;
        bestPath = path;
      }
    }

    if (!bestPath || bestPath.length === 0) {
      return false;
    }

    movementQueue.reset?.();
    movementQueue.addFirstStep?.(bestPath[0]);
    for (let i = 1; i < bestPath.length; i++) {
      movementQueue.addSteps?.(bestPath[i]);
    }
    player.getTimers?.().registers?.(TimerKey.STEPPING_OUT, 2);
    player.setPositionToFaceCoordinates?.(
      targetLoc.getX(),
      targetLoc.getY(),
      targetLoc.getZ()
    );
    return true;
  }

  buildDirectionCandidates(dx, dy) {
    const candidates = [];
    const add = (x, y) => {
      if (!x && !y) {
        return;
      }
      if (!candidates.some(([cx, cy]) => cx === x && cy === y)) {
        candidates.push([x, y]);
      }
    };

    add(dx, dy);
    add(dx, 0);
    add(0, dy);
    add(-dy, dx);
    add(dy, -dx);
    add(-dx, dy);
    add(dx, -dy);
    add(-1, 0);
    add(1, 0);
    add(0, -1);
    add(0, 1);
    return candidates;
  }

  isOccupied(tile, player, target, privateArea) {
    const localPlayers = player.getLocalPlayers?.() ?? [];
    for (const candidate of localPlayers) {
      if (!candidate || candidate === player || candidate === target) {
        continue;
      }
      if (!candidate.isRegistered?.()) {
        continue;
      }
      if (candidate.getPrivateArea?.() !== privateArea) {
        continue;
      }
      const loc = candidate.getLocation?.();
      if (!loc) {
        continue;
      }
      if (
        loc.getX() === tile.getX() &&
        loc.getY() === tile.getY() &&
        loc.getZ() === tile.getZ()
      ) {
        return true;
      }
    }
    return false;
  }
}

module.exports = {
  PvpFreezeAndKiteNode,
};
