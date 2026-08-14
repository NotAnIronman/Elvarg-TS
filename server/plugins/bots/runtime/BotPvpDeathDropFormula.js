"use strict";

const { ItemDefinition } = require("../../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { Equipment } = require("../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { PvpProfileId } = require("../behaviours/pvp/PvpProfileRegistry");

const DROP_GROUPS = Object.freeze([
  Object.freeze({
    id: "armor_core",
    slots: Object.freeze([
      Equipment.HEAD_SLOT,
      Equipment.BODY_SLOT,
      Equipment.LEG_SLOT,
      Equipment.FEET_SLOT,
    ]),
  }),
  Object.freeze({
    id: "weapon_or_shield",
    slots: Object.freeze([Equipment.WEAPON_SLOT, Equipment.SHIELD_SLOT]),
  }),
  Object.freeze({
    id: "jewelry_and_accessories",
    slots: Object.freeze([
      Equipment.AMULET_SLOT,
      Equipment.RING_SLOT,
      Equipment.HANDS_SLOT,
      Equipment.CAPE_SLOT,
    ]),
  }),
]);

const BASE_UNSKULLED_GROUP_DROP_CHANCE = 0.2;
const PROFILE_GROUP_DROP_CHANCE_BONUS = Object.freeze({
  [PvpProfileId.NOVICE]: 0,
  [PvpProfileId.STANDARD]: 0.08,
  [PvpProfileId.VETERAN]: 0.18,
  [PvpProfileId.ELITE]: 0.3,
});
const KILLSTREAK_GROUP_DROP_CHANCE_PER_KILL = 0.02;
const KILLSTREAK_GROUP_DROP_CHANCE_CAP = 0.3;

function clampChance(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function resolveProfileChanceBonus(profileId) {
  return PROFILE_GROUP_DROP_CHANCE_BONUS[String(profileId ?? "").toLowerCase()] ?? 0;
}

function resolveKillstreakChanceBonus(victim) {
  const streak = Math.max(0, Number(victim?.getKillstreak?.() ?? 0));
  return Math.min(KILLSTREAK_GROUP_DROP_CHANCE_CAP, streak * KILLSTREAK_GROUP_DROP_CHANCE_PER_KILL);
}

function resolveUnskulledGroupDropChance(victim, profileId) {
  return clampChance(
    BASE_UNSKULLED_GROUP_DROP_CHANCE +
      resolveProfileChanceBonus(profileId) +
      resolveKillstreakChanceBonus(victim)
  );
}

function isTradeableDropableItem(item) {
  if (!item || item.getId?.() <= 0) {
    return false;
  }
  const definition = item.getDefinition?.() ?? ItemDefinition.forId(item.getId());
  return definition?.isTradeable?.() === true && definition?.isDropable?.() === true;
}

function collectCandidatesBySlots(victim, slots) {
  const equipmentItems = victim?.getEquipment?.()?.getItems?.() ?? [];
  const candidates = [];
  for (const slot of slots) {
    const item = equipmentItems[slot];
    if (!isTradeableDropableItem(item)) {
      continue;
    }
    candidates.push(item);
  }
  return candidates;
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length <= 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function shouldDropGroup(victim, chance) {
  if ((victim?.getSkullTimer?.() ?? 0) > 0) {
    return true;
  }
  return Math.random() < chance;
}

function buildPvpEquipmentDropPlan(victim, profileId) {
  const drops = new WeakSet();
  const unskulledGroupDropChance = resolveUnskulledGroupDropChance(victim, profileId);
  for (const group of DROP_GROUPS) {
    const candidates = collectCandidatesBySlots(victim, group.slots);
    if (candidates.length <= 0) {
      continue;
    }
    if (!shouldDropGroup(victim, unskulledGroupDropChance)) {
      continue;
    }
    const selected = pickRandom(candidates);
    if (selected) {
      drops.add(selected);
    }
  }
  return drops;
}

module.exports = {
  buildPvpEquipmentDropPlan,
  resolveUnskulledGroupDropChance,
};
