const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { MagicSpellbook } = require("../../src/main/typescript/elvarg/game/model/MagicSpellbook");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const PRAY_AT_ALTAR_ANIMATION = new Animation(645);

function handleAncientAltar(player) {
  player.performAnimation(PRAY_AT_ALTAR_ANIMATION);
  MagicSpellbook.changeSpellbook(
    player,
    player.getSpellbook() === MagicSpellbook.ANCIENT
      ? MagicSpellbook.NORMAL
      : MagicSpellbook.ANCIENT
  );
  return true;
}

function handlePrayerAltar(player) {
  const skillManager = player.getSkillManager();
  const currentPrayer = skillManager.getCurrentLevel(Skill.PRAYER);
  const maxPrayer = skillManager.getMaxLevel(Skill.PRAYER);
  if (currentPrayer >= maxPrayer) {
    player.getPacketSender().sendMessage("You already have full Prayer points.");
    return true;
  }

  player.performAnimation(PRAY_AT_ALTAR_ANIMATION);
  skillManager.setCurrentLevels(Skill.PRAYER, maxPrayer);
  skillManager.updateSkill(Skill.PRAYER);
  player.getPacketSender().sendMessage("You recharge your Prayer points.");
  return true;
}

module.exports = {
  name: "Altars",
  register: (api) => {
    api.onObjectFirstClick(ObjectIds.ANCIENT_ALTAR, ({ player }) =>
      handleAncientAltar(player)
    );

    api.onObjectFirstClick(ObjectIds.ALTAR, ({ player }) =>
      handlePrayerAltar(player)
    );
  },
};
