const { TimerKey } = require("../../src/main/typescript/elvarg/util/timers/TimerKey");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { ItemDefinition } = require("../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { PluginManager } = require("../../src/main/typescript/elvarg/plugins/PluginManager");
const { ItemIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const EAT_ANIMATION = new Animation(829);

const FOOD = new Map([
  [ItemIds.KEBAB, { heal: 4 }],
  [ItemIds.CHEESE, { heal: 4 }],
  [ItemIds.CAKE, { heal: 5, replacementId: ItemIds._2_3_CAKE }],
  [ItemIds._2_3_CAKE, { heal: 5, replacementId: ItemIds.SLICE_OF_CAKE }],
  [ItemIds.SLICE_OF_CAKE, { heal: 5 }],
  [ItemIds.NULL_2422, { heal: 12, verb: "use" }],
  [ItemIds.JANGERBERRIES, { heal: 2 }],
  [ItemIds.WORM_CRUNCHIES, { heal: 7 }],
  [ItemIds.EDIBLE_SEAWEED, { heal: 4 }],
  [ItemIds.ANCHOVIES, { heal: 1 }],
  [ItemIds.SHRIMPS, { heal: 3 }],
  [ItemIds.SARDINE, { heal: 4 }],
  [ItemIds.COD, { heal: 7 }],
  [ItemIds.TROUT, { heal: 7 }],
  [ItemIds.PIKE, { heal: 8 }],
  [ItemIds.SALMON, { heal: 9 }],
  [ItemIds.TUNA, { heal: 10 }],
  [ItemIds.LOBSTER, { heal: 12 }],
  [ItemIds.BASS, { heal: 13 }],
  [ItemIds.SWORDFISH, { heal: 14 }],
  [ItemIds.MEAT_PIZZA, { heal: 14 }],
  [ItemIds.MONKFISH, { heal: 16 }],
  [ItemIds.SHARK, { heal: 20 }],
  [ItemIds.SEA_TURTLE, { heal: 21 }],
  [ItemIds.DARK_CRAB, { heal: 22 }],
  [ItemIds.MANTA_RAY, { heal: 22 }],
  [ItemIds.COOKED_KARAMBWAN, { heal: 18, karambwan: true }],
  [ItemIds.ANGLERFISH, { heal: 22, anglerfish: true }],
  [ItemIds.POTATO, { heal: 1 }],
  [ItemIds.BAKED_POTATO, { heal: 4 }],
  [ItemIds.POTATO_WITH_BUTTER, { heal: 14 }],
  [ItemIds.CHILLI_POTATO, { heal: 14 }],
  [ItemIds.EGG_POTATO, { heal: 16 }],
  [ItemIds.POTATO_WITH_CHEESE, { heal: 16 }],
  [ItemIds.MUSHROOM_POTATO, { heal: 20 }],
  [ItemIds.TUNA_POTATO, { heal: 20 }],
]);

function getAnglerfishHeal(currentHp) {
  let c = 2;
  if (currentHp >= 25) c = 4;
  if (currentHp >= 50) c = 6;
  if (currentHp >= 75) c = 8;
  if (currentHp >= 93) c = 13;

  const heal = Math.floor(currentHp / 10 + c);
  return Math.min(22, heal);
}

function canEat(player, itemId) {
  const pluginDecision = PluginManager.emitCanEat(player, itemId);
  if (pluginDecision === false) {
    return false;
  }
  if (pluginDecision === null && player.getArea() && !player.getArea().canEat(player, itemId)) {
    return false;
  }
  return true;
}

module.exports = {
  name: "Food",
  register(api) {
    api.onItemFirstAction((event) => {
      const { player, itemId, slot } = event;
      const food = FOOD.get(itemId);
      if (!food) {
        return false;
      }

      if (!canEat(player, itemId)) {
        player.getPacketSender().sendMessage("You cannot eat here.");
        return true;
      }

      const timers = player.getTimers();
      if (timers.has(TimerKey.STUN)) {
        player.getPacketSender().sendMessage("You're currently stunned!");
        return true;
      }

      if (food.karambwan) {
        if (timers.has(TimerKey.KARAMBWAN)) {
          return true;
        }
      } else if (timers.has(TimerKey.FOOD)) {
        return true;
      }

      const inventory = player.getInventory();
      if (
        slot < 0 ||
        slot >= inventory.capacity() ||
        inventory.getItems()[slot]?.getId?.() !== itemId
      ) {
        return true;
      }

      timers.extendOrRegister(TimerKey.FOOD, 3);
      timers.extendOrRegister(TimerKey.COMBAT_ATTACK, 5);
      if (food.karambwan) {
        timers.registers(TimerKey.KARAMBWAN, 3);
        timers.registers(TimerKey.POTION, 3);
      }

      player.getPacketSender().sendInterfaceRemoval();
      player.getSkillManager().stopSkillable();
      Sounds.sendSound(player, Sound.FOOD_EAT);
      player.performAnimation(EAT_ANIMATION);

      inventory.deleteNumber(itemId, 1);
      if (food.replacementId) {
        inventory.adds(food.replacementId, 1);
      }

      const currentHp = player.getSkillManager().getCurrentLevel(Skill.HITPOINTS);
      let maxHp = player.getSkillManager().getMaxLevel(Skill.HITPOINTS);
      let healAmount = food.heal;

      if (food.anglerfish) {
        healAmount = getAnglerfishHeal(currentHp);
        maxHp += healAmount;
      }

      const nextHp = Math.min(currentHp + healAmount, maxHp);
      player.setHitpoints(Math.max(0, nextHp));

      const verb = food.verb || "eat";
      const itemName = ItemDefinition.forId(itemId).getName().toLowerCase();
      player.getPacketSender().sendMessage(`You ${verb} the ${itemName}.`);
      return true;
    });

    api.log("registered", { foods: FOOD.size });
  },
};

