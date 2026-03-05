const fs = require("fs");
const path = require("path");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { Server } = require("../../src/main/typescript/elvarg/Server");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { SkillManager } = require("../../src/main/typescript/elvarg/game/content/skill/SkillManager");
const { WeaponInterfaces } = require("../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { NPC } = require("../../src/main/typescript/elvarg/game/entity/impl/npc/NPC");
const { ObjectManager } = require("../../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager");
const { GameObject } = require("../../src/main/typescript/elvarg/game/entity/impl/object/GameObject");
const { Bank } = require("../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { ItemDefinition } = require("../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { CombatFactory } = require("../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { CombatSpecial } = require("../../src/main/typescript/elvarg/game/content/combat/CombatSpecial");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../src/main/typescript/elvarg/game/model/Graphic");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { ClanChatManager } = require("../../src/main/typescript/elvarg/game/content/clan/ClanChatManager");
const { NpcDropDefinitionLoader } = require("../../src/main/typescript/elvarg/game/definition/loader/impl/NpcDropDefinitionLoader");
const { RegionManager } = require("../../src/main/typescript/elvarg/game/collision/RegionManager");
const { PlayerSave } = require("../../src/main/typescript/elvarg/game/entity/impl/player/persistence/PlayerSave");
const { DamageFormulas } = require("../../src/main/typescript/elvarg/game/content/combat/formula/DamageFormulas");
const { PlayerPunishment } = require("../../src/main/typescript/elvarg/util/PlayerPunishment");
const { ServerLogger } = require("../../src/main/typescript/elvarg/util/ServerLogger");

const ATTACK_RANGE_DEBUG_GRAPHIC = new Graphic(332, 0);
const MAX_NPC_COMMAND_SPAWNS = 20;
const NPC_SPAWN_FILE_CANDIDATES = [
  path.join(process.cwd(), "data", "definitions", "npc_spawns.json"),
  path.join(process.cwd(), "data", "npc_spawns.json"),
];
const NPC_FACING_BY_NAME = Object.freeze({
  NORTH_WEST: 0,
  NORTH: 1,
  NORTH_EAST: 2,
  WEST: 3,
  EAST: 4,
  SOUTH_WEST: 5,
  SOUTH: 6,
  SOUTH_EAST: 7,
});
const NPC_FACING_ALIASES = Object.freeze({
  N: "NORTH",
  NORTH: "NORTH",
  S: "SOUTH",
  SOUTH: "SOUTH",
  E: "EAST",
  EAST: "EAST",
  W: "WEST",
  WEST: "WEST",
  NW: "NORTH_WEST",
  NORTHWEST: "NORTH_WEST",
  NORTH_WEST: "NORTH_WEST",
  NE: "NORTH_EAST",
  NORTHEAST: "NORTH_EAST",
  NORTH_EAST: "NORTH_EAST",
  SW: "SOUTH_WEST",
  SOUTHWEST: "SOUTH_WEST",
  SOUTH_WEST: "SOUTH_WEST",
  SE: "SOUTH_EAST",
  SOUTHEAST: "SOUTH_EAST",
  SOUTH_EAST: "SOUTH_EAST",
});

function parseIntArg(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeFacingToken(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized.length === 0) {
    return null;
  }
  return NPC_FACING_ALIASES[normalized] ?? null;
}

function parseFacingArg(value) {
  if (value == null) {
    return { id: -1, label: "default" };
  }
  const parsedNumeric = parseIntArg(value);
  if (parsedNumeric !== null && parsedNumeric >= -1 && parsedNumeric <= 7) {
    return {
      id: parsedNumeric,
      label: parsedNumeric === -1 ? "default" : String(parsedNumeric),
    };
  }
  const directionName = normalizeFacingToken(value);
  if (!directionName) {
    return null;
  }
  return { id: NPC_FACING_BY_NAME[directionName], label: directionName.toLowerCase() };
}

function resolveNpcSpawnFileForWrite() {
  for (const candidate of NPC_SPAWN_FILE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return NPC_SPAWN_FILE_CANDIDATES[0];
}

function appendPersistentNpcSpawn(spawnEntry) {
  const file = resolveNpcSpawnFileForWrite();
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });

  let existing = [];
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(parsed)) {
        existing = parsed;
      }
    } catch (error) {
      throw new Error(`Failed to parse npc spawns file (${file}): ${error?.message ?? error}`);
    }
  }

  existing.push(spawnEntry);
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  return file;
}

function parseCsvArgs(parts, start = 1) {
  return parts
    .slice(start)
    .join(" ")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function commandTail(raw, parts) {
  return raw.substring(parts[0].length).trim();
}

function ownerOrDev(player) {
  const rights = player?.getRights?.();
  return rights === PlayerRights.OWNER || rights === PlayerRights.DEVELOPER;
}

function devOnly(player) {
  return player?.getRights?.() === PlayerRights.DEVELOPER;
}

function adminOrAbove(player) {
  return PlayerRights.hasAdminRights(player);
}

function deny(player) {
  player.getPacketSender().sendMessage("You do not have permission to use this command.");
}

function requireRights(player, predicate) {
  if (!predicate(player)) {
    deny(player);
    return false;
  }
  return true;
}

function queueNpcSpawn(player, id, amount = 1) {
  const origin = player.getLocation().clone();
  const spawnCount = Math.min(Math.max(1, amount), MAX_NPC_COMMAND_SPAWNS);
  let spawned = 0;

  for (let i = 0; i < spawnCount; i++) {
    const spawn = origin.clone();
    if (i > 0) {
      const offsetX = (i % 3) - 1;
      const offsetY = ((Math.floor(i / 3)) % 3) - 1;
      spawn.setX(origin.getX() + offsetX);
      spawn.setY(origin.getY() + offsetY);
    }

    const npc = NPC.create(id, spawn);
    const currentHp = npc.getHitpoints?.();
    if (!Number.isFinite(currentHp) || currentHp <= 0) {
      npc.setHitpoints(10);
    }

    World.getAddNPCQueue().push(npc);
    if (player.getPrivateArea()) {
      player.getPrivateArea().add(npc);
    }
    spawned++;
  }

  return spawned;
}

function fallbackSaveFilePathForUsername(username) {
  const raw = String(username ?? "").trim().toLowerCase();
  const safe = raw
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const normalized = safe.length > 0 ? safe : "player";
  return path.join(process.cwd(), "data", "saves", "characters", `${normalized}.json`);
}

function resolveSaveFilePathForUsername(username) {
  const persistence = GameConstants.PLAYER_PERSISTENCE;
  if (persistence && typeof persistence.resolveFilePath === "function") {
    return persistence.resolveFilePath(username);
  }
  return fallbackSaveFilePathForUsername(username);
}

class UpdateTask extends Task {
  constructor(ticks, fn) {
    super(ticks);
    this.fn = fn;
  }

  execute() {
    this.fn();
    this.stop();
  }
}

module.exports = {
  name: "AdminCommands",
  register(api) {
    api.registerCommand("tele", ({ player, parts }) => {
      if (!requireRights(player, adminOrAbove)) {
        return true;
      }
      if (parts.length < 3 || parts.length > 4) {
        player.getPacketSender().sendMessage("Usage: ::tele x y [z]");
        return true;
      }
      const x = parseIntArg(parts[1]);
      const y = parseIntArg(parts[2]);
      const z = parts.length === 4 ? parseIntArg(parts[3]) : player.getLocation().getZ();
      if (x === null || y === null || z === null) {
        player.getPacketSender().sendMessage("Usage: ::tele x y [z]");
        return true;
      }
      player.moveTo(new Location(x, y, z));
      return true;
    });

    api.registerCommand("coords", ({ player }) => {
      if (!requireRights(player, adminOrAbove)) {
        return true;
      }
      const location = player.getLocation();
      player
        .getPacketSender()
        .sendMessage(`Coords: ${location.getX()}, ${location.getY()}, ${location.getZ()}`);
      return true;
    });

    api.registerCommand("teleto", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const target = World.getPlayerByName(commandTail(raw, parts));
      if (target) {
        player.moveTo(target.getLocation().clone());
      }
      return true;
    });

    api.registerCommand("teletome", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const target = World.getPlayerByName(commandTail(raw, parts));
      if (target) {
        target.moveTo(player.getLocation());
      }
      return true;
    });

    api.registerCommand("kick", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const target = World.getPlayerByName(commandTail(raw, parts));
      if (target) {
        target.requestLogout();
      }
      return true;
    });

    api.registerCommand("exit", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!target) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not online.`);
        return true;
      }
      if (CombatFactory.inCombat(target)) {
        player.getPacketSender().sendMessage(`Player ${targetName} is in combat!`);
        return true;
      }
      target.getPacketSender().sendExit();
      player.getPacketSender().sendMessage("Closed other player's client.");
      return true;
    });

    api.registerCommand("copybank", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const target = World.getPlayerByName(commandTail(raw, parts));
      if (!target) {
        return true;
      }
      for (let i = 0; i < Bank.TOTAL_BANK_TABS; i++) {
        player.getBank(i).resetItems();
      }
      for (let i = 0; i < Bank.TOTAL_BANK_TABS; i++) {
        for (const item of target.getBank(i).getValidItems()) {
          player.getBank(i).add(item, false);
        }
      }
      return true;
    });

    api.registerCommand("bank", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.getBank(player.getCurrentBankTab()).open();
      return true;
    });

    api.registerCommand("runes", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      [554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565].forEach((rune) => {
        player.getInventory().adds(rune, 1000);
      });
      return true;
    });

    api.registerCommand("master", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      for (const skill of Skill.values()) {
        const level = SkillManager.getMaxAchievingLevel(skill);
        player
          .getSkillManager()
          .setCurrentLevels(skill, level)
          .setMaxLevel(skill, level)
          .setExperience(skill, SkillManager.getExperienceForLevel(level));
      }
      WeaponInterfaces.assign(player);
      player.getUpdateFlag().flag(Flag.APPEARANCE);
      return true;
    });

    api.registerCommand("reset", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      for (const skill of Skill.values()) {
        const level = skill === Skill.HITPOINTS ? 10 : 1;
        player
          .getSkillManager()
          .setCurrentLevels(skill, level)
          .setMaxLevel(skill, level)
          .setExperience(skill, SkillManager.getExperienceForLevel(level));
      }
      WeaponInterfaces.assign(player);
      return true;
    });

    api.registerCommand("pnpc", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id !== null) {
        player.setNpcTransformationId(id);
      }
      return true;
    });

    api.registerCommand("npc", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      const amount = parts.length >= 3 ? parseIntArg(parts[2]) : 1;
      if (id === null || id < 0 || amount === null || amount < 1) {
        player.getPacketSender().sendMessage("Usage: ::npc id [amount]");
        return true;
      }
      const spawned = queueNpcSpawn(player, id, amount);
      player.getPacketSender().sendMessage(
        `Queued ${spawned} NPC${spawned === 1 ? "" : "s"} (id=${id}).`
      );
      return true;
    });

    api.registerCommand("npcperm", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }

      const id = parseIntArg(parts[1]);
      let radiusArg = null;
      let facingArg = null;
      if (parts.length >= 3) {
        const maybeRadius = parseIntArg(parts[2]);
        if (maybeRadius !== null) {
          radiusArg = maybeRadius;
          facingArg = parts.length >= 4 ? parts[3] : null;
        } else {
          facingArg = parts[2];
        }
      }
      if (id === null || id < 0) {
        player.getPacketSender().sendMessage("Usage: ::npcperm id [radius] [north|south|east|west|0-7]");
        return true;
      }

      if (radiusArg !== null && radiusArg < 0) {
        player.getPacketSender().sendMessage("Radius must be 0 or higher.");
        return true;
      }

      const facing = parseFacingArg(facingArg);
      if (facingArg != null && facing == null) {
        player
          .getPacketSender()
          .sendMessage("Invalid facing. Use north/south/east/west (or north_east etc) or -1..7.");
        return true;
      }

      const location = player.getLocation();
      const spawnEntry = {
        id,
        position: {
          x: location.getX(),
          y: location.getY(),
          z: location.getZ(),
        },
        radius: radiusArg == null ? 0 : radiusArg,
        facing: facing?.id ?? -1,
      };

      let file;
      try {
        file = appendPersistentNpcSpawn(spawnEntry);
      } catch (error) {
        console.error(error);
        player.getPacketSender().sendMessage("Failed to append persistent npc spawn.");
        return true;
      }

      const spawned = queueNpcSpawn(player, id, 1);
      player
        .getPacketSender()
        .sendMessage(
          `Spawned ${spawned} NPC (id=${id}) and appended to ${file} at ${location.getX()},${location.getY()},${location.getZ()} (radius=${spawnEntry.radius}, facing=${facing?.label ?? "default"}).`
        );
      return true;
    });

    api.registerCommand("object", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      const type = parts.length >= 3 ? parseIntArg(parts[2]) : 10;
      const face = parts.length >= 4 ? parseIntArg(parts[3]) : 0;
      if (id === null || type === null || face === null) {
        return true;
      }
      const gameObject = new GameObject(id, player.getLocation().clone(), type, face, player.getPrivateArea());
      ObjectManager.register(gameObject, true);
      return true;
    });

    api.registerCommand("mypos", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.getPacketSender().sendMessage(player.getLocation().toString());
      return true;
    });

    api.registerCommand("config", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      const state = parseIntArg(parts[2]);
      if (id === null || state === null) {
        return true;
      }
      player.getPacketSender().sendConfig(id, state);
      player.getPacketSender().sendMessage("Sent config");
      return true;
    });

    api.registerCommand("spec", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const amount = parts.length > 1 ? parseIntArg(parts[1]) : 100;
      player.setSpecialPercentage(amount ?? 100);
      CombatSpecial.updateBar(player);
      return true;
    });

    api.registerCommand("gfx", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id !== null) {
        player.performGraphic(new Graphic(id, 0));
      }
      return true;
    });

    api.registerCommand("sound", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const input = parts[1];
      if (!input) {
        player
          .getPacketSender()
          .sendMessage("Usage: ::sound <id|SOUND_NAME> [volume=1] [delay=0] [loop=1]");
        return true;
      }

      const directId = parseIntArg(input);
      const resolvedSound =
        directId !== null ? Sounds.resolveKnownSound(directId) : Sounds.resolveKnownSound(input);
      const id = resolvedSound ? resolvedSound.getId() : directId;
      if (id === null) {
        player
          .getPacketSender()
          .sendMessage("Unknown sound id/name. Example: ::sound 386 or ::sound MAGIC_SHORTBOW_SPECIAL");
        return true;
      }

      const volume = parts.length > 2 ? parseIntArg(parts[2]) : 1;
      const delay = parts.length > 3 ? parseIntArg(parts[3]) : 0;
      const loopType = parts.length > 4 ? parseIntArg(parts[4]) : 1;
      player
        .getPacketSender()
        .sendSoundEffect(
          id,
          Number.isInteger(loopType) ? loopType : 1,
          Number.isInteger(delay) ? delay : 0,
          Number.isInteger(volume) ? volume : 1
        );
      if (resolvedSound) {
        const soundName =
          Object.entries(Sound).find(([, value]) => value === resolvedSound)?.[0] ?? "UNKNOWN";
        player.getPacketSender().sendMessage(`Played ${soundName} (${id}).`);
      }
      return true;
    });

    api.registerCommand("anim", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id !== null) {
        player.performAnimation(new Animation(id));
      }
      return true;
    });

    api.registerCommand("interface", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id !== null) {
        player.getPacketSender().sendInterface(id);
      }
      return true;
    });

    api.registerCommand("chatboxinterface", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id !== null) {
        player.getPacketSender().sendChatboxInterface(id);
      }
      return true;
    });

    api.registerCommand("update", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const ticks = parseIntArg(parts[1]);
      if (ticks === null || ticks <= 0) {
        return true;
      }
      Server.setUpdating(true);
      for (const p of World.getPlayers()) {
        if (p) {
          p.getPacketSender().sendSystemUpdate(ticks);
        }
      }
      TaskManager.submit(
        new UpdateTask(ticks, () => {
          for (const p of World.getPlayers()) {
            if (p) {
              p.requestLogout();
            }
          }
          ClanChatManager.save();
          Server.getLogger().info("Update task finished!");
        })
      );
      return true;
    });

    api.registerCommand("area", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      if (player.getArea()) {
        player.getPacketSender().sendMessage("");
        player.getPacketSender().sendMessage(`Area: ${player.getArea().constructor.name}`);
      } else {
        player.getPacketSender().sendMessage("No area found for your coordinates.");
      }
      return true;
    });

    api.registerCommand("infhp", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.setInfiniteHealth(!player.hasInfiniteHealth());
      player.getPacketSender().sendMessage(`Invulnerable: ${player.hasInfiniteHealth()}`);
      return true;
    });

    api.registerCommand("taskdebug", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.getPacketSender().sendMessage(`Active tasks :${TaskManager.getTaskAmount()}.`);
      return true;
    });

    api.registerCommand("noclip", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.getPacketSender().sendEnableNoclip();
      player.getPacketSender().sendConsoleMessage("Noclip enabled.");
      return true;
    });

    api.registerCommand("up", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.moveTo(player.getLocation().clone().setZ(player.getLocation().getZ() + 1));
      return true;
    });

    api.registerCommand("down", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const next = player.getLocation().clone().setZ(player.getLocation().getZ() - 1);
      if (next.getZ() < 0) {
        next.setZ(0);
        player.getPacketSender().sendMessage("You cannot move to a negative plane!");
      }
      player.moveTo(next);
      return true;
    });

    api.registerCommand("save", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      GameConstants.PLAYER_PERSISTENCE.save(player);
      player.getPacketSender().sendMessage("Saved player.");
      return true;
    });

    api.registerCommand("reprocorruptsave", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }

      const requested = commandTail(raw, parts);
      const targetName = requested.length > 0 ? requested : player.getUsername();
      if (!targetName) {
        player.getPacketSender().sendMessage("Usage: ::reprocorruptsave [username]");
        return true;
      }

      const corruptTargetSave = (overrideJson = null) => {
        const filePath = resolveSaveFilePathForUsername(targetName);
        if (!fs.existsSync(filePath)) {
          player
            .getPacketSender()
            .sendMessage(`No save file found for ${targetName} at ${filePath}.`);
          return;
        }

        const backupPath = `${filePath}.repro.bak.${Date.now()}`;
        const original = fs.readFileSync(filePath, "utf8");
        if (original.length < 4) {
          player
            .getPacketSender()
            .sendMessage(`Save file is too small to corrupt safely: ${filePath}`);
          return;
        }

        fs.writeFileSync(backupPath, original, "utf8");
        const sourceJson = overrideJson ?? original;
        const partialLength = Math.max(1, Math.floor(sourceJson.length * 0.45));
        const partialJson = sourceJson.slice(0, partialLength);
        // Simulate legacy non-atomic truncate+partial write interruption.
        const fd = fs.openSync(filePath, "w");
        try {
          fs.writeFileSync(fd, partialJson, "utf8");
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }

        ServerLogger.info(
          `[admin] reprocorruptsave target=${targetName} mode=partial_non_atomic file=${filePath} backup=${backupPath} bytes=${partialLength}/${sourceJson.length}`
        );

        player.getPacketSender().sendMessage(
          `Simulated interrupted save for ${targetName}. Backup: ${backupPath}`
        );
        player.getPacketSender().sendMessage(
          "Relog target to reproduce persistence_load_failed from partial JSON."
        );
      };

      const onlineTarget = World.getPlayerByName(targetName);
      if (onlineTarget) {
        const serializedLiveSave = JSON.stringify(PlayerSave.fromPlayer(onlineTarget), null, 2);
        player
          .getPacketSender()
          .sendMessage(
            `Forcing ${targetName} logout, then simulating interrupted non-atomic save write...`
          );
        onlineTarget.requestLogout();
        TaskManager.submit(
          new UpdateTask(2, () => {
            if (World.getPlayerByName(targetName)) {
              player
                .getPacketSender()
                .sendMessage(
                  `Target ${targetName} is still online. Run ::reprocorruptsave again in a moment.`
                );
              return;
            }
            corruptTargetSave(serializedLiveSave);
          })
        );
        return true;
      }

      corruptTargetSave();
      return true;
    });

    api.registerCommand("saveall", ({ player }) => {
      if (!requireRights(player, adminOrAbove)) {
        return true;
      }
      World.savePlayers();
      player.getPacketSender().sendMessage("Saved all players.");
      return true;
    });

    api.registerCommand("cwar", ({ player, parts }) => {
      if (!requireRights(player, devOnly)) {
        return true;
      }
      const x = parseIntArg(parts[1]);
      const y = parseIntArg(parts[2]);
      if (x === null || y === null) {
        return true;
      }
      player.getPacketSender().sendInterface(11169);
      player.getPacketSender().sendInterfaceComponentMoval(x, y, 11332);
      player.getPacketSender().sendMessage(`Sending RedX to X=${x}, Y=${y}`);
      return true;
    });

    api.registerCommand("listsizes", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player
        .getPacketSender()
        .sendMessage(
          `Players: ${Array.from(World.getPlayers()).length}, NPCs: ${World.getNpcs().sizeReturn()}, Objects: ${World.getObjects().length}, GroundItems: ${World.getItems().length}.`
        );
      return true;
    });

    const attackRangeFn = ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const distance = parts.length === 2 ? parseIntArg(parts[1]) : CombatFactory.getMethod(player).attackDistance(player);
      if (distance === null) {
        return true;
      }
      const playerLocation = player.getLocation().clone();
      const start = player.getLocation().clone().translate(-(distance + 5), -(distance + 5), 0);
      const end = player.getLocation().clone().translate(distance + 5, distance + 5, 0);
      const deltas = new Set();

      for (let x = start.getX(); x <= end.getX(); x++) {
        for (let y = start.getY(); y <= end.getY(); y++) {
          const tile = new Location(x, y);
          if (tile.getDistance(playerLocation) !== distance) {
            continue;
          }
          deltas.add(Location.delta(playerLocation, tile));
          player.getPacketSender().sendGraphic(ATTACK_RANGE_DEBUG_GRAPHIC, tile);
        }
      }

      if (devOnly(player)) {
        console.log(`Deltas for distance of ${distance}:`);
        console.log(deltas);
      }
      return true;
    };

    api.registerCommand("atkrange", attackRangeFn);
    api.registerCommand("attackrange", attackRangeFn);

    api.registerCommand("item", ({ player, parts }) => {
      if (!requireRights(player, adminOrAbove)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      const amount = parts.length > 2 ? parseIntArg(parts[2]) : 1;
      if (id === null || amount === null || id < 0 || amount <= 0) {
        player.getPacketSender().sendMessage("Usage: ::item id [amount]");
        return true;
      }
      const cappedAmount = Math.min(amount, Number.MAX_SAFE_INTEGER);
      player.getInventory().adds(id, cappedAmount);
      player
        .getPacketSender()
        .sendMessage(`Spawned item ${id} x${cappedAmount}.`);
      return true;
    });

    api.registerCommand("unlockprayers", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const type = parseIntArg(parts[1]);
      if (type === 0) {
        player.setPreserveUnlocked(true);
      } else if (type === 1) {
        player.setRigourUnlocked(true);
      } else if (type === 2) {
        player.setAuguryUnlocked(true);
      }
      player.getPacketSender().sendConfig(709, player.isPreserveUnlocked() ? 1 : 0);
      player.getPacketSender().sendConfig(711, player.isRigourUnlocked() ? 1 : 0);
      player.getPacketSender().sendConfig(713, player.getAuguryUnlocked() ? 1 : 0);
      return true;
    });

    api.registerCommand("gesell", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id === null) {
        return true;
      }
      const def = ItemDefinition.forId(id);
      player
        .getPacketSender()
        .sendItemOnInterfaces(24780, id, 1)
        .sendString(def.getName(), 24769)
        .sendString(def.getExamine(), 24770);
      return true;
    });

    api.registerCommand("flood", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const amount = parseIntArg(parts[1]);
      if (amount !== null) {
        Server.getFlooder().login(amount);
      }
      return true;
    });

    api.registerCommand("reloadpunishments", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      PlayerPunishment.init();
      player.getPacketSender().sendConsoleMessage("Reloaded");
      return true;
    });

    api.registerCommand("reloadshops", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      try {
        const reloadShops = globalThis.__shopReload;
        if (typeof reloadShops !== "function") {
          player
            .getPacketSender()
            .sendMessage(
              "Shop plugin reload hook is unavailable. Check shop plugin startup logs."
            );
          return true;
        }
        const result = reloadShops();
        const shopCount = Number(result?.shopCount ?? 0);
        player.getPacketSender().sendConsoleMessage(`Reloaded shops (${shopCount}).`);
      } catch (error) {
        console.error(error);
        player.getPacketSender().sendMessage("Error reloading shops.");
      }
      return true;
    });

    api.registerCommand("reloaddrops", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      try {
        new NpcDropDefinitionLoader().load();
        player.getPacketSender().sendConsoleMessage("Reloaded drops.");
      } catch (error) {
        console.error(error);
        player.getPacketSender().sendMessage("Error reloading npc drops.");
      }
      return true;
    });

    api.registerCommand("reloadnpcspawns", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      try {
        const reloadNpcSpawns = globalThis.__npcSpawnReload;
        if (typeof reloadNpcSpawns !== "function") {
          player
            .getPacketSender()
            .sendMessage(
              "NPC spawn plugin reload hook is unavailable. Check NPC spawn plugin startup logs."
            );
          return true;
        }

        const loaded = reloadNpcSpawns();
        if (loaded === false) {
          player.getPacketSender().sendMessage("Error reloading npc spawns.");
          return true;
        }

        const source = String(globalThis.__npcSpawnSource ?? "unknown");
        player
          .getPacketSender()
          .sendConsoleMessage(`Reloaded npc spawns via plugin source: ${source}.`);
      } catch (error) {
        console.error(error);
        player.getPacketSender().sendMessage("Error reloading npc spawns.");
      }
      return true;
    });

    api.registerCommand("reloadnpcdefs", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.getPacketSender().sendConsoleMessage("Reloaded npc defs.");
      return true;
    });

    api.registerCommand("logstatus", ({ player }) => {
      if (!requireRights(player, devOnly)) {
        return true;
      }
      const levels = ServerLogger.getEnabledLevels().join(",") || "(none)";
      const enabledTypes = ServerLogger.getEnabledTypes().join(",") || "(none)";
      const disabledTypes = ServerLogger.getDisabledTypes().join(",") || "(none)";
      player.getPacketSender().sendMessage(`Log levels: ${levels}`);
      player.getPacketSender().sendMessage(`Enabled types: ${enabledTypes}`);
      player.getPacketSender().sendMessage(`Disabled types: ${disabledTypes}`);
      return true;
    });

    api.registerCommand("loglevels", ({ player, parts }) => {
      if (!requireRights(player, devOnly)) {
        return true;
      }
      const values = parseCsvArgs(parts, 1);
      if (values.length === 0) {
        player.getPacketSender().sendMessage("Usage: ::loglevels debug,info,warn,error");
        return true;
      }
      const valid = values.filter((value) =>
        value === "debug" || value === "info" || value === "warn" || value === "error"
      );
      ServerLogger.setEnabledLevels(valid);
      player.getPacketSender().sendMessage(`Updated log levels: ${valid.join(",") || "(none)"}`);
      return true;
    });

    api.registerCommand("logtypeon", ({ player, parts }) => {
      if (!requireRights(player, devOnly)) {
        return true;
      }
      const values = parseCsvArgs(parts, 1);
      if (values.length === 0) {
        player.getPacketSender().sendMessage("Usage: ::logtypeon plugin,packet.out,world");
        return true;
      }
      const merged = new Set([...(ServerLogger.getEnabledTypes() || []), ...values]);
      ServerLogger.setEnabledTypes(Array.from(merged));
      player.getPacketSender().sendMessage(`Enabled log types: ${Array.from(merged).join(",")}`);
      return true;
    });

    api.registerCommand("logtypeoff", ({ player, parts }) => {
      if (!requireRights(player, devOnly)) {
        return true;
      }
      const values = parseCsvArgs(parts, 1);
      if (values.length === 0) {
        player.getPacketSender().sendMessage("Usage: ::logtypeoff plugin,packet.out,world");
        return true;
      }
      const merged = new Set([...(ServerLogger.getDisabledTypes() || []), ...values]);
      ServerLogger.setDisabledTypes(Array.from(merged));
      player.getPacketSender().sendMessage(`Disabled log types: ${Array.from(merged).join(",")}`);
      return true;
    });

    api.registerCommand("logtypeclear", ({ player, parts }) => {
      if (!requireRights(player, devOnly)) {
        return true;
      }
      const mode = String(parts[1] || "all").toLowerCase();
      if (mode === "enabled" || mode === "all") {
        ServerLogger.setEnabledTypes([]);
      }
      if (mode === "disabled" || mode === "all") {
        ServerLogger.setDisabledTypes([]);
      }
      player.getPacketSender().sendMessage(
        `Cleared log type filters (${mode}). Enabled: ${ServerLogger.getEnabledTypes().join(",") || "(none)"} Disabled: ${ServerLogger.getDisabledTypes().join(",") || "(none)"}`
      );
      return true;
    });

    api.registerCommand("reloaditems", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      player.getPacketSender().sendMessage("Reloaded item defs");
      return true;
    });

    api.registerCommand("mute", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!GameConstants.PLAYER_PERSISTENCE.exists(targetName) && !target) {
        player.getPacketSender().sendMessage(`Player ${targetName} does not exist.`);
      }
      return true;
    });

    api.registerCommand("unmute", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!GameConstants.PLAYER_PERSISTENCE.exists(targetName) && !target) {
        player.getPacketSender().sendMessage(`Player ${targetName} does not exist.`);
        return true;
      }
      if (!PlayerPunishment.muted(targetName)) {
        player.getPacketSender().sendMessage(`Player ${targetName} does not have an active mute.`);
      }
      return true;
    });

    api.registerCommand("ipmute", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!target) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not online.`);
      }
      return true;
    });

    api.registerCommand("unipmute", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!target) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not online.`);
        return true;
      }
      if (CombatFactory.inCombat(target)) {
        player.getPacketSender().sendMessage(`Player ${targetName} is in combat!`);
      }
      return true;
    });

    api.registerCommand("ban", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!GameConstants.PLAYER_PERSISTENCE.exists(targetName) && !target) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not a valid online player.`);
        return true;
      }
      if (PlayerPunishment.banned(targetName)) {
        player.getPacketSender().sendMessage(`Player ${targetName} already has an active ban.`);
        if (target) {
          target.requestLogout();
        }
      }
      return true;
    });

    api.registerCommand("unban", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      if (!GameConstants.PLAYER_PERSISTENCE.exists(targetName)) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not online.`);
        return true;
      }
      if (!PlayerPunishment.banned(targetName)) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not banned!`);
      }
      return true;
    });

    api.registerCommand("ipban", ({ player, raw, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const targetName = commandTail(raw, parts);
      const target = World.getPlayerByName(targetName);
      if (!target) {
        player.getPacketSender().sendMessage(`Player ${targetName} is not online.`);
      }
      return true;
    });

    if (!Server.PRODUCTION) {
      api.registerCommand("t", ({ player }) => {
        if (!requireRights(player, devOnly)) {
          return true;
        }
        console.log(RegionManager.wallsExist(player.getLocation().clone(), player.getPrivateArea()));
        return true;
      });
    }

    // Legacy no-op command stubs from previous command package.
    api.registerCommand("barrage", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      return true;
    });

    api.registerCommand("dialogue", ({ player }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      return true;
    });
  },
};
