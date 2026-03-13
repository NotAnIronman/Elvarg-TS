"use strict";

const { CombatSpecial } = require("../../../../src/main/typescript/elvarg/game/content/combat/CombatSpecial");
const { Equipment } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Skill } = require("../../../../src/main/typescript/elvarg/game/model/Skill");
const { ItemIdentifiers } = require("../../../../src/main/typescript/elvarg/util/ItemIdentifiers");
const { EquipPacketListener } = require("../../../../src/main/typescript/elvarg/net/packet/impl/EquipPacketListener");
const { getPvpProfile } = require("../pvp/PvpAssignment");

const SUPPORTED_SPEC_WEAPONS = Object.freeze([
  ItemIdentifiers.ANCIENT_GODSWORD,
  ItemIdentifiers.DARK_BOW,
  ItemIdentifiers.DRAGON_DAGGER_P_PLUS_PLUS_,
  ItemIdentifiers.GRANITE_MAUL,
  ItemIdentifiers.MAGIC_SHORTBOW,
  ItemIdentifiers.MAGIC_SHORTBOW_I_,
  ItemIdentifiers.MAGIC_SHORTBOW_3,
]);

const SWITCHABLE_SPEC_WEAPONS = new Set([
  ItemIdentifiers.ANCIENT_GODSWORD,
  ItemIdentifiers.DARK_BOW,
  ItemIdentifiers.DRAGON_DAGGER_P_PLUS_PLUS_,
  ItemIdentifiers.GRANITE_MAUL,
  ItemIdentifiers.MAGIC_SHORTBOW,
  ItemIdentifiers.MAGIC_SHORTBOW_I_,
  ItemIdentifiers.MAGIC_SHORTBOW_3,
]);

const POST_SPEC_SWITCHBACK_DELAY_MS = 900;

function getSpecialForWeaponId(weaponId) {
  if (!Number.isInteger(weaponId) || weaponId <= 0) {
    return null;
  }
  for (const value of Object.values(CombatSpecial)) {
    if (!(value instanceof CombatSpecial)) {
      continue;
    }
    if (value.getIdentifiers?.().includes?.(weaponId)) {
      return value;
    }
  }
  return null;
}

function getWeaponId(player) {
  return player?.getEquipment?.()?.get?.(Equipment.WEAPON_SLOT)?.getId?.() ?? -1;
}

function getOwnHpRatio(player) {
  const current = Math.max(0, Number(player?.getHitpoints?.() ?? 0));
  const maxLevel = player?.getSkillManager?.()?.getMaxLevel?.(Skill.HITPOINTS);
  const max = Math.max(1, Number(maxLevel ?? current ?? 1));
  return current / max;
}

function getTargetHpRatio(target) {
  const current = Math.max(0, Number(target?.getHitpoints?.() ?? 0));
  let max = current;
  if (target?.isPlayer?.() === true) {
    const maxLevel = target?.getSkillManager?.()?.getMaxLevel?.(Skill.HITPOINTS);
    max = Number(maxLevel ?? current ?? 1);
  }
  max = Math.max(1, max);
  return current / max;
}

function resolveInventorySpecWeapon(player, state) {
  const inventory = player?.getInventory?.();
  if (!inventory) {
    return null;
  }
  const preferredId = Number(state?.pvp?.generatedSpecWeaponId ?? -1);
  if (preferredId > 0) {
    const preferredSlot = inventory.getSlotForItemId?.(preferredId) ?? -1;
    if (preferredSlot >= 0) {
      return { weaponId: preferredId, slot: preferredSlot, special: getSpecialForWeaponId(preferredId) };
    }
  }
  for (const weaponId of SUPPORTED_SPEC_WEAPONS) {
    const slot = inventory.getSlotForItemId?.(weaponId) ?? -1;
    if (slot >= 0) {
      return { weaponId, slot, special: getSpecialForWeaponId(weaponId) };
    }
  }
  return null;
}

function shouldPressureSpec(player, state, profile) {
  const ownHpRatio = getOwnHpRatio(player);
  if (ownHpRatio > Number(profile?.specPressureHpRatio ?? 0.3)) {
    return false;
  }
  const lastTaken = Number(state?.pvp?.lastDamageTakenAt ?? 0);
  return lastTaken > 0;
}

function shouldUseSpecNow(player, target, state, profile, special, weaponId) {
  if (!special || !target) {
    return false;
  }
  if (Number(player?.getSpecialPercentage?.() ?? 0) < Number(special.getDrainAmount?.() ?? 101)) {
    return false;
  }
  const targetHpRatio = getTargetHpRatio(target);
  const finisherHpRatio = Number(profile?.specFinisherHpRatio ?? 0.45);
  const pressure = shouldPressureSpec(player, state, profile);
  let chance = Number(profile?.specUseChance ?? 0.3);

  if (targetHpRatio <= finisherHpRatio) {
    chance += 0.15;
  } else if (targetHpRatio <= Math.min(0.72, finisherHpRatio + 0.16)) {
    chance -= 0.04;
  } else if (!pressure) {
    return false;
  }

  if (weaponId === ItemIdentifiers.GRANITE_MAUL) {
    if (targetHpRatio > finisherHpRatio + 0.1 && !pressure) {
      return false;
    }
    chance += 0.1;
  }

  if (weaponId === ItemIdentifiers.ANCIENT_GODSWORD) {
    if (targetHpRatio > finisherHpRatio + 0.18 && !pressure) {
      return false;
    }
  }

  if (
    weaponId === ItemIdentifiers.MAGIC_SHORTBOW ||
    weaponId === ItemIdentifiers.MAGIC_SHORTBOW_I_ ||
    weaponId === ItemIdentifiers.MAGIC_SHORTBOW_3
  ) {
    chance -= 0.08;
  }

  if (weaponId === ItemIdentifiers.DARK_BOW) {
    if (targetHpRatio <= finisherHpRatio + 0.1) {
      chance += 0.12;
    } else if (!pressure) {
      chance -= 0.04;
    }
  }

  chance = Math.max(0.05, Math.min(0.95, chance));
  return Math.random() <= chance;
}

function equipWeaponFromInventory(player, slot, weaponId) {
  if (slot < 0 || weaponId <= 0) {
    return false;
  }
  EquipPacketListener.equip(
    player,
    weaponId,
    slot,
    require("../../../../src/main/typescript/elvarg/game/model/container/impl/Inventory").Inventory.INTERFACE_ID
  );
  return getWeaponId(player) === weaponId;
}

function equipAmmoFromInventory(player, ammoId) {
  if (!player || !Number.isInteger(ammoId) || ammoId <= 0) {
    return false;
  }
  const inventory = player.getInventory?.();
  const slot = inventory?.getSlotForItemId?.(ammoId) ?? -1;
  if (slot < 0) {
    return false;
  }
  EquipPacketListener.equip(
    player,
    ammoId,
    slot,
    require("../../../../src/main/typescript/elvarg/game/model/container/impl/Inventory").Inventory.INTERFACE_ID
  );
  return (
    player?.getEquipment?.()?.get?.(Equipment.AMMUNITION_SLOT)?.getId?.() === ammoId
  );
}

function switchBackToPrimaryWeapon(player, state) {
  const primaryWeaponId = Number(state?.pvp?.generatedPrimaryWeaponId ?? -1);
  if (primaryWeaponId <= 0 || getWeaponId(player) === primaryWeaponId) {
    return false;
  }
  const inventory = player?.getInventory?.();
  const slot = inventory?.getSlotForItemId?.(primaryWeaponId) ?? -1;
  if (slot < 0) {
    return false;
  }
  const switched = equipWeaponFromInventory(player, slot, primaryWeaponId);
  if (!switched) {
    return false;
  }
  const primaryAmmoId = Number(state?.pvp?.generatedPrimaryAmmoId ?? -1);
  if (primaryAmmoId > 0) {
    equipAmmoFromInventory(player, primaryAmmoId);
  }
  return true;
}

function maybeSwitchBackToPrimaryWeapon(context) {
  const { player, state, nowMs } = context ?? {};
  const pvp = state?.pvp;
  if (!player || !pvp) {
    return false;
  }
  const currentWeaponId = getWeaponId(player);
  const primaryWeaponId = Number(pvp.generatedPrimaryWeaponId ?? -1);
  if (
    currentWeaponId <= 0 ||
    primaryWeaponId <= 0 ||
    currentWeaponId === primaryWeaponId ||
    !SWITCHABLE_SPEC_WEAPONS.has(currentWeaponId)
  ) {
    return false;
  }
  if (player?.isSpecialActivated?.() === true) {
    return false;
  }
  if (nowMs < Number(pvp.lastSpecAt ?? 0) + POST_SPEC_SWITCHBACK_DELAY_MS) {
    return false;
  }
  return switchBackToPrimaryWeapon(player, state);
}

function tryActivateSpecial(player) {
  const special = player?.getCombatSpecial?.();
  if (!special) {
    return false;
  }
  if (player?.isSpecialActivated?.() === true) {
    return true;
  }
  const before = player?.isSpecialActivated?.() === true;
  CombatSpecial.activate(player);
  return before !== (player?.isSpecialActivated?.() === true) || player?.isSpecialActivated?.() === true;
}

function maybeUseSpecialAttack(context) {
  const { player, state, target, nowMs, scheduleSpecReview } = context ?? {};
  const pvp = state?.pvp;
  if (!player || !pvp || !target) {
    return false;
  }
  if (nowMs < Number(pvp.nextSpecReviewAt ?? 0)) {
    return false;
  }

  const profile = getPvpProfile(pvp.profileId);
  const currentWeaponId = getWeaponId(player);
  const currentSpecial = player?.getCombatSpecial?.() ?? getSpecialForWeaponId(currentWeaponId);

  if (shouldUseSpecNow(player, target, state, profile, currentSpecial, currentWeaponId)) {
    const activated = tryActivateSpecial(player);
    if (activated) {
      pvp.lastSpecAt = nowMs;
      scheduleSpecReview?.(state, nowMs);
      return true;
    }
  }

  const inventorySpec = resolveInventorySpecWeapon(player, state);
  const switchChance = Number(profile?.specSwitchChance ?? 0.4);
  if (
    inventorySpec &&
    SWITCHABLE_SPEC_WEAPONS.has(inventorySpec.weaponId) &&
    Math.random() <= switchChance &&
    shouldUseSpecNow(player, target, state, profile, inventorySpec.special, inventorySpec.weaponId)
  ) {
    if (equipWeaponFromInventory(player, inventorySpec.slot, inventorySpec.weaponId)) {
      const specAmmoId = Number(pvp.generatedSpecAmmoId ?? -1);
      if (specAmmoId > 0) {
        equipAmmoFromInventory(player, specAmmoId);
      }
      const activated = tryActivateSpecial(player);
      if (activated) {
        pvp.lastSpecAt = nowMs;
      }
      scheduleSpecReview?.(state, nowMs);
      return true;
    }
  }

  if (
    currentWeaponId > 0 &&
    currentWeaponId !== Number(pvp.generatedPrimaryWeaponId ?? -1) &&
    currentSpecial &&
    !player?.isSpecialActivated?.()
  ) {
    switchBackToPrimaryWeapon(player, state);
  }

  scheduleSpecReview?.(state, nowMs);
  return false;
}

module.exports = {
  maybeSwitchBackToPrimaryWeapon,
  maybeUseSpecialAttack,
};
