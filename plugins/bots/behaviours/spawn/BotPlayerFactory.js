const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { Appearance } = require("../../../../src/main/typescript/elvarg/game/model/Appearance");
const { Player } = require("../../../../src/main/typescript/elvarg/game/entity/impl/player/Player");
const { BotPlayerSession } = require("../../../../src/main/typescript/elvarg/net/BotPlayerSession");
const { Misc } = require("../../../../src/main/typescript/elvarg/util/Misc");

const COLOR_RANGES = [
  [0, 11], // hair
  [0, 15], // torso
  [0, 15], // legs
  [0, 5], // feet
  [0, 7], // skin
];

const MALE_RANGES = {
  head: [0, 8],
  beard: [10, 17],
  chest: [18, 25],
  arms: [26, 31],
  hands: [33, 34],
  legs: [36, 40],
  feet: [42, 43],
};

const FEMALE_RANGES = {
  head: [45, 54],
  chest: [56, 60],
  arms: [61, 65],
  hands: [67, 68],
  legs: [70, 77],
  feet: [79, 80],
};

function randomInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFromRange([min, max]) {
  return randomInclusive(Math.min(min, max), Math.max(min, max));
}

function buildRandomAppearanceLook() {
  const gender = Math.random() < 0.5 ? 0 : 1;
  const look = new Array(13).fill(0);
  const ranges = gender === 0 ? MALE_RANGES : FEMALE_RANGES;

  look[Appearance.GENDER] = gender;
  look[Appearance.HEAD] = randomFromRange(ranges.head);
  look[Appearance.CHEST] = randomFromRange(ranges.chest);
  look[Appearance.ARMS] = randomFromRange(ranges.arms);
  look[Appearance.HANDS] = randomFromRange(ranges.hands);
  look[Appearance.LEGS] = randomFromRange(ranges.legs);
  look[Appearance.FEET] = randomFromRange(ranges.feet);
  look[Appearance.BEARD] =
    gender === 0 ? randomFromRange(MALE_RANGES.beard) : 57;

  look[Appearance.HAIR_COLOUR] = randomFromRange(COLOR_RANGES[0]);
  look[Appearance.TORSO_COLOUR] = randomFromRange(COLOR_RANGES[1]);
  look[Appearance.LEG_COLOUR] = randomFromRange(COLOR_RANGES[2]);
  look[Appearance.FEET_COLOUR] = randomFromRange(COLOR_RANGES[3]);
  look[Appearance.SKIN_COLOUR] = randomFromRange(COLOR_RANGES[4]);

  return look;
}

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
  bot.getAppearance().setLookArray(buildRandomAppearanceLook());
  bot.getUpdateFlag().flag(Flag.APPEARANCE);
  World.getAddPlayerQueue().push(bot);
  return bot;
}

module.exports = {
  createBotPlayer,
};
