"use strict";

const fs = require("fs");
const path = require("path");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { DonatorRights } = require("../../src/main/typescript/elvarg/game/model/rights/DonatorRights");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { SecondsTimer } = require("../../src/main/typescript/elvarg/game/model/SecondsTimer");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { PlayerPunishment } = require("../../src/main/typescript/elvarg/util/PlayerPunishment");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { Wilderness } = require("../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const {
  getActiveBotRuntime,
} = require("../bots/runtime/BotRuntimeRegistry");
const {
  releaseRecruitedBotToAutonomy,
} = require("../bots/runtime/BotRecruitRuntime");
const {
  applyGeneratedPvpLoadout,
} = require("../bots/behaviours/policies/PvpLoadoutPolicy");

const FILE_DIRECTORY = path.join(process.cwd(), "data", "saves", "clans");
const MAX_CLANS = 3000;
const CLAN_CHAT_SETUP_INTERFACE_ID = 38300;
const CLAN_CHAT_SETUP_BUTTON = 37132;
const CLAN_CHAT_JOIN_LEAVE_BUTTON = 37129;
const CLAN_CHAT_NAME_BUTTON = 38319;
const CLAN_CHAT_ENTER_RANK_BUTTON = 38322;
const CLAN_CHAT_TALK_RANK_BUTTON = 38325;
const CLAN_CHAT_KICK_RANK_BUTTON = 38328;
const CLAN_CHAT_MEMBER_BUTTON_START = 37144;
const CLAN_CHAT_MEMBER_BUTTON_END = 37243;
const CLAN_CHAT_FRIEND_BUTTON_START = 38752;
const CLAN_CHAT_FRIEND_BUTTON_END = 38951;
const CLAN_CHAT_MEMBER_DEFAULT_ACTIONS = Object.freeze([
  "Promote to Recruit",
  "Promote to Corporal",
  "Promote to Sergeant",
  "Promote to Lieutenant",
  "Promote to Captain",
  "Promote to General",
  "Demote",
  "Kick",
]);
const CLAN_CHAT_BOT_MEMBER_ACTIONS = Object.freeze([
  "Re-loadout",
  null,
  null,
  null,
  null,
  null,
  null,
  "Kick",
]);

function rangeInclusive(start, end) {
  const values = [];
  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }
  return values;
}

function areClanFriendlyFireTargets(attacker, target) {
  if (!attacker || !target || attacker === target) {
    return false;
  }
  const attackerClan = attacker.getCurrentClanChat?.();
  const targetClan = target.getCurrentClanChat?.();
  return attackerClan != null && attackerClan === targetClan;
}

function isClanBotMember(player) {
  return player?.isPlayerBot?.() === true;
}

function reloadClanBotLoadout(owner, bot) {
  if (!owner || !bot || bot.isRegistered?.() !== true) {
    return false;
  }
  if (Wilderness.isIn(owner)) {
    owner.getPacketSender?.().sendMessage?.("You can't reload bot loadouts in the wilderness.");
    return true;
  }
  const { runtime } = getActiveBotRuntime();
  const botUsername = bot.getUsername?.();
  const botState = botUsername ? runtime?.botStatesByName?.get?.(botUsername) ?? null : null;
  if (!botState?.pvp) {
    owner.getPacketSender?.().sendMessage?.("That bot does not have a PvP loadout to refresh.");
    return true;
  }
  botState.pvp.generatedArchetypeId = null;
  const applied = applyGeneratedPvpLoadout(bot, botState);
  if (!applied) {
    owner.getPacketSender?.().sendMessage?.("Failed to refresh that bot's loadout.");
    return true;
  }
  owner
    .getPacketSender?.()
    .sendMessage?.(`Reloaded ${bot.getUsername?.()}'s loadout.`);
  return true;
}

const CLAN_CHAT_BUTTON_IDS = [
  CLAN_CHAT_SETUP_BUTTON,
  CLAN_CHAT_JOIN_LEAVE_BUTTON,
  CLAN_CHAT_NAME_BUTTON,
  CLAN_CHAT_ENTER_RANK_BUTTON,
  CLAN_CHAT_TALK_RANK_BUTTON,
  CLAN_CHAT_KICK_RANK_BUTTON,
  ...rangeInclusive(CLAN_CHAT_MEMBER_BUTTON_START, CLAN_CHAT_MEMBER_BUTTON_END),
  ...rangeInclusive(CLAN_CHAT_FRIEND_BUTTON_START, CLAN_CHAT_FRIEND_BUTTON_END),
];

class BannedMember {
  constructor(name, seconds = 1800) {
    this.name = name;
    this.timer = new SecondsTimer();
    this.timer.start(seconds);
  }

  getTimer() {
    return this.timer;
  }

  getName() {
    return this.name;
  }
}

class ClanChatRank {
  constructor(actionMenuId, spriteId, name, ordinalId) {
    this.actionMenuId = actionMenuId;
    this.spriteId = spriteId;
    this.name = name;
    this.ordinalId = ordinalId;
  }

  getSpriteId() {
    return this.spriteId;
  }

  ordinal() {
    return this.ordinalId;
  }

  toString() {
    return this.name;
  }

  static forId(id) {
    return ClanChatRank.VALUES.find((rank) => rank.ordinal() === id) ?? null;
  }

  static forMenuId(id) {
    return ClanChatRank.VALUES.find((rank) => rank.actionMenuId === id) ?? null;
  }
}

ClanChatRank.FRIEND = new ClanChatRank(-1, 197, "friend", 0);
ClanChatRank.RECRUIT = new ClanChatRank(0, 198, "recruit", 1);
ClanChatRank.CORPORAL = new ClanChatRank(1, 199, "corporal", 2);
ClanChatRank.SERGEANT = new ClanChatRank(2, 200, "sergeant", 3);
ClanChatRank.LIEUTENANT = new ClanChatRank(3, 201, "lieutenant", 4);
ClanChatRank.CAPTAIN = new ClanChatRank(4, 202, "captain", 5);
ClanChatRank.GENERAL = new ClanChatRank(5, 203, "general", 6);
ClanChatRank.OWNER = new ClanChatRank(-1, 204, "owner", 7);
ClanChatRank.STAFF = new ClanChatRank(-1, 203, "staff", 8);
ClanChatRank.VALUES = [
  ClanChatRank.FRIEND,
  ClanChatRank.RECRUIT,
  ClanChatRank.CORPORAL,
  ClanChatRank.SERGEANT,
  ClanChatRank.LIEUTENANT,
  ClanChatRank.CAPTAIN,
  ClanChatRank.GENERAL,
  ClanChatRank.OWNER,
  ClanChatRank.STAFF,
];

class ClanChat {
  constructor(ownerName = "", name = "", index = -1) {
    this.index = index;
    this.name = name;
    this.ownerName = ownerName;
    this.owner = ownerName ? World.getPlayerByName(ownerName) : null;
    this.lootShare = false;
    this.rankRequirement = new Array(3);
    this.members = [];
    this.bannedMembers = [];
    this.rankedNames = new Map();
  }

  getOwner() {
    return this.owner;
  }

  setOwner(owner) {
    this.owner = owner;
    return this;
  }

  getOwnerName() {
    return this.ownerName;
  }

  getIndex() {
    return this.index;
  }

  getName() {
    return this.name;
  }

  setName(name) {
    this.name = name;
    return this;
  }

  getLootShare() {
    return this.lootShare;
  }

  setLootShare(lootShare) {
    this.lootShare = lootShare;
  }

  addMember(member) {
    this.members.push(member);
    return this;
  }

  removeMember(name) {
    this.members = this.members.filter((member) => member && member.getUsername?.() !== name);
    return this;
  }

  getPlayerRank(player) {
    return this.getRank(player?.getUsername?.());
  }

  givePlayerRank(player, rank) {
    return this.giveRank(player?.getUsername?.(), rank);
  }

  getRank(playerName) {
    return this.rankedNames.get(playerName) ?? null;
  }

  giveRank(playerName, rank) {
    if (!playerName) {
      return this;
    }
    if (rank == null) {
      this.rankedNames.delete(playerName);
    } else {
      this.rankedNames.set(playerName, rank);
    }
    return this;
  }

  getMembers() {
    return this.members;
  }

  getRankedNames() {
    return this.rankedNames;
  }

  getBannedNames() {
    return this.bannedMembers;
  }

  addBannedName(name) {
    this.bannedMembers.push(new BannedMember(name, 1800));
  }

  isBanned(name) {
    this.bannedMembers = this.bannedMembers.filter((banned) => banned && !banned.getTimer().finished());
    return this.bannedMembers.some((banned) => banned.getName() === name);
  }

  getRankRequirement() {
    return this.rankRequirement;
  }

  setRankRequirements(index, rankRequirement) {
    this.rankRequirement[index] = rankRequirement ?? null;
    return this;
  }
}

ClanChat.RANK_REQUIRED_TO_ENTER = 0;
ClanChat.RANK_REQUIRED_TO_KICK = 1;
ClanChat.RANK_REQUIRED_TO_TALK = 2;

class ClanChatManager {
  static init() {
    ensureDirectory();
    this.clans = new Array(MAX_CLANS);

    for (const fileName of fs.readdirSync(FILE_DIRECTORY)) {
      const filePath = path.join(FILE_DIRECTORY, fileName);
      if (!fileName.endsWith(".json") || !fs.statSync(filePath).isFile()) {
        continue;
      }

      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const index = Number.isInteger(data?.index) ? data.index : this.getIndex();
        if (index < 0 || index >= MAX_CLANS) {
          continue;
        }

        const clan = new ClanChat(
          String(data?.ownerName ?? ""),
          String(data?.name ?? ""),
          index
        );

        clan.setRankRequirements(
          ClanChat.RANK_REQUIRED_TO_ENTER,
          ClanChatRank.forId(Number(data?.enterRankOrdinal))
        );
        clan.setRankRequirements(
          ClanChat.RANK_REQUIRED_TO_KICK,
          ClanChatRank.forId(Number(data?.kickRankOrdinal))
        );
        clan.setRankRequirements(
          ClanChat.RANK_REQUIRED_TO_TALK,
          ClanChatRank.forId(Number(data?.talkRankOrdinal))
        );

        for (const entry of Array.isArray(data?.rankedNames) ? data.rankedNames : []) {
          const rank = ClanChatRank.forId(Number(entry?.ordinal));
          const name = String(entry?.name ?? "");
          if (name && rank) {
            clan.giveRank(name, rank);
          }
        }

        for (const entry of Array.isArray(data?.bannedNames) ? data.bannedNames : []) {
          const name = String(entry?.name ?? entry ?? "");
          const seconds = Number.isInteger(entry?.secondsRemaining) ? entry.secondsRemaining : 1800;
          if (name) {
            clan.getBannedNames().push(new BannedMember(name, seconds));
          }
        }

        this.clans[index] = clan;
      } catch (error) {
        console.error("[plugin:ClanChat] failed to load clan", fileName, error);
      }
    }
  }

  static writeFile(clan) {
    try {
      ensureDirectory();
      const filePath = getClanFilePath(clan.getName());
      const payload = {
        index: clan.getIndex(),
        name: clan.getName(),
        ownerName: clan.getOwnerName(),
        enterRankOrdinal: clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_ENTER]?.ordinal?.() ?? null,
        kickRankOrdinal: clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_KICK]?.ordinal?.() ?? null,
        talkRankOrdinal: clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_TALK]?.ordinal?.() ?? null,
        rankedNames: Array.from(clan.getRankedNames().entries()).map(([name, rank]) => ({
          name,
          ordinal: rank?.ordinal?.() ?? null,
        })),
        bannedNames: clan.getBannedNames().map((ban) => ({
          name: ban.getName(),
          secondsRemaining: ban.getTimer().secondsRemaining(),
        })),
      };
      fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    } catch (error) {
      console.error("[plugin:ClanChat] failed to save clan", clan?.getName?.(), error);
    }
  }

  static save() {
    for (const clan of this.clans) {
      if (clan) {
        this.writeFile(clan);
      }
    }
  }

  static create(player, name) {
    const index = this.getIndex();
    if (index === -1) {
      player.getPacketSender().sendMessage("An error occured! Please contact an administrator and report this.");
      return null;
    }

    const clan = new ClanChat(player.getUsername(), Misc.capitalizeWords(name), index);
    clan.getRankedNames().set(player.getUsername(), ClanChatRank.OWNER);
    clan.setRankRequirements(ClanChat.RANK_REQUIRED_TO_KICK, ClanChatRank.OWNER);
    this.clans[index] = clan;
    this.writeFile(clan);
    return clan;
  }

  static joinChat(player, channel) {
    const normalized = String(channel ?? "").trim().toLowerCase();
    if (!normalized || normalized === "null") {
      return;
    }
    if (player.getCurrentClanChat?.() != null) {
      player.getPacketSender().sendMessage("You are already in a clan channel.");
      return;
    }

    for (const clan of this.clans) {
      if (clan && clan.getName().toLowerCase() === normalized) {
        this.join(player, clan);
        return;
      }
    }

    player.getPacketSender().sendMessage("That channel does not exist.");
  }

  static join(player, clan) {
    if (!clan) {
      return;
    }

    if (clan.getOwnerName() === player.getUsername()) {
      if (clan.getOwner() == null) {
        clan.setOwner(player);
      }
      clan.givePlayerRank(player, ClanChatRank.OWNER);
    }

    player.getPacketSender().sendMessage("Attempting to join channel...");

    if (clan.getMembers().length >= 100) {
      player.getPacketSender().sendMessage("This clan channel is currently full.");
      return;
    }
    if (clan.isBanned(player.getUsername())) {
      player
        .getPacketSender()
        .sendMessage("You're currently banned from using this channel. Bans expire after 30 minutes.");
      return;
    }

    const rank = clan.getPlayerRank(player);
    const enterRank = clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_ENTER];
    if (enterRank && (!rank || rank.getSpriteId() < enterRank.getSpriteId())) {
      player.getPacketSender().sendMessage("Your rank is not high enough to enter this channel.");
      return;
    }

    player.setCurrentClanChat?.(clan);
    player.setClanChatName?.(clan.getName());
    const clanName = Misc.capitalizeWords(clan.getName());
    clan.addMember(player);
    player.getPacketSender().sendString(`Talking in: @whi@${clanName}`, 37139);
    player.getPacketSender().sendString(`Owner: ${Misc.capitalizeWords(clan.getOwnerName())}`, 37140);
    player.getPacketSender().sendString("Leave Chat", 37135);
    player.getPacketSender().sendMessage(`Now talking in ${clan.getOwnerName()}'s channel.`);
    player.getPacketSender().sendMessage("To talk start each line of chat with the / symbol.");
    this.updateList(clan);
    this.writeFile(clan);
  }

  static updateList(clan) {
    clan.getMembers().sort((left, right) => compareMemberRanks(clan, left, right));

    for (const member of clan.getMembers()) {
      if (!member) {
        continue;
      }

      let childId = CLAN_CHAT_MEMBER_BUTTON_START;
      for (const other of clan.getMembers()) {
        if (!other) {
          continue;
        }
        const rank = clan.getPlayerRank(other);
        const image = rank ? rank.getSpriteId() : -1;
        const prefix = image !== -1 ? `<img=${image}>` : "";
        member.getPacketSender().sendString(`${prefix}${other.getUsername()}`, childId);
        member
          .getPacketSender()
          .sendInterfaceActions(
            childId,
            isClanBotMember(other)
              ? CLAN_CHAT_BOT_MEMBER_ACTIONS
              : CLAN_CHAT_MEMBER_DEFAULT_ACTIONS
          );
        childId += 1;
      }
      member.getPacketSender().clearInterfaceText(childId, CLAN_CHAT_MEMBER_BUTTON_END);

      const rank = clan.getPlayerRank(member);
      const kickRank = clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_KICK];
      const canKick =
        rank === ClanChatRank.OWNER ||
        rank === ClanChatRank.STAFF ||
        kickRank == null ||
        (rank != null && rank.getSpriteId() >= kickRank.getSpriteId());
      member.getPacketSender().sendShowClanChatOptions(canKick);
    }
  }

  static sendMessage(player, message) {
    if (PlayerPunishment.muted(player.getUsername()) || PlayerPunishment.IPMuted(player.getHostAddress())) {
      player.getPacketSender().sendMessage("You are muted and cannot chat.");
      return;
    }

    const clan = player.getCurrentClanChat?.();
    if (!clan) {
      player.getPacketSender().sendMessage("You're not in a clanchat channel.");
      return;
    }

    const rank = clan.getPlayerRank(player);
    const talkRank = clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_TALK];
    if (talkRank && (!rank || rank.getSpriteId() < talkRank.getSpriteId())) {
      player.getPacketSender().sendMessage("You do not have the required rank to speak in this channel.");
      return;
    }

    const clanPrefix = `<col=16777215>[<col=255>${clan.getName()}<col=16777215>]`;
    let rightsPrefix = "";
    if (player.getRights?.() !== PlayerRights.NONE) {
      rightsPrefix = `<img=${player.getRights().getSpriteId()}>`;
    } else if (player.getDonatorRights?.() !== DonatorRights.NONE) {
      rightsPrefix = `<img=${player.getDonatorRights().getSpriteId()}>`;
    }

    for (const member of clan.getMembers()) {
      if (!member) {
        continue;
      }
      if (member.getRelations?.().getIgnoreList?.().includes?.(player.getLongUsername?.())) {
        continue;
      }
      member.getPacketSender().sendSpecialMessage(
        player.getUsername(),
        16,
        `${clanPrefix}@bla@${rightsPrefix} ${Misc.capitalizeWords(player.getUsername())}: <col=993D00>${Misc.capitalize(message)}`
      );
    }
  }

  static sendChatMessage(clan, message) {
    for (const member of clan.getMembers()) {
      member?.getPacketSender?.().sendMessage(message);
    }
  }

  static leave(player, kicked) {
    const clan = player.getCurrentClanChat?.();
    if (!clan) {
      return;
    }

    this.resetInterface(player);
    player.setCurrentClanChat?.(null);
    clan.removeMember(player.getUsername?.());
    player.getPacketSender().sendShowClanChatOptions(false);
    this.updateList(clan);
    if (kicked) {
      player.setClanChatName?.("");
    }
    player.getPacketSender().sendMessage(
      kicked ? "You have been kicked from the channel." : "You have left the channel."
    );
    this.writeFile(clan);
  }

  static delete(player) {
    const clan = this.getClanChat(player);
    if (!clan) {
      player.getPacketSender().sendMessage("Your clanchat channel is already disabled.");
      return;
    }

    for (const member of [...clan.getMembers()]) {
      if (member) {
        this.leave(member, false);
      }
    }
    if (player.getClanChatName?.()?.toLowerCase?.() === clan.getName().toLowerCase()) {
      player.setClanChatName?.("");
    }
    this.clans[clan.getIndex()] = null;
    deleteClanFile(clan.getName());
    if (player.getInterfaceId?.() === CLAN_CHAT_SETUP_INTERFACE_ID) {
      this.clanChatSetupInterface(player);
    }
  }

  static updateRank(clan, player2) {
    if (!clan || !player2) {
      return;
    }

    let rank = clan.getPlayerRank(player2);
    const owner = clan.getOwner();
    if (owner) {
      if (owner.getRelations().isFriendWith(player2.getUsername())) {
        if (rank == null) {
          clan.givePlayerRank(player2, ClanChatRank.FRIEND);
          this.updateList(clan);
          this.writeFile(clan);
        }
      } else if (rank === ClanChatRank.FRIEND) {
        clan.givePlayerRank(player2, null);
        this.updateList(clan);
        this.writeFile(clan);
      }
    }

    if (player2.isStaff?.()) {
      if (rank == null) {
        clan.givePlayerRank(player2, ClanChatRank.STAFF);
        this.updateList(clan);
        this.writeFile(clan);
      }
      return;
    }

    if (rank === ClanChatRank.STAFF) {
      clan.givePlayerRank(player2, null);
      this.updateList(clan);
      this.writeFile(clan);
    }
  }

  static setName(player, newName) {
    if (GameConstants.PLAYER_PERSISTENCE.exists(newName)) {
      player.getPacketSender().sendMessage("That clanchat name is already taken.");
      return;
    }

    const normalized = String(newName ?? "").toLowerCase();
    for (const clan of this.clans) {
      if (clan && clan.getName().toLowerCase() === normalized) {
        player.getPacketSender().sendMessage("That clanchat name is already taken.");
        return;
      }
    }

    let clan = this.getClanChat(player);
    const createdNewClan = clan == null;
    if (!clan) {
      clan = this.create(player, normalized);
    }
    if (!clan) {
      return;
    }

    if (!createdNewClan && clan.getName().toLowerCase() === normalized) {
      return;
    }

    const previousName = clan.getName();
    if (!createdNewClan) {
      deleteClanFile(previousName);
    }

    clan.setName(Misc.capitalizeWords(normalized));
    for (const member of clan.getMembers()) {
      if (!member) {
        continue;
      }
      member.setClanChatName?.(clan.getName());
      member.getPacketSender().sendString(`Talking in: @whi@${clan.getName()}`, 37139);
    }
    this.writeFile(clan);
    if (player.getCurrentClanChat?.() == null) {
      this.join(player, clan);
    }
    if (player.getInterfaceId?.() === CLAN_CHAT_SETUP_INTERFACE_ID) {
      this.clanChatSetupInterface(player);
    }
  }

  static kick(player, target) {
    const clan = player.getCurrentClanChat?.();
    if (!clan) {
      player.getPacketSender().sendMessage("You're not in a clan channel.");
      return;
    }

    const rank = clan.getPlayerRank(player);
    const kickRank = clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_KICK];
    if (kickRank && (!rank || rank.getSpriteId() < kickRank.getSpriteId())) {
      player.getPacketSender().sendMessage("You do not have the required rank to kick this player.");
      return;
    }

    for (const member of clan.getMembers()) {
      if (!member || member !== target) {
        continue;
      }

      const memberRank = clan.getPlayerRank(member);
      if (memberRank === ClanChatRank.STAFF) {
        player.getPacketSender().sendMessage("That player cannot be kicked.");
        return;
      }
      if (memberRank && (!rank || rank.getSpriteId() < memberRank.getSpriteId())) {
        player.getPacketSender().sendMessage("You cannot kick a player who has a higher rank than you!");
        return;
      }

      clan.addBannedName(member.getUsername());
      this.leave(member, true);
      if (member.isPlayerBot?.() === true) {
        const { runtime, behaviorMode } = getActiveBotRuntime();
        const memberUsername = member.getUsername?.();
        const botState = memberUsername
          ? runtime?.botStatesByName?.get?.(memberUsername) ?? null
          : null;
        if (botState) {
          releaseRecruitedBotToAutonomy(
            member,
            botState,
            behaviorMode,
            Date.now()
          );
        }
      }
      this.sendChatMessage(
        clan,
        `<col=16777215>[<col=255>${clan.getName()}<col=16777215>]<col=3300CC> ${member.getUsername()} has been kicked from the channel by ${player.getUsername()}.`
      );
      this.writeFile(clan);
      return;
    }
  }

  static clanChatSetupInterface(player) {
    player.getPacketSender().clearInterfaceText(CLAN_CHAT_FRIEND_BUTTON_START, 39551);

    const clan = this.getClanChat(player);
    if (!clan) {
      player.getPacketSender().sendString("Clan disabled", 38332);
      player.getPacketSender().sendString("Anyone", 38334);
      player.getPacketSender().sendString("Anyone", 38336);
      player.getPacketSender().sendString("Only me", 38338);
      player.getPacketSender().sendInterface(CLAN_CHAT_SETUP_INTERFACE_ID);
      return;
    }

    player.getPacketSender().sendString(clan.getName(), 38332);
    player
      .getPacketSender()
      .sendString(formatRequirement(clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_ENTER]), 38334)
      .sendString(formatRequirement(clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_TALK]), 38336)
      .sendString(formatRequirement(clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_KICK]), 38338);

    let nameInterfaceId = CLAN_CHAT_FRIEND_BUTTON_START;
    let rankInterfaceId = 38952;
    for (const friend of player.getRelations().getFriendList()) {
      let playerName = Misc.longToString(friend);
      if (!playerName) {
        continue;
      }
      playerName = Misc.formatPlayerName(playerName);
      const rank = clan.getRank(playerName);
      player.getPacketSender().sendString(playerName, nameInterfaceId++);
      player
        .getPacketSender()
        .sendString(rank == null ? "Friend" : Misc.ucFirst(rank.toString().toLowerCase()), rankInterfaceId++);
    }

    player.getPacketSender().sendInterface(CLAN_CHAT_SETUP_INTERFACE_ID);
  }

  static onLogin(player) {
    this.resetInterface(player);
    if (player.clanChatName != null && player.clanChatName !== "") {
      this.joinChat(player, player.clanChatName);
    }
  }

  static resetInterface(player) {
    player.getPacketSender().sendString("Talking in: N/A", 37139);
    player.getPacketSender().sendString("Owner: N/A", 37140);
    player.getPacketSender().sendString("Join Chat", 37135);
    player.getPacketSender().clearInterfaceText(CLAN_CHAT_MEMBER_BUTTON_START, CLAN_CHAT_MEMBER_BUTTON_END);
  }

  static getIndex() {
    for (let i = 0; i < this.clans.length; i += 1) {
      if (this.clans[i] == null) {
        return i;
      }
    }
    return -1;
  }

  static getClans() {
    return this.clans;
  }

  static getClan(index) {
    return this.clans[index] ?? null;
  }

  static getClanChat(player) {
    for (const clan of this.clans) {
      if (clan && clan.getOwnerName() === player.getUsername()) {
        return clan;
      }
    }
    return null;
  }

  static getPlayer(index, clan) {
    let clanIndex = 0;
    for (const member of clan?.getMembers?.() ?? []) {
      if (!member) {
        continue;
      }
      if (clanIndex === index) {
        return member;
      }
      clanIndex += 1;
    }
    return null;
  }

  static handleButton(player, button, menuId) {
    if (player.interfaceId === CLAN_CHAT_SETUP_INTERFACE_ID) {
      const clan = this.getClanChat(player);

      if (button === CLAN_CHAT_ENTER_RANK_BUTTON || button === CLAN_CHAT_TALK_RANK_BUTTON || button === CLAN_CHAT_KICK_RANK_BUTTON) {
        if (!clan) {
          player.getPacketSender().sendMessage("Please enable your clanchat before changing this.");
          return true;
        }

        const rank = menuIdToRank(menuId);
        if (button === CLAN_CHAT_ENTER_RANK_BUTTON) {
          if (clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_ENTER] === rank) {
            return true;
          }
          clan.setRankRequirements(ClanChat.RANK_REQUIRED_TO_ENTER, rank);
          player.getPacketSender().sendMessage("You have changed your clanchat channel's settings.");
          if (rank) {
            for (const member of [...clan.getMembers()]) {
              if (!member) {
                continue;
              }
              const memberRank = clan.getPlayerRank(member);
              if (memberRank == null || rank.getSpriteId() > memberRank.getSpriteId()) {
                member.getPacketSender().sendMessage("Your rank is not high enough to be in this channel.");
                this.leave(member, false);
                player
                  .getPacketSender()
                  .sendMessage(`@red@Warning! Changing that setting kicked the player ${member.getUsername()} from the chat because`)
                  .sendMessage("@red@they do not have the required rank to be in the chat.");
              }
            }
          }
          this.clanChatSetupInterface(player);
          this.writeFile(clan);
          return true;
        }

        if (button === CLAN_CHAT_TALK_RANK_BUTTON) {
          if (clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_TALK] === rank) {
            return true;
          }
          clan.setRankRequirements(ClanChat.RANK_REQUIRED_TO_TALK, rank);
          player.getPacketSender().sendMessage("You have changed your clanchat channel's settings.");
          this.clanChatSetupInterface(player);
          this.writeFile(clan);
          return true;
        }

        if (clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_KICK] === rank) {
          return true;
        }
        clan.setRankRequirements(ClanChat.RANK_REQUIRED_TO_KICK, rank);
        player.getPacketSender().sendMessage("You have changed your clanchat channel's settings.");
        this.clanChatSetupInterface(player);
        this.updateList(clan);
        this.writeFile(clan);
        return true;
      }
    }

    let target = null;
    let clan = null;

    if (button >= CLAN_CHAT_MEMBER_BUTTON_START && button <= CLAN_CHAT_MEMBER_BUTTON_END) {
      const currentClan = player.getCurrentClanChat?.();
      if ((!currentClan || currentClan.ownerName !== player.username) && menuId !== 7) {
        player.getPacketSender().sendMessage("Only the clanchat owner can do that.");
        return true;
      }
      const index = button - CLAN_CHAT_MEMBER_BUTTON_START;
      target = this.getPlayer(index, currentClan)?.username ?? null;
      clan = currentClan;
    } else if (button >= CLAN_CHAT_FRIEND_BUTTON_START && button <= CLAN_CHAT_FRIEND_BUTTON_END) {
      const index = button - CLAN_CHAT_FRIEND_BUTTON_START;
      if (index < player.getRelations().getFriendList().length) {
        target = Misc.formatPlayerName(Misc.longToString(player.getRelations().getFriendList()[index]));
        clan = this.getClanChat(player);
        if (!clan) {
          player.getPacketSender().sendMessage("Please enable your clanchat before changing ranks.");
          return true;
        }
      }
    }

    if (clan && target && target !== player.username) {
      const targetPlayer = World.getPlayerByName(target);
      if (targetPlayer?.isPlayerBot?.() === true) {
        if (menuId === 0) {
          return reloadClanBotLoadout(player, targetPlayer);
        }
        if (menuId >= 1 && menuId <= 6) {
          player.getPacketSender().sendMessage("Bot clan members cannot be promoted or demoted.");
          return true;
        }
      }

      if (menuId >= 0 && menuId <= 5) {
        const rank = ClanChatRank.forMenuId(menuId);
        const targetRank = clan.getRank(target);
        if (targetRank === rank) {
          player.getPacketSender().sendMessage("That player already has that rank.");
          return true;
        }
        if (targetRank === ClanChatRank.STAFF) {
          player.getPacketSender().sendMessage("That player cannot be promoted or demoted.");
          return true;
        }

        clan.giveRank(target, rank);
        const targetPlayer = World.getPlayerByName(target);
        if (targetPlayer) {
          this.updateRank(clan, targetPlayer);
          const enterRank = clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_ENTER];
          if (enterRank && (!rank || enterRank.getSpriteId() > rank.getSpriteId())) {
            targetPlayer.getPacketSender().sendMessage("Your rank is not high enough to be in this channel.");
            this.leave(targetPlayer, false);
            player
              .getPacketSender()
              .sendMessage(`@red@Warning! Changing that setting kicked the player ${targetPlayer.username} from the chat because`)
              .sendMessage("@red@they do not have the required rank to be in the chat.");
          }
        }
        this.updateList(clan);
        if (player.interfaceId === CLAN_CHAT_SETUP_INTERFACE_ID) {
          this.clanChatSetupInterface(player);
        }
        this.writeFile(clan);
        return true;
      }

      if (menuId === 6) {
        const targetRank = player.getCurrentClanChat?.().getRank(target);
        if (targetRank == null) {
          player.getPacketSender().sendMessage("That player has no rank.");
          return true;
        }
        if (targetRank === ClanChatRank.STAFF) {
          player.getPacketSender().sendMessage("That player cannot be promoted or demoted.");
          return true;
        }

        clan.getRankedNames().delete(target);
        const targetPlayer = World.getPlayerByName(target);
        if (targetPlayer) {
          this.updateRank(clan, targetPlayer);
          const currentRank = clan.getPlayerRank(targetPlayer);
          const enterRank = clan.getRankRequirement()[ClanChat.RANK_REQUIRED_TO_ENTER];
          if (enterRank && (!currentRank || enterRank.getSpriteId() > currentRank.getSpriteId())) {
            targetPlayer.getPacketSender().sendMessage("Your rank is not high enough to be in this channel.");
            this.leave(targetPlayer, false);
            player
              .getPacketSender()
              .sendMessage(`@red@Warning! Changing that setting kicked the player ${targetPlayer.getUsername()} from the chat because`)
              .sendMessage("@red@they do not have the required rank to be in the chat.");
          }
        }
        this.updateList(clan);
        if (player.getInterfaceId?.() === CLAN_CHAT_SETUP_INTERFACE_ID) {
          this.clanChatSetupInterface(player);
        }
        this.writeFile(clan);
        return true;
      }

      if (menuId === 7) {
        const kickTarget = World.getPlayerByName(target);
        if (kickTarget) {
          this.kick(player, kickTarget);
        }
        return true;
      }
    }

    return false;
  }
}

ClanChatManager.CLAN_CHAT_SETUP_INTERFACE_ID = CLAN_CHAT_SETUP_INTERFACE_ID;
ClanChatManager.clans = new Array(MAX_CLANS);

function ensureDirectory() {
  fs.mkdirSync(FILE_DIRECTORY, { recursive: true });
}

function getClanFilePath(name) {
  return path.join(FILE_DIRECTORY, `${encodeURIComponent(String(name ?? "").toLowerCase())}.json`);
}

function deleteClanFile(name) {
  const filePath = getClanFilePath(name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function compareMemberRanks(clan, left, right) {
  const leftRank = clan.getPlayerRank(left);
  const rightRank = clan.getPlayerRank(right);
  if (!leftRank && !rightRank) {
    return 1;
  }
  if (!leftRank && rightRank) {
    return 1;
  }
  if (leftRank && !rightRank) {
    return -1;
  }
  if (leftRank.getSpriteId() === rightRank.getSpriteId()) {
    return 1;
  }
  if (leftRank === ClanChatRank.OWNER) {
    return -1;
  }
  if (rightRank === ClanChatRank.OWNER) {
    return 1;
  }
  return leftRank.getSpriteId() > rightRank.getSpriteId() ? -1 : 1;
}

function formatRequirement(rank) {
  if (rank == null) {
    return "Anyone";
  }
  if (rank === ClanChatRank.OWNER) {
    return "Only me";
  }
  return `${Misc.ucFirst(rank.toString().toLowerCase())}+`;
}

function menuIdToRank(menuId) {
  switch (menuId) {
    case 0:
      return ClanChatRank.OWNER;
    case 1:
      return ClanChatRank.GENERAL;
    case 2:
      return ClanChatRank.CAPTAIN;
    case 3:
      return ClanChatRank.LIEUTENANT;
    case 4:
      return ClanChatRank.SERGEANT;
    case 5:
      return ClanChatRank.CORPORAL;
    case 6:
      return ClanChatRank.RECRUIT;
    case 7:
      return ClanChatRank.FRIEND;
    default:
      return null;
  }
}

function promptJoinClanChat(player) {
  player.setEnteredSyntaxAction({
    execute: (rawInput) => {
      const input = Misc.formatText(rawInput ?? "");
      if (input) {
        ClanChatManager.joinChat(player, input);
      }
    },
  });
  player
    .getPacketSender()
    .sendEnterInputPrompt("Which clanchat channel would you like to join?");
}

function promptRenameClanChat(player) {
  player.setEnteredSyntaxAction({
    execute: (rawInput) => {
      let input = String(rawInput ?? "").trim();
      if (input.length > 12) {
        input = input.substring(0, 11);
      }
      if (!Misc.isValidName(input)) {
        player.getPacketSender().sendMessage("Invalid syntax entered. Please set a valid name.");
        return;
      }
      ClanChatManager.setName(player, input);
    },
  });
  player
    .getPacketSender()
    .sendEnterInputPrompt("What should your clanchat channel's name be?");
}

function allowChat(player, text) {
  if (!text || text.length === 0) {
    return false;
  }
  if (
    PlayerPunishment.muted(player.getUsername()) ||
    PlayerPunishment.IPMuted(player.getHostAddress())
  ) {
    player.getPacketSender().sendMessage("You are muted and cannot chat.");
    return false;
  }
  if (Misc.blockedWord(text)) {
    player.getPacketSender().sendMessage("Your message did not make it past the filter.");
    return false;
  }
  return true;
}

const clanChatPacketListener = {
  execute(player, packet) {
    if (!player || player.getHitpoints?.() <= 0) {
      return;
    }

    const clanMessage = packet.readString?.();
    if (!allowChat(player, clanMessage)) {
      return;
    }

    ClanChatManager.sendMessage(player, clanMessage);
  },
};

function handleClanChatButton(player, buttonId, menuId = 0) {
  if (!player || !Number.isInteger(buttonId)) {
    return false;
  }

  try {
    switch (buttonId) {
      case CLAN_CHAT_SETUP_BUTTON:
        if (player.busy?.()) {
          player.getPacketSender()?.sendInterfaceRemoval?.();
        }
        ClanChatManager.clanChatSetupInterface(player);
        return true;
      case CLAN_CHAT_JOIN_LEAVE_BUTTON:
        if (player.getCurrentClanChat?.() == null) {
          promptJoinClanChat(player);
        } else {
          ClanChatManager.leave(player, false);
          player.setClanChatName?.("");
        }
        return true;
      case CLAN_CHAT_NAME_BUTTON:
        if (player.getInterfaceId?.() === CLAN_CHAT_SETUP_INTERFACE_ID) {
          if (menuId === 1) {
            ClanChatManager.delete(player);
          } else {
            promptRenameClanChat(player);
          }
          return true;
        }
        break;
      default:
        break;
    }

    return ClanChatManager.handleButton(player, buttonId, menuId) === true;
  } catch (err) {
    console.error("[plugin:ClanChat] button handling failed", {
      buttonId,
      menuId,
      username: player?.getUsername?.(),
      error: String(err?.message ?? err),
    });
    return false;
  }
}

module.exports = {
  ClanChat,
  ClanChatManager,
  ClanChatRank,
  BannedMember,
  name: "ClanChat",
  register(api) {
    api.onServerStartup(() => {
      ClanChatManager.init();
    });

    api.onServerShutdown(() => {
      ClanChatManager.save();
    });

    api.onPlayerLogin(({ player }) => {
      ClanChatManager.onLogin(player);
    });

    api.onPlayerLogout(({ player }) => {
      ClanChatManager.leave(player, false);
    });

    api.onCanAttack((event) => {
      if (event.allow !== null) {
        return;
      }
      const { attacker, target } = event;
      if (!areClanFriendlyFireTargets(attacker, target)) {
        return;
      }
      attacker
        ?.getPacketSender?.()
        ?.sendMessage?.("You cannot attack a player who is in your clan chat.");
      event.allow = false;
    });

    const syncClanRankState = ({ player, other }) => {
      const clan = ClanChatManager.getClanChat(player);
      ClanChatManager.updateRank(clan, other);
      if (player.getInterfaceId?.() === CLAN_CHAT_SETUP_INTERFACE_ID) {
        ClanChatManager.clanChatSetupInterface(player);
      }
    };

    api.onFriendAdd(syncClanRankState);
    api.onFriendRemove(syncClanRankState);

    api.onButton(CLAN_CHAT_BUTTON_IDS, ({ player, buttonId, handled }) => {
      if (!handled) {
        handleClanChatButton(player, Number(buttonId), 0);
      }
    });

    api.onInterfaceActionButton(
      CLAN_CHAT_BUTTON_IDS,
      ({ player, buttonId, action, handled }) => {
        if (!handled) {
          handleClanChatButton(player, Number(buttonId), Number(action) || 0);
        }
      }
    );

    api.registerPacketListener(PacketConstants.CLAN_CHAT_OPCODE, clanChatPacketListener);
  },
};
