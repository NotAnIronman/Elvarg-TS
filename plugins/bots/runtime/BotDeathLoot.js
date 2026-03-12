"use strict";

const { ItemDefinition } = require("../../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { ItemOnGroundManager } = require("../../../src/main/typescript/elvarg/game/entity/impl/grounditem/ItemOnGroundManager");
const { Equipment } = require("../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Item } = require("../../../src/main/typescript/elvarg/game/model/Item");
const { ItemIdentifiers } = require("../../../src/main/typescript/elvarg/util/ItemIdentifiers");
const { ItemIds } = require("../../../src/main/typescript/elvarg/util/IdEnums");
const {
  ATTR_BOT_PVP_PROFILE_ID,
  ATTR_CUSTOM_DEATH_LOOT_DROPPED,
} = require("./BotRecruitConstants");
const { PvpProfileId } = require("../behaviours/pvp/PvpProfileRegistry");

const PROFILE_LOOT_RULES = Object.freeze({
  [PvpProfileId.NOVICE]: Object.freeze({
    bloodMoney: 75,
    unskulledGearDropChance: 0.18,
  }),
  [PvpProfileId.STANDARD]: Object.freeze({
    bloodMoney: 150,
    unskulledGearDropChance: 0.35,
  }),
  [PvpProfileId.VETERAN]: Object.freeze({
    bloodMoney: 300,
    unskulledGearDropChance: 0.58,
  }),
  [PvpProfileId.ELITE]: Object.freeze({
    bloodMoney: 500,
    unskulledGearDropChance: 0.82,
  }),
});

const FOOD_ITEM_IDS = new Set([
  ItemIds.LOBSTER,
  ItemIds.MONKFISH,
  ItemIds.SHARK,
  ItemIds.SEA_TURTLE,
  ItemIds.DARK_CRAB,
  ItemIds.MANTA_RAY,
  ItemIds.COOKED_KARAMBWAN,
  ItemIds.ANGLERFISH,
]);

const POTION_NAME_PATTERNS = [
  "potion",
  "brew",
  "restore",
  "guthix rest",
  "mix",
];

const deathLootPlans = new WeakMap();

function getProfileLootRules(profileId) {
  return PROFILE_LOOT_RULES[String(profileId ?? "").toLowerCase()] ?? PROFILE_LOOT_RULES.standard;
}

function isRealPlayer(player) {
  return player?.isRegistered?.() === true && player?.isPlayerBot?.() !== true;
}

function shouldSuppressDefaultBotDrops(victim) {
  return victim?.isPlayerBot?.() === true;
}

function isPotionItem(item) {
  const name = String(item?.getDefinition?.()?.getName?.() ?? "").toLowerCase();
  if (!name) {
    return false;
  }
  return POTION_NAME_PATTERNS.some((pattern) => name.includes(pattern));
}

function isSupplyItem(item) {
  const itemId = item?.getId?.();
  return FOOD_ITEM_IDS.has(itemId) || isPotionItem(item);
}

function resolveProfileId(victim, runtime) {
  return (
    victim?.getAttribute?.(ATTR_BOT_PVP_PROFILE_ID) ??
    runtime?.entriesByUsername?.get?.(victim?.getUsername?.())?.state?.pvp?.profileId ??
    PvpProfileId.STANDARD
  );
}

function rewardBloodMoney(killer, victim, amount) {
  if (!killer || amount <= 0) {
    return;
  }
  victim.setAttribute?.(ATTR_CUSTOM_DEATH_LOOT_DROPPED, true);
  if (
    killer.getInventory?.().contains?.(ItemIdentifiers.BLOOD_MONEY) ||
    (killer.getInventory?.().getFreeSlots?.() ?? 0) > 0
  ) {
    killer.getInventory().adds(ItemIdentifiers.BLOOD_MONEY, amount);
  } else {
    ItemOnGroundManager.registerNonGlobals(
      killer,
      new Item(ItemIdentifiers.BLOOD_MONEY, amount),
      victim.getLocation?.()?.clone?.() ?? victim.getLocation?.()
    );
  }
  killer
    .getPacketSender?.()
    .sendMessage?.(`You've received ${amount} blood money for that kill!`);
}

function resolveEquipmentGearDrop(victim, rules) {
  const candidates = [];
  const equipmentItems = victim?.getEquipment?.()?.getItems?.() ?? [];
  for (let slot = 0; slot < equipmentItems.length; slot++) {
    const item = equipmentItems[slot];
    if (!item || item.getId?.() <= 0 || slot === Equipment.AMMUNITION_SLOT) {
      continue;
    }
    const definition = item.getDefinition?.() ?? ItemDefinition.forId(item.getId());
    if (!definition?.isTradeable?.() || !definition?.isDropable?.()) {
      continue;
    }
    candidates.push(item);
  }
  if (candidates.length <= 0) {
    return null;
  }

  const skulled = (victim?.getSkullTimer?.() ?? 0) > 0;
  if (!skulled && Math.random() > rules.unskulledGearDropChance) {
    return null;
  }
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function buildDropSet(victim, rules) {
  const drops = new WeakSet();
  const inventoryItems = victim?.getInventory?.()?.getValidItems?.() ?? [];
  const equipmentItems = victim?.getEquipment?.()?.getValidItems?.() ?? [];

  for (const item of inventoryItems) {
    if (isSupplyItem(item)) {
      drops.add(item);
    }
  }
  for (const item of equipmentItems) {
    if (isSupplyItem(item)) {
      drops.add(item);
    }
  }

  const gearDrop = resolveEquipmentGearDrop(victim, rules);
  if (gearDrop) {
    drops.add(gearDrop);
  }

  return drops;
}

function getOrCreateDeathLootPlan(victim, killer, runtime, shouldDropItems) {
  let plan = deathLootPlans.get(victim);
  if (plan) {
    return plan;
  }

  const canRewardKiller = isRealPlayer(killer);
  const rules = getProfileLootRules(resolveProfileId(victim, runtime));
  if (canRewardKiller) {
    rewardBloodMoney(killer, victim, rules.bloodMoney);
  }

  plan = {
    drops: canRewardKiller ? buildDropSet(victim, rules) : new WeakSet(),
    killer: canRewardKiller ? killer : null,
  };
  deathLootPlans.set(victim, plan);
  return plan;
}

function handleBotDeathItemDrop(event, runtime) {
  const victim = event?.player;
  if (!shouldSuppressDefaultBotDrops(victim)) {
    return;
  }

  event.handled = true;

  const plan = getOrCreateDeathLootPlan(
    victim,
    event?.killer,
    runtime,
    event?.shouldDropItems === true
  );
  if (!plan?.killer || !plan.drops?.has?.(event?.item)) {
    return;
  }
  victim.setAttribute?.(ATTR_CUSTOM_DEATH_LOOT_DROPPED, true);

  const location = event?.location ?? victim?.getLocation?.()?.clone?.();
  if (!location) {
    return;
  }

  ItemOnGroundManager.registerNonGlobals(
    plan.killer,
    event.item?.clone?.() ?? new Item(event.item.getId(), event.item.getAmount?.() ?? 1),
    location
  );
}

function clearBotDeathLootPlan(victim) {
  if (victim) {
    victim.setAttribute?.(ATTR_CUSTOM_DEATH_LOOT_DROPPED, false);
    deathLootPlans.delete(victim);
  }
}

module.exports = {
  clearBotDeathLootPlan,
  handleBotDeathItemDrop,
};
