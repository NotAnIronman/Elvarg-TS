"use strict";

const { CombatFactory } = require("../../../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { CombatType } = require("../../../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { CombatSpells } = require("../../../../src/main/typescript/elvarg/game/content/combat/magic/CombatSpells");
const { MagicSpellbook } = require("../../../../src/main/typescript/elvarg/game/model/MagicSpellbook");
const { PrayerHandler } = require("../../../../src/main/typescript/elvarg/game/content/PrayerHandler");
const { Skill } = require("../../../../src/main/typescript/elvarg/game/model/Skill");
const { Equipment } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { EquipPacketListener } = require("../../../../src/main/typescript/elvarg/net/packet/impl/EquipPacketListener");
const { TimerKey } = require("../../../../src/main/typescript/elvarg/util/timers/TimerKey");
const { WeaponInterfaces } = require("../../../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces");
const { ItemIdentifiers } = require("../../../../src/main/typescript/elvarg/util/ItemIdentifiers");

const { Inventory } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Inventory");

const PRESSURE_WINDOW_TICKS = 1;
const MELEE_DISTANCE_TILES = 1;
const SPEC_WEAPON_IDS = new Set([
  ItemIdentifiers.ANCIENT_GODSWORD,
  ItemIdentifiers.DARK_BOW,
  ItemIdentifiers.DRAGON_DAGGER_P_PLUS_PLUS_,
  ItemIdentifiers.GRANITE_MAUL,
  ItemIdentifiers.MAGIC_SHORTBOW,
  ItemIdentifiers.MAGIC_SHORTBOW_I_,
  ItemIdentifiers.MAGIC_SHORTBOW_3,
]);
const STAFF_INTERFACES = new Set([
  WeaponInterfaces.STAFF,
  WeaponInterfaces.ANCIENT_STAFF,
]);
const RANGED_INTERFACES = new Set([
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
const BOW_INTERFACES = new Set([
  WeaponInterfaces.SHORTBOW,
  WeaponInterfaces.LONGBOW,
  WeaponInterfaces.DARK_BOW,
]);
const CROSSBOW_INTERFACES = new Set([
  WeaponInterfaces.CROSSBOW,
  WeaponInterfaces.KARILS_CROSSBOW,
]);
const ARROW_IDS = new Set([
  ItemIdentifiers.ADAMANT_ARROW,
  ItemIdentifiers.BROAD_ARROW,
  ItemIdentifiers.DRAGON_ARROW,
  ItemIdentifiers.RUNE_ARROW,
]);
const BOLT_IDS = new Set([
  ItemIdentifiers.DRAGON_BOLTS,
  ItemIdentifiers.DRAGON_BOLTS_E_,
]);
const FREEZE_SPELLS = Object.freeze({
  veteran: CombatSpells.SNARE,
  elite: CombatSpells.ENTANGLE,
});

function isVeteranOrEliteProfile(profile) {
  return profile?.id === "veteran" || profile?.id === "elite";
}

function getWeaponId(player) {
  return player?.getEquipment?.()?.get?.(Equipment.WEAPON_SLOT)?.getId?.() ?? -1;
}

function getAmmoId(player) {
  return player?.getEquipment?.()?.get?.(Equipment.AMMUNITION_SLOT)?.getId?.() ?? -1;
}

function getDistance(player, target) {
  const playerLoc = player?.getLocation?.();
  const targetLoc = target?.getLocation?.();
  if (!playerLoc || !targetLoc || playerLoc.getZ?.() !== targetLoc.getZ?.()) {
    return 99;
  }
  return Number(playerLoc.getDistance?.(targetLoc) ?? 99);
}

function getTargetHpRatio(target) {
  const current = Math.max(
    0,
    Number(target?.getHitpointsAfterPendingDamage?.() ?? target?.getHitpoints?.() ?? 0)
  );
  let max = current;
  if (target?.isPlayer?.() === true) {
    max = Number(target?.getSkillManager?.()?.getMaxLevel?.(Skill.HITPOINTS) ?? current ?? 1);
  }
  return current / Math.max(1, max);
}

function isAttackWindowOpen(player) {
  const timers = player?.getTimers?.();
  return (
    timers?.willEndIn?.(TimerKey.COMBAT_ATTACK, PRESSURE_WINDOW_TICKS) === true ||
    timers?.has?.(TimerKey.COMBAT_ATTACK) !== true
  );
}

function isStaffInterface(weaponInterface) {
  return STAFF_INTERFACES.has(weaponInterface);
}

function isRangedInterface(weaponInterface) {
  return RANGED_INTERFACES.has(weaponInterface);
}

function classifyWeaponInterface(weaponInterface) {
  if (!weaponInterface) {
    return null;
  }
  if (isStaffInterface(weaponInterface)) {
    return CombatType.MAGIC;
  }
  if (isRangedInterface(weaponInterface)) {
    return CombatType.RANGED;
  }
  if (weaponInterface === WeaponInterfaces.UNARMED) {
    return null;
  }
  return CombatType.MELEE;
}

function findInventoryItem(player, predicate) {
  const items = player?.getInventory?.()?.getItems?.() ?? [];
  for (const item of items) {
    const itemId = item?.getId?.() ?? -1;
    if (itemId <= 0 || predicate(item, itemId) !== true) {
      continue;
    }
    const slot = player?.getInventory?.()?.getSlotForItemId?.(itemId) ?? -1;
    if (slot >= 0) {
      return { item, itemId, slot };
    }
  }
  return null;
}

function equipInventoryItem(player, slot, itemId) {
  if (!player || slot < 0 || itemId <= 0) {
    return false;
  }
  EquipPacketListener.equip(player, itemId, slot, Inventory.INTERFACE_ID);
  return true;
}

function resolveAmmoCandidate(player, weaponInterface) {
  const equippedAmmoId = getAmmoId(player);
  if (equippedAmmoId > 0) {
    if (BOW_INTERFACES.has(weaponInterface) && ARROW_IDS.has(equippedAmmoId)) {
      return { ammoId: equippedAmmoId, slot: -1 };
    }
    if (CROSSBOW_INTERFACES.has(weaponInterface) && BOLT_IDS.has(equippedAmmoId)) {
      return { ammoId: equippedAmmoId, slot: -1 };
    }
  }
  if (!BOW_INTERFACES.has(weaponInterface) && !CROSSBOW_INTERFACES.has(weaponInterface)) {
    return null;
  }
  return findInventoryItem(player, (_item, itemId) =>
    BOW_INTERFACES.has(weaponInterface) ? ARROW_IDS.has(itemId) : BOLT_IDS.has(itemId)
  );
}

function resolveCurrentCandidate(player) {
  const weapon = player?.getWeapon?.();
  const weaponId = getWeaponId(player);
  const combatType = classifyWeaponInterface(weapon);
  if (!weapon || weaponId <= 0 || combatType == null) {
    return null;
  }
  return {
    combatType,
    weaponId,
    slot: -1,
    weaponInterface: weapon,
    ammo: resolveAmmoCandidate(player, weapon),
    current: true,
  };
}

function resolveInventoryCandidates(player, state) {
  const candidates = [];
  const items = player?.getInventory?.()?.getItems?.() ?? [];
  const generatedPrimaryWeaponId = Number(state?.pvp?.generatedPrimaryWeaponId ?? -1);
  const generatedSpecWeaponId = Number(state?.pvp?.generatedSpecWeaponId ?? -1);

  for (const item of items) {
    const itemId = item?.getId?.() ?? -1;
    if (itemId <= 0) {
      continue;
    }
    if (
      itemId === generatedSpecWeaponId ||
      (SPEC_WEAPON_IDS.has(itemId) && itemId !== generatedPrimaryWeaponId)
    ) {
      continue;
    }
    const weaponInterface = item?.getDefinition?.()?.getWeaponInterface?.();
    const combatType = classifyWeaponInterface(weaponInterface);
    if (combatType == null) {
      continue;
    }
    const slot = player?.getInventory?.()?.getSlotForItemId?.(itemId) ?? -1;
    if (slot < 0) {
      continue;
    }
    candidates.push({
      combatType,
      weaponId: itemId,
      slot,
      weaponInterface,
      ammo: resolveAmmoCandidate(player, weaponInterface),
      current: itemId === generatedPrimaryWeaponId,
    });
  }

  return candidates;
}

function resolveStyleCandidates(player, state) {
  const byType = new Map();
  const currentCandidate = resolveCurrentCandidate(player);
  if (currentCandidate) {
    byType.set(currentCandidate.combatType, currentCandidate);
  }
  for (const candidate of resolveInventoryCandidates(player, state)) {
    const existing = byType.get(candidate.combatType);
    if (!existing || (!existing.current && candidate.current)) {
      byType.set(candidate.combatType, candidate);
    }
  }
  return byType;
}

function isLikelyMeleeThreat(target) {
  const targetWeapon = target?.getWeapon?.();
  if (!targetWeapon) {
    return false;
  }
  if (isStaffInterface(targetWeapon) || isRangedInterface(targetWeapon)) {
    return false;
  }
  return true;
}

function canUseMagicPressure(player) {
  const combat = player?.getCombat?.();
  return combat?.getAutocastSpell?.() != null;
}

function shouldUseFreeze(player, target, profile, magicCandidate) {
  if (!magicCandidate || !isVeteranOrEliteProfile(profile)) {
    return false;
  }
  if (player?.getSpellbook?.() !== MagicSpellbook.NORMAL) {
    return false;
  }
  if (!isLikelyMeleeThreat(target)) {
    return false;
  }
  if (target?.getTimers?.().has?.(TimerKey.FREEZE) || target?.getTimers?.().has?.(TimerKey.FREEZE_IMMUNITY)) {
    return false;
  }
  return Math.random() <= Number(profile?.nextHitFreezeChance ?? profile?.freezeUseChance ?? 0);
}

function scoreCandidate(candidate, player, target, state, profile) {
  if (!candidate) {
    return Number.NEGATIVE_INFINITY;
  }
  const targetPrayers = target?.getPrayerActive?.() ?? [];
  const targetHpRatio = getTargetHpRatio(target);
  const distance = getDistance(player, target);
  const preferredStyle = state?.pvp?.preferredCombatStyle;
  let score = candidate.current ? 0.45 : 0.2;

  if (candidate.combatType === CombatType.MAGIC && !canUseMagicPressure(player)) {
    return Number.NEGATIVE_INFINITY;
  }

  try {
    const protectingPrayer = PrayerHandler.getProtectingPrayer(candidate.combatType);
    if (targetPrayers[protectingPrayer] === true) {
      score -= 1.4;
    } else {
      score += 0.7;
    }
  } catch (_error) {
    score += 0.2;
  }

  if (
    (candidate.combatType === CombatType.MAGIC && preferredStyle === "hybrid") ||
    (candidate.combatType === CombatType.RANGED && preferredStyle === "range") ||
    (candidate.combatType === CombatType.MELEE && preferredStyle === "melee")
  ) {
    score += 0.12;
  }

  if (candidate.combatType === CombatType.MELEE) {
    if (distance <= MELEE_DISTANCE_TILES) {
      score += 0.95;
    } else {
      score -= 1.1;
    }
    if (targetHpRatio <= Number(profile?.nextHitMeleeFinisherHpRatio ?? 0.45)) {
      score += 0.95;
    }
    if (target?.getTimers?.().has?.(TimerKey.FREEZE)) {
      score += 0.2;
    }
  } else if (candidate.combatType === CombatType.RANGED) {
    if (distance > MELEE_DISTANCE_TILES) {
      score += 0.65;
    }
    if (target?.getTimers?.().has?.(TimerKey.FREEZE)) {
      score += 0.55;
    }
    if (!candidate.ammo && (BOW_INTERFACES.has(candidate.weaponInterface) || CROSSBOW_INTERFACES.has(candidate.weaponInterface))) {
      score -= 2;
    }
  } else if (candidate.combatType === CombatType.MAGIC) {
    if (isLikelyMeleeThreat(target)) {
      score += 0.45;
    }
    if (!target?.getTimers?.().has?.(TimerKey.FREEZE) && !target?.getTimers?.().has?.(TimerKey.FREEZE_IMMUNITY)) {
      score += 0.25;
    }
  }

  return score;
}

function chooseBestCandidate(candidates, player, target, state, profile) {
  let bestCandidate = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates.values()) {
    const score = scoreCandidate(candidate, player, target, state, profile);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

function maybeEquipCandidate(player, candidate) {
  if (!candidate) {
    return false;
  }
  if (candidate.slot >= 0) {
    equipInventoryItem(player, candidate.slot, candidate.weaponId);
  }
  if (candidate.ammo && candidate.ammo.slot >= 0) {
    equipInventoryItem(player, candidate.ammo.slot, candidate.ammo.ammoId ?? candidate.ammo.itemId);
  }
  return getWeaponId(player) === candidate.weaponId;
}

function tryQueuedSpecialAttack(player, target) {
  const combat = player?.getCombat?.();
  if (!combat || !target) {
    return false;
  }
  const graniteQueued = combat.isGraniteMaulSpecialQueued?.() === true;
  if (player?.isSpecialActivated?.() !== true && !graniteQueued) {
    return false;
  }
  combat.attack(target);
  return true;
}

function executePressureStyle(player, target, candidate) {
  const combat = player?.getCombat?.();
  if (!combat || !candidate) {
    return false;
  }
  if (!maybeEquipCandidate(player, candidate)) {
    return false;
  }
  if (candidate.combatType !== CombatType.MAGIC) {
    combat.setCastSpell?.(null);
  }
  combat.attack(target);
  return true;
}

function maybeRunPressureCombatScript(context) {
  const {
    player,
    state,
    target,
    nowMs,
    profile,
    scheduleCombatAction,
    scheduleFreezeReview,
  } = context ?? {};
  const pvp = state?.pvp;
  if (!player || !target || !pvp || !isVeteranOrEliteProfile(profile)) {
    return { handled: false, forcedCombatType: null };
  }
  if (!isAttackWindowOpen(player)) {
    return { handled: false, forcedCombatType: null };
  }

  if (tryQueuedSpecialAttack(player, target)) {
    pvp.lastPressureScriptAt = nowMs;
    scheduleCombatAction?.(state, nowMs);
    return { handled: true, forcedCombatType: CombatFactory.getMethod(player)?.type?.() ?? null };
  }

  const cooldownMs = Math.max(200, Number(profile?.nextHitScriptCooldownMs ?? 450));
  if (nowMs < Number(pvp.lastPressureScriptAt ?? 0) + cooldownMs) {
    return { handled: false, forcedCombatType: null };
  }
  if (Math.random() > Number(profile?.nextHitScriptChance ?? 0.6)) {
    return { handled: false, forcedCombatType: null };
  }

  const candidates = resolveStyleCandidates(player, state);
  const magicCandidate = candidates.get(CombatType.MAGIC) ?? null;
  if (shouldUseFreeze(player, target, profile, magicCandidate)) {
    if (maybeEquipCandidate(player, magicCandidate)) {
      player.getCombat?.().castSpellOn?.(target, FREEZE_SPELLS[profile.id]);
      pvp.lastFreezeAt = nowMs;
      pvp.lastPressureScriptAt = nowMs;
      scheduleCombatAction?.(state, nowMs);
      scheduleFreezeReview?.(state, nowMs);
      return { handled: true, forcedCombatType: CombatType.MAGIC };
    }
  }

  const bestCandidate = chooseBestCandidate(candidates, player, target, state, profile);
  if (!bestCandidate) {
    return { handled: false, forcedCombatType: null };
  }
  if (bestCandidate.slot >= 0) {
    const switchChance = Number(profile?.nextHitStyleSwitchChance ?? profile?.switchChance ?? 0.5);
    if (Math.random() > switchChance) {
      return { handled: false, forcedCombatType: null };
    }
  }
  if (!executePressureStyle(player, target, bestCandidate)) {
    return { handled: false, forcedCombatType: null };
  }

  pvp.lastPressureScriptAt = nowMs;
  scheduleCombatAction?.(state, nowMs);
  return { handled: true, forcedCombatType: bestCandidate.combatType };
}

module.exports = {
  maybeRunPressureCombatScript,
};
