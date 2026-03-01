const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { ItemDefinition } = require("../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { MapObjects } = require("../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { ItemIds, ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const COOK_ANIMATION = new Animation(896);
const COOK_INTERVAL_TICKS = 4;

const COOKABLES = Object.freeze([
  { raw: ItemIds.RAW_SHRIMPS, cooked: ItemIds.SHRIMPS, burnt: ItemIds.BURNT_SHRIMP, level: 1, xp: 30, stopBurn: 33, name: "shrimp" },
  { raw: ItemIds.RAW_ANCHOVIES, cooked: ItemIds.ANCHOVIES, burnt: ItemIds.BURNT_FISH, level: 1, xp: 30, stopBurn: 34, name: "anchovies" },
  { raw: ItemIds.RAW_TROUT, cooked: ItemIds.TROUT, burnt: ItemIds.BURNT_FISH_3, level: 15, xp: 70, stopBurn: 50, name: "trout" },
  { raw: ItemIds.RAW_SALMON, cooked: ItemIds.SALMON, burnt: ItemIds.BURNT_FISH_3, level: 25, xp: 90, stopBurn: 58, name: "salmon" },
  { raw: ItemIds.RAW_TUNA, cooked: ItemIds.TUNA, burnt: ItemIds.BURNT_FISH_7, level: 30, xp: 100, stopBurn: 58, name: "tuna" },
  { raw: ItemIds.RAW_LOBSTER, cooked: ItemIds.LOBSTER, burnt: ItemIds.BURNT_LOBSTER, level: 40, xp: 120, stopBurn: 74, name: "lobster" },
  { raw: ItemIds.RAW_SWORDFISH, cooked: ItemIds.SWORDFISH, burnt: ItemIds.BURNT_SWORDFISH, level: 45, xp: 140, stopBurn: 86, name: "swordfish" },
  { raw: ItemIds.RAW_SHARK, cooked: ItemIds.SHARK, burnt: ItemIds.BURNT_SHARK, level: 80, xp: 210, stopBurn: 94, name: "shark" },
]);

const COOKABLE_BY_RAW = new Map(COOKABLES.map((cookable) => [cookable.raw, cookable]));

const COOKABLE_OBJECT_IDS = new Set([
  ObjectIds.COOKING_RANGE,
  ObjectIds.COOKING_RANGE_2,
  ObjectIds.COOKING_RANGE_3,
  ObjectIds.COOKING_RANGE_4,
  ObjectIds.COOKING_RANGE_5,
  ObjectIds.COOKING_RANGE_6,
  ObjectIds.STOVE_4,
  ObjectIds.FIRE_5,
  ObjectIds.FIRE_23,
]);

function isSuccess(player, cookable) {
  const cookingLevel = player.getSkillManager().getCurrentLevel(Skill.COOKING);
  if (cookingLevel >= cookable.stopBurn) {
    return true;
  }
  if (cookable.stopBurn <= cookable.level) {
    return true;
  }

  const burnBonus = 3;
  let burnChance = 45.0 - burnBonus;
  const burnDec = burnChance / (cookable.stopBurn - cookable.level);
  burnChance -= (cookingLevel - cookable.level) * burnDec;
  const roll = Math.random() * 100.0;
  return burnChance <= roll;
}

function stopCooking(activeSessions, player, resetAnimation = true) {
  if (!activeSessions.has(player)) {
    return;
  }
  activeSessions.delete(player);
  if (resetAnimation) {
    player.performAnimation(Animation.DEFAULT_RESET_ANIMATION);
  }
}

function startCooking(player, object, cookable, activeSessions) {
  if (player.getSkillManager().getCurrentLevel(Skill.COOKING) < cookable.level) {
    player
      .getPacketSender()
      .sendMessage(`You need a Cooking level of at least ${cookable.level} to cook this.`);
    return false;
  }

  if (!player.getInventory().contains(cookable.raw)) {
    return false;
  }

  stopCooking(activeSessions, player, false);
  activeSessions.set(player, {
    cookable,
    objectId: object.getId(),
    location: object.getLocation().clone(),
    privateArea: object.getPrivateArea(),
    nextCookTick: 0,
  });

  Sounds.sendSound(player, Sound.COOKING_COOK);
  player.performAnimation(COOK_ANIMATION);
  return true;
}

class CookingTask extends Task {
  constructor(activeSessions) {
    super(1);
    this.activeSessions = activeSessions;
    this.cycle = 0;
  }

  execute() {
    this.cycle++;

    for (const [player, session] of this.activeSessions) {
      if (!player || !player.isRegistered() || player.getHitpoints() <= 0) {
        this.activeSessions.delete(player);
        continue;
      }

      if (player.getMovementQueue().size() > 0 || player.getForceMovement() != null) {
        stopCooking(this.activeSessions, player);
        continue;
      }

      if (!player.getInventory().contains(session.cookable.raw)) {
        stopCooking(this.activeSessions, player);
        continue;
      }

      const object = MapObjects.get(
        session.objectId,
        session.location,
        session.privateArea
      );
      if (!object) {
        stopCooking(this.activeSessions, player);
        continue;
      }

      if (!player.getLocation().isWithinInteractionDistance(object.getLocation())) {
        stopCooking(this.activeSessions, player);
        continue;
      }

      if (this.cycle < session.nextCookTick) {
        continue;
      }
      session.nextCookTick = this.cycle + COOK_INTERVAL_TICKS;
      Sounds.sendSound(player, Sound.COOKING_COOK);
      player.performAnimation(COOK_ANIMATION);

      player.getInventory().deleteNumber(session.cookable.raw, 1);
      if (isSuccess(player, session.cookable)) {
        player.getInventory().addItem(new Item(session.cookable.cooked, 1));
        Sounds.sendSound(player, Sound.COOKING_FOOD);
        player.getPacketSender().sendMessage(`You cook the ${session.cookable.name}.`);
        const levelBefore = player
          .getSkillManager()
          .getMaxLevel(Skill.COOKING);
        player.getSkillManager().addExperiences(Skill.COOKING, session.cookable.xp);
        const levelAfter = player
          .getSkillManager()
          .getMaxLevel(Skill.COOKING);
        if (levelAfter > levelBefore) {
          stopCooking(this.activeSessions, player);
          continue;
        }
      } else {
        player.getInventory().addItem(new Item(session.cookable.burnt, 1));
        Sounds.sendSound(player, Sound.COOKING_BURN);
        const rawName =
          ItemDefinition.forId(session.cookable.raw)?.getName?.()?.toLowerCase?.() ||
          session.cookable.name;
        player.getPacketSender().sendMessage(`You burn the ${rawName}.`);
      }
    }
  }
}

module.exports = {
  name: "Cooking",
  register(api) {
    const activeSessions = new Map();
    TaskManager.submit(new CookingTask(activeSessions));

    api.onPlayerDisconnect(({ player }) => {
      stopCooking(activeSessions, player, false);
    });
    api.onPlayerLevelUp(({ player }) => {
      stopCooking(activeSessions, player, false);
    });

    api.onItemOnObject((event) => {
      if (!COOKABLE_OBJECT_IDS.has(event.objectId)) {
        return;
      }

      const cookable = COOKABLE_BY_RAW.get(event.itemId);
      if (!cookable) {
        return;
      }

      const started = startCooking(
        event.player,
        event.object,
        cookable,
        activeSessions
      );
      if (started) {
        event.handled = true;
      }
    });

    api.log("registered", {
      cookables: COOKABLES.length,
      cookObjectIds: COOKABLE_OBJECT_IDS.size,
    });
  },
};
