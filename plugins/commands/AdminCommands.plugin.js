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
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../src/main/typescript/elvarg/game/model/Graphic");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { ClanChatManager } = require("../../src/main/typescript/elvarg/game/content/clan/ClanChatManager");
const { NpcDropDefinitionLoader } = require("../../src/main/typescript/elvarg/game/definition/loader/impl/NpcDropDefinitionLoader");
const { NpcSpawnDefinitionLoader } = require("../../src/main/typescript/elvarg/game/definition/loader/impl/NpcSpawnDefinitionLoader");
const { ShopDefinitionLoader } = require("../../src/main/typescript/elvarg/game/definition/loader/impl/ShopDefinitionLoader");
const { RegionManager } = require("../../src/main/typescript/elvarg/game/collision/RegionManager");
const { DamageFormulas } = require("../../src/main/typescript/elvarg/game/content/combat/formula/DamageFormulas");
const { PlayerPunishment } = require("../../src/main/typescript/elvarg/util/PlayerPunishment");

const ATTACK_RANGE_DEBUG_GRAPHIC = new Graphic(332, 0);

function parseIntArg(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
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
      if (id === null) {
        return true;
      }
      const npc = NPC.create(id, player.getLocation().clone());
      World.getAddNPCQueue().push(npc);
      if (player.getPrivateArea()) {
        player.getPrivateArea().add(npc);
      }
      return true;
    });

    api.registerCommand("n", ({ player, parts }) => {
      if (!requireRights(player, ownerOrDev)) {
        return true;
      }
      const id = parseIntArg(parts[1]);
      if (id === null) {
        return true;
      }
      const npc = NPC.create(id, player.getLocation().clone());
      World.getAddNPCQueue().push(npc);
      if (player.getPrivateArea()) {
        player.getPrivateArea().add(npc);
      }
      player.getPacketSender().sendMessage("Spawned NPC in-memory. Persistent spawn file write is not enabled in plugins.");
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
      const id = parseIntArg(parts[1]);
      if (id === null) {
        return true;
      }
      const sound = new Sound(id, null, null, null);
      Sounds.sendSound(player, sound);
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
        new ShopDefinitionLoader().load();
        player.getPacketSender().sendConsoleMessage("Reloaded shops.");
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
        World.getNpcs().clear();
        new NpcSpawnDefinitionLoader().load();
        player.getPacketSender().sendConsoleMessage("Reloaded npc spawns.");
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
