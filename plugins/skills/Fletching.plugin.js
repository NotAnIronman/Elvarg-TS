const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { ItemIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const CUTTING_ANIMATION = new Animation(1248);
const STRINGING_ANIMATION = new Animation(6680);

const LOG_CUTS = new Map([
  [ItemIds.LOGS, { product: ItemIds.SHORTBOW_U_, level: 5, xp: 5 }],
  [ItemIds.OAK_LOGS, { product: ItemIds.OAK_SHORTBOW_U_, level: 20, xp: 16 }],
  [ItemIds.WILLOW_LOGS, { product: ItemIds.WILLOW_SHORTBOW_U_, level: 35, xp: 33 }],
  [ItemIds.MAPLE_LOGS, { product: ItemIds.MAPLE_SHORTBOW_U_, level: 50, xp: 50 }],
  [ItemIds.YEW_LOGS, { product: ItemIds.YEW_SHORTBOW_U_, level: 65, xp: 68 }],
  [ItemIds.MAGIC_LOGS, { product: ItemIds.MAGIC_SHORTBOW_U_, level: 80, xp: 84 }],
]);

const STRINGABLES = new Map([
  [ItemIds.SHORTBOW_U_, { product: ItemIds.SHORTBOW, level: 5, xp: 10 }],
  [ItemIds.LONGBOW_U_, { product: ItemIds.LONGBOW, level: 10, xp: 20 }],
  [ItemIds.OAK_SHORTBOW_U_, { product: ItemIds.OAK_SHORTBOW, level: 20, xp: 33 }],
  [ItemIds.OAK_LONGBOW_U_, { product: ItemIds.OAK_LONGBOW, level: 25, xp: 50 }],
  [ItemIds.WILLOW_SHORTBOW_U_, { product: ItemIds.WILLOW_SHORTBOW, level: 35, xp: 66 }],
  [ItemIds.WILLOW_LONGBOW_U_, { product: ItemIds.WILLOW_LONGBOW, level: 40, xp: 83 }],
  [ItemIds.MAPLE_SHORTBOW_U_, { product: ItemIds.MAPLE_SHORTBOW, level: 50, xp: 100 }],
  [ItemIds.MAPLE_LONGBOW_U_, { product: ItemIds.MAPLE_LONGBOW, level: 55, xp: 116 }],
  [ItemIds.YEW_SHORTBOW_U_, { product: ItemIds.YEW_SHORTBOW, level: 65, xp: 135 }],
  [ItemIds.YEW_LONGBOW_U_, { product: ItemIds.YEW_LONGBOW, level: 70, xp: 150 }],
  [ItemIds.MAGIC_SHORTBOW_U_, { product: ItemIds.MAGIC_SHORTBOW, level: 80, xp: 166 }],
  [ItemIds.MAGIC_LONGBOW_U_, { product: ItemIds.MAGIC_LONGBOW, level: 85, xp: 183 }],
]);

const ARROWHEADS = new Map([
  [ItemIds.BRONZE_ARROWTIPS, { product: ItemIds.BRONZE_ARROW, level: 1, xp: 1 }],
  [ItemIds.IRON_ARROWTIPS, { product: ItemIds.IRON_ARROW, level: 15, xp: 2 }],
  [ItemIds.STEEL_ARROWTIPS, { product: ItemIds.STEEL_ARROW, level: 30, xp: 3 }],
  [ItemIds.MITHRIL_ARROWTIPS, { product: ItemIds.MITHRIL_ARROW, level: 45, xp: 4 }],
  [ItemIds.ADAMANT_ARROWTIPS, { product: ItemIds.ADAMANT_ARROW, level: 60, xp: 5 }],
  [ItemIds.RUNE_ARROWTIPS, { product: ItemIds.RUNE_ARROW, level: 75, xp: 6 }],
]);

module.exports = {
  name: "Fletching",
  register(api) {
    api.onItemOnItem((event) => {
      const { player, usedItemId, usedWithItemId } = event;

      if (usedItemId === ItemIds.KNIFE || usedWithItemId === ItemIds.KNIFE) {
        const logId = usedItemId === ItemIds.KNIFE ? usedWithItemId : usedItemId;
        const cut = LOG_CUTS.get(logId);
        if (!cut) {
          return;
        }
        if (player.getSkillManager().getCurrentLevel(Skill.FLETCHING) < cut.level) {
          player
            .getPacketSender()
            .sendMessage(
              `You need a Fletching level of at least ${cut.level} to do this.`
            );
          event.handled = true;
          return;
        }
        player.performAnimation(CUTTING_ANIMATION);
        Sounds.sendSound(player, Sound.CUTTING);
        player.getInventory().deleteNumber(logId, 1);
        player.getInventory().addItem(new Item(cut.product, 1));
        player.getSkillManager().addExperiences(Skill.FLETCHING, cut.xp);
        event.handled = true;
        return;
      }

      if (
        usedItemId === ItemIds.BOW_STRING ||
        usedWithItemId === ItemIds.BOW_STRING
      ) {
        const unstrungId =
          usedItemId === ItemIds.BOW_STRING ? usedWithItemId : usedItemId;
        const bow = STRINGABLES.get(unstrungId);
        if (!bow) {
          return;
        }
        if (player.getSkillManager().getCurrentLevel(Skill.FLETCHING) < bow.level) {
          player
            .getPacketSender()
            .sendMessage(
              `You need a Fletching level of at least ${bow.level} to do this.`
            );
          event.handled = true;
          return;
        }
        player.performAnimation(STRINGING_ANIMATION);
        player.getInventory().deleteNumber(ItemIds.BOW_STRING, 1);
        player.getInventory().deleteNumber(unstrungId, 1);
        player.getInventory().addItem(new Item(bow.product, 1));
        player.getSkillManager().addExperiences(Skill.FLETCHING, bow.xp);
        event.handled = true;
        return;
      }

      const hasArrowShaft =
        usedItemId === ItemIds.ARROW_SHAFT || usedWithItemId === ItemIds.ARROW_SHAFT;
      const hasFeather =
        usedItemId === ItemIds.FEATHER || usedWithItemId === ItemIds.FEATHER;
      if (hasArrowShaft && hasFeather) {
        if (player.getInventory().getAmount(ItemIds.ARROW_SHAFT) < 15 ||
          player.getInventory().getAmount(ItemIds.FEATHER) < 15) {
          player.getPacketSender().sendMessage("You need 15 arrow shafts and 15 feathers.");
          event.handled = true;
          return;
        }
        player.performAnimation(CUTTING_ANIMATION);
        Sounds.sendSound(player, Sound.CUTTING);
        player.getInventory().deleteNumber(ItemIds.ARROW_SHAFT, 15);
        player.getInventory().deleteNumber(ItemIds.FEATHER, 15);
        player.getInventory().addItem(new Item(ItemIds.HEADLESS_ARROW, 15));
        player.getSkillManager().addExperiences(Skill.FLETCHING, 15);
        event.handled = true;
        return;
      }

      const hasHeadless =
        usedItemId === ItemIds.HEADLESS_ARROW ||
        usedWithItemId === ItemIds.HEADLESS_ARROW;
      if (hasHeadless) {
        const headId =
          usedItemId === ItemIds.HEADLESS_ARROW ? usedWithItemId : usedItemId;
        const head = ARROWHEADS.get(headId);
        if (!head) {
          return;
        }
        if (player.getSkillManager().getCurrentLevel(Skill.FLETCHING) < head.level) {
          player
            .getPacketSender()
            .sendMessage(
              `You need a Fletching level of at least ${head.level} to do this.`
            );
          event.handled = true;
          return;
        }
        if (
          player.getInventory().getAmount(ItemIds.HEADLESS_ARROW) < 15 ||
          player.getInventory().getAmount(headId) < 15
        ) {
          player
            .getPacketSender()
            .sendMessage("You need 15 headless arrows and 15 arrow tips.");
          event.handled = true;
          return;
        }
        player.performAnimation(CUTTING_ANIMATION);
        Sounds.sendSound(player, Sound.CUTTING);
        player.getInventory().deleteNumber(ItemIds.HEADLESS_ARROW, 15);
        player.getInventory().deleteNumber(headId, 15);
        player.getInventory().addItem(new Item(head.product, 15));
        player.getSkillManager().addExperiences(Skill.FLETCHING, head.xp * 15);
        event.handled = true;
      }
    });

    api.log("registered", {
      logCuts: LOG_CUTS.size,
      stringables: STRINGABLES.size,
      arrowheads: ARROWHEADS.size,
    });
  },
};
