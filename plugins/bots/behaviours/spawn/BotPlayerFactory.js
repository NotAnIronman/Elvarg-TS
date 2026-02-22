const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { Player } = require("../../../../src/main/typescript/elvarg/game/entity/impl/player/Player");
const { BotPlayerSession } = require("../../../../src/main/typescript/elvarg/net/BotPlayerSession");
const { Misc } = require("../../../../src/main/typescript/elvarg/util/Misc");

function createBotPlayer(username, spawn) {
  const existing =
    World.getPlayerByName(username) ||
    World.getAddPlayerQueue().find((p) => p && p.getUsername() === username);
  if (existing) {
    return null;
  }

  const session = new BotPlayerSession();
  const bot = new Player(session, spawn.clone());
  bot.setUsername(username);
  bot.setLongUsername(Misc.stringToLongBigInt(username));
  bot.setHostAddress("bot");
  bot.setRunning(false);
  bot.setLastKnownRegion(spawn.clone());
  bot.setRegionHeight(spawn.getZ());
  bot.getUpdateFlag().flag(Flag.APPEARANCE);
  World.getAddPlayerQueue().push(bot);
  return bot;
}

module.exports = {
  createBotPlayer,
};
