const fs = require("fs");
const path = require("path");
const { PrayerData } = require("../../src/main/typescript/elvarg/game/content/PrayerHandler");
const { FightType } = require("../../src/main/typescript/elvarg/game/content/combat/FightType");
const {
  SkillManager,
  Skills,
} = require("../../src/main/typescript/elvarg/game/content/skill/SkillManager");
const { PlayerPersistence } = require("../../src/main/typescript/elvarg/game/entity/impl/player/persistence/PlayerPersistence");
const { PlayerSave } = require("../../src/main/typescript/elvarg/game/entity/impl/player/persistence/PlayerSave");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { MagicSpellbook } = require("../../src/main/typescript/elvarg/game/model/MagicSpellbook");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { SkullType } = require("../../src/main/typescript/elvarg/game/model/SkullType");
const { DonatorRights } = require("../../src/main/typescript/elvarg/game/model/rights/DonatorRights");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");

class JsonPlayerPersistence extends PlayerPersistence {
  static SAVE_DIRECTORY = path.join(
    process.cwd(),
    "data",
    "saves",
    "characters"
  );

  constructor() {
    super();
    this.prayerByConfig = new Map();
    for (const prayer of PrayerData.values()) {
      this.prayerByConfig.set(prayer.configId, prayer);
    }
  }

  load(username) {
    if (!this.exists(username)) {
      return null;
    }

    const filePath = this.resolveFilePath(username);
    const rawJson = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(rawJson, this.reviver.bind(this));
    return this.hydratePlayerSave(parsed);
  }

  save(player) {
    if (!player || !player.getUsername()) {
      return;
    }

    const save = PlayerSave.fromPlayer(player);
    const filePath = this.resolveFilePath(player.getUsername());
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify(save, this.replacer.bind(this), 2),
      "utf8"
    );
  }

  exists(username) {
    return fs.existsSync(this.resolveFilePath(username));
  }

  resolveFilePath(username) {
    const normalized = this.normalizeUsername(username);
    return path.join(JsonPlayerPersistence.SAVE_DIRECTORY, `${normalized}.json`);
  }

  normalizeUsername(username) {
    const formatted = Misc.formatPlayerName((username ?? "").trim().toLowerCase());
    const safe = formatted
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return safe.length > 0 ? safe.toLowerCase() : "player";
  }

  replacer(_key, value) {
    if (value instanceof Map) {
      return {
        __type: "Map",
        entries: Array.from(value.entries()),
      };
    }
    return value;
  }

  reviver(_key, value) {
    if (
      value &&
      typeof value === "object" &&
      value.__type === "Map" &&
      Array.isArray(value.entries)
    ) {
      return new Map(value.entries);
    }
    return value;
  }

  hydratePlayerSave(raw) {
    const parsed = raw && typeof raw === "object" ? raw : {};

    const save = Object.assign(
      new PlayerSave(),
      {
        passwordHashWithSalt: "",
        isDiscordLogin: false,
        cachedDiscordAccessToken: "",
        title: "",
        autoRetaliate: true,
        xpLocked: false,
        clanChat: "",
        targetTeleportUnlocked: false,
        preserveUnlocked: false,
        rigourUnlocked: false,
        auguryUnlocked: false,
        hasVengeance: false,
        lastVengeanceTimer: 0,
        specPercentage: 100,
        recoilDamage: 0,
        poisonDamage: 0,
        blowpipeScales: 0,
        barrowsCrypt: 0,
        barrowsChests: 0,
        killedBrothers: [],
        gwdKills: [],
        poisonImmunityTimer: 0,
        fireImmunityTimer: 0,
        teleblockTimer: 0,
        targetSearchTimer: 0,
        specialAttackRestoreTimer: 0,
        skullTimer: 0,
        running: false,
        runEnergy: 100,
        totalKills: 0,
        targetKills: 0,
        normalKills: 0,
        killstreak: 0,
        highestKillstreak: 0,
        recentKills: [],
        deaths: 0,
        points: 0,
        pouches: [],
        inventory: [],
        equipment: [],
        appearance: [],
        friends: [],
        ignores: [],
        presets: [],
        questPoints: 0,
      },
      parsed
    );

    save.position = this.hydrateLocation(parsed.position);
    save.rights = this.hydrateRights(parsed.rights);
    save.donatorRights = this.hydrateDonatorRights(parsed.donatorRights);
    save.spellBook = this.hydrateSpellbook(parsed.spellBook);
    save.fightType = FightType.UNARMED_KICK;
    save.skullType = this.hydrateSkullType(parsed.skullType);
    save.inventory = this.hydrateItems(parsed.inventory, 28);
    save.equipment = this.hydrateItems(parsed.equipment, 14);
    save.skills = this.hydrateSkills(parsed.skills);
    save.quickPrayers = this.hydrateQuickPrayers(parsed.quickPrayers);
    save.friends = this.hydrateNumberArray(parsed.friends);
    save.ignores = this.hydrateNumberArray(parsed.ignores);
    save.recentKills = this.hydrateStringArray(parsed.recentKills);
    save.banks = this.hydrateBanks(parsed.banks);
    save.questProgress = this.hydrateQuestProgress(parsed.questProgress);
    return save;
  }

  hydrateLocation(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const x = this.toNumber(value.x, 3089);
    const y = this.toNumber(value.y, 3524);
    const z = this.toNumber(value.z ?? value.plane, 0);
    return new Location(x, y, z);
  }

  hydrateRights(raw) {
    const numericId = this.toNumber(raw, Number.NaN);
    if (!Number.isNaN(numericId)) {
      return PlayerRights.fromId(numericId);
    }
    const id = this.toNumber(raw?.id, Number.NaN);
    if (!Number.isNaN(id)) {
      return PlayerRights.fromId(id);
    }
    const spriteId = this.toNumber(raw?.spriteId, -1);
    return PlayerRights.fromSpriteId(spriteId);
  }

  hydrateDonatorRights(raw) {
    const numericId = this.toNumber(raw, Number.NaN);
    if (!Number.isNaN(numericId)) {
      return DonatorRights.fromId(numericId);
    }
    const id = this.toNumber(raw?.id, Number.NaN);
    if (!Number.isNaN(id)) {
      return DonatorRights.fromId(id);
    }
    const spriteId = this.toNumber(raw?.spriteId, -1);
    return DonatorRights.fromSpriteId(spriteId);
  }

  hydrateSpellbook(raw) {
    const interfaceId = this.toNumber(raw?.interfaceId, 1151);
    if (interfaceId === MagicSpellbook.ANCIENT.getInterfaceId()) {
      return MagicSpellbook.ANCIENT;
    }
    if (interfaceId === MagicSpellbook.LUNAR.getInterfaceId()) {
      return MagicSpellbook.LUNAR;
    }
    return MagicSpellbook.NORMAL;
  }

  hydrateSkullType(raw) {
    const iconId = this.toNumber(raw?.iconId, 0);
    return iconId === SkullType.RED_SKULL.getIconId()
      ? SkullType.RED_SKULL
      : SkullType.WHITE_SKULL;
  }

  hydrateSkills(raw) {
    const skills = this.defaultSkills();
    if (!raw || typeof raw !== "object") {
      return skills;
    }

    skills.level = this.mergeSkillArray(raw.level, skills.level);
    skills.maxLevel = this.mergeSkillArray(raw.maxLevel, skills.maxLevel);
    skills.experience = this.mergeSkillArray(raw.experience, skills.experience);
    return skills;
  }

  defaultSkills() {
    const skills = new Skills();
    const total = SkillManager.AMOUNT_OF_SKILLS;
    skills.level = new Array(total).fill(1);
    skills.maxLevel = new Array(total).fill(1);
    skills.experience = new Array(total).fill(0);
    const hp = Skill.HITPOINTS.getIndex();
    skills.level[hp] = 10;
    skills.maxLevel[hp] = 10;
    skills.experience[hp] = 1184;
    return skills;
  }

  hydrateQuickPrayers(raw) {
    if (!Array.isArray(raw)) {
      return Array.from(PrayerData.values());
    }
    return raw.map((entry) => this.resolvePrayer(entry));
  }

  resolvePrayer(raw) {
    if (raw == null) {
      return null;
    }

    const configId = this.toNumber(raw?.configId, Number.NaN);
    if (!Number.isNaN(configId)) {
      const prayer = this.prayerByConfig.get(configId);
      if (prayer) {
        return prayer;
      }
    }
    return null;
  }

  hydrateItems(raw, expectedLength) {
    const items = Array.isArray(raw)
      ? raw.map((entry) => this.hydrateItem(entry))
      : [];

    if (expectedLength == null) {
      return items;
    }

    if (items.length > expectedLength) {
      return items.slice(0, expectedLength);
    }
    while (items.length < expectedLength) {
      items.push(new Item(-1, 0));
    }
    return items;
  }

  hydrateItem(raw) {
    if (raw instanceof Item) {
      return raw;
    }
    const value = raw && typeof raw === "object" ? raw : {};
    const id = this.toNumber(value.id, -1);
    const amount = this.toNumber(value.amount, id > 0 ? 1 : 0);
    return new Item(id, amount);
  }

  hydrateBanks(raw) {
    const banks = new Map();
    for (const [key, value] of this.entriesFrom(raw)) {
      const index = this.toNumber(key, -1);
      if (index < 0) {
        continue;
      }
      banks.set(index, this.hydrateItems(value));
    }
    return banks;
  }

  hydrateQuestProgress(raw) {
    const questProgress = new Map();
    for (const [key, value] of this.entriesFrom(raw)) {
      const questId = this.toNumber(key, -1);
      if (questId < 0) {
        continue;
      }
      questProgress.set(questId, this.toNumber(value, 0));
    }
    return questProgress;
  }

  entriesFrom(raw) {
    if (raw instanceof Map) {
      return Array.from(raw.entries());
    }
    if (Array.isArray(raw)) {
      return raw.filter((entry) => Array.isArray(entry) && entry.length === 2);
    }
    if (raw && typeof raw === "object") {
      return Object.entries(raw);
    }
    return [];
  }

  hydrateNumberArray(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((value) => this.toNumber(value, 0));
  }

  hydrateStringArray(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((value) => String(value ?? ""));
  }

  mergeNumberArray(raw, fallback) {
    const output = fallback.slice();
    if (!Array.isArray(raw)) {
      return output;
    }
    const length = Math.min(raw.length, output.length);
    for (let index = 0; index < length; index++) {
      output[index] = this.toNumber(raw[index], output[index]);
    }
    return output;
  }

  mergeSkillArray(raw, fallback) {
    if (!Array.isArray(raw)) {
      return fallback.slice();
    }

    // Backward compatibility: older saves used skill button ids (e.g. 8655)
    // as array indices, producing very large sparse arrays.
    if (this.isLegacyButtonIndexedSkillArray(raw)) {
      const output = fallback.slice();
      for (const skill of Skill.values()) {
        output[skill.getIndex()] = this.toNumber(
          raw[skill.getButton()],
          output[skill.getIndex()]
        );
      }
      return output;
    }

    return this.mergeNumberArray(raw, fallback);
  }

  isLegacyButtonIndexedSkillArray(raw) {
    if (!Array.isArray(raw) || raw.length <= SkillManager.AMOUNT_OF_SKILLS) {
      return false;
    }
    return Skill.values().some((skill) => raw[skill.getButton()] != null);
  }

  toNumber(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  }
}

module.exports = {
  name: "JsonPlayerPersistence",
  register(api) {
    api.setPlayerPersistence(new JsonPlayerPersistence());
    api.log("registered", {
      saveDirectory: path.join("data", "saves", "characters"),
    });
  },
};
