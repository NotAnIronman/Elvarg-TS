const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { ItemIds, ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const SMELT_ANIMATION = new Animation(899);
const SMITH_ANIMATION = new Animation(898);

const FURNACE_OBJECT_IDS = new Set([
  ObjectIds.FURNACE,
  ObjectIds.FURNACE_2,
  ObjectIds.FURNACE_3,
  ObjectIds.FURNACE_4,
  ObjectIds.FURNACE_5,
  ObjectIds.FURNACE_6,
  ObjectIds.SMALL_FURNACE,
]);

const ANVIL_OBJECT_IDS = new Set([
  ObjectIds.ANVIL,
  ObjectIds.ANVIL_2,
  ObjectIds.ANVIL_3,
  ObjectIds.ANVIL_4,
  ObjectIds.AN_EXPERIMENTAL_ANVIL,
]);

const SMELTING_RECIPES = [
  {
    barId: ItemIds.BRONZE_BAR,
    level: 1,
    xp: 6.2,
    ingredients: [
      [ItemIds.COPPER_ORE, 1],
      [ItemIds.TIN_ORE, 1],
    ],
  },
  {
    barId: ItemIds.IRON_BAR,
    level: 15,
    xp: 12.5,
    ingredients: [[ItemIds.IRON_ORE, 1]],
    successChance: 0.5,
  },
  {
    barId: ItemIds.SILVER_BAR,
    level: 20,
    xp: 13.7,
    ingredients: [[ItemIds.SILVER_ORE, 1]],
  },
  {
    barId: ItemIds.STEEL_BAR,
    level: 30,
    xp: 17.5,
    ingredients: [
      [ItemIds.IRON_ORE, 1],
      [ItemIds.COAL, 2],
    ],
  },
  {
    barId: ItemIds.GOLD_BAR,
    level: 40,
    xp: 22.5,
    ingredients: [[ItemIds.GOLD_ORE, 1]],
  },
  {
    barId: ItemIds.MITHRIL_BAR,
    level: 50,
    xp: 30,
    ingredients: [
      [ItemIds.MITHRIL_ORE, 1],
      [ItemIds.COAL, 4],
    ],
  },
  {
    barId: ItemIds.ADAMANTITE_BAR,
    level: 70,
    xp: 37.5,
    ingredients: [
      [ItemIds.ADAMANTITE_ORE, 1],
      [ItemIds.COAL, 6],
    ],
  },
  {
    barId: ItemIds.RUNITE_BAR,
    level: 85,
    xp: 50,
    ingredients: [
      [ItemIds.RUNITE_ORE, 1],
      [ItemIds.COAL, 8],
    ],
  },
];

const FORGE_RECIPES = new Map([
  [ItemIds.BRONZE_BAR, { productId: ItemIds.BRONZE_DAGGER, level: 1, xp: 12.5 }],
  [ItemIds.IRON_BAR, { productId: ItemIds.IRON_DAGGER, level: 15, xp: 25 }],
  [ItemIds.STEEL_BAR, { productId: ItemIds.STEEL_DAGGER, level: 30, xp: 37.5 }],
  [ItemIds.MITHRIL_BAR, { productId: ItemIds.MITHRIL_DAGGER, level: 50, xp: 50 }],
  [ItemIds.ADAMANTITE_BAR, { productId: ItemIds.ADAMANT_DAGGER, level: 70, xp: 62.5 }],
  [ItemIds.RUNITE_BAR, { productId: ItemIds.RUNE_DAGGER, level: 85, xp: 75 }],
]);

const SMELT_RECIPES_BY_INGREDIENT = new Map();
for (const recipe of SMELTING_RECIPES) {
  for (const [ingredientId] of recipe.ingredients) {
    SMELT_RECIPES_BY_INGREDIENT.set(ingredientId, recipe);
  }
}

function hasIngredients(inventory, recipe) {
  for (const [itemId, amount] of recipe.ingredients) {
    if (inventory.getAmount(itemId) < amount) {
      return false;
    }
  }
  return true;
}

function consumeIngredients(inventory, recipe) {
  for (const [itemId, amount] of recipe.ingredients) {
    inventory.deleteNumber(itemId, amount);
  }
}

module.exports = {
  name: "Smithing",
  register(api) {
    api.onItemOnObject((event) => {
      const { player, objectId, itemId } = event;
      const inventory = player.getInventory();

      if (FURNACE_OBJECT_IDS.has(objectId)) {
        const recipe = SMELT_RECIPES_BY_INGREDIENT.get(itemId);
        if (!recipe) {
          return;
        }

        const smithingLevel = player
          .getSkillManager()
          .getCurrentLevel(Skill.SMITHING);
        if (smithingLevel < recipe.level) {
          player
            .getPacketSender()
            .sendMessage(
              `You need a Smithing level of at least ${recipe.level} to smelt this bar.`
            );
          event.handled = true;
          return;
        }

        if (!hasIngredients(inventory, recipe)) {
          player
            .getPacketSender()
            .sendMessage("You don't have the required ores to smelt this bar.");
          event.handled = true;
          return;
        }

        consumeIngredients(inventory, recipe);
        player.performAnimation(SMELT_ANIMATION);

        const successChance = recipe.successChance ?? 1;
        if (Math.random() <= successChance) {
          inventory.addItem(new Item(recipe.barId, 1));
          player.getSkillManager().addExperiences(Skill.SMITHING, recipe.xp);
          player.getPacketSender().sendMessage("You retrieve a bar of metal.");
        } else {
          player.getPacketSender().sendMessage("The ore is too impure and fails to become a bar.");
        }

        event.handled = true;
        return;
      }

      if (ANVIL_OBJECT_IDS.has(objectId)) {
        const recipe = FORGE_RECIPES.get(itemId);
        if (!recipe) {
          return;
        }
        if (!inventory.contains(ItemIds.HAMMER)) {
          player.getPacketSender().sendMessage("You need a hammer to work metal bars.");
          event.handled = true;
          return;
        }

        const smithingLevel = player
          .getSkillManager()
          .getCurrentLevel(Skill.SMITHING);
        if (smithingLevel < recipe.level) {
          player
            .getPacketSender()
            .sendMessage(
              `You need a Smithing level of at least ${recipe.level} to smith this item.`
            );
          event.handled = true;
          return;
        }

        inventory.deleteNumber(itemId, 1);
        inventory.addItem(new Item(recipe.productId, 1));
        player.performAnimation(SMITH_ANIMATION);
        player.getSkillManager().addExperiences(Skill.SMITHING, recipe.xp);
        player.getPacketSender().sendMessage("You hammer the metal and shape an item.");
        event.handled = true;
      }
    });

    api.log("registered", {
      smeltRecipes: SMELTING_RECIPES.length,
      forgeRecipes: FORGE_RECIPES.size,
    });
  },
};
