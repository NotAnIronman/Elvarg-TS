const { World } = require("../../../src/main/typescript/elvarg/game/World");
const { Packet } = require("../../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../../src/main/typescript/elvarg/net/packet/PacketConstants");
const {
  FinalizedMapRegionChangePacketListener,
} = require("../../../src/main/typescript/elvarg/net/packet/impl/FinalizedMapRegionChangePacketListener");
const {
  TradeRequestPacketListener,
} = require("../../../src/main/typescript/elvarg/net/packet/impl/TradeRequestPacketListener");
const {
  ClanChatManager,
  ClanChat,
  ClanChatRank,
} = require("../../interface/ClanChat.plugin");
const {
  ATTR_RECRUIT_OWNER_USERNAME,
} = require("./BotRecruitConstants");
const {
  PlayerOptionPacketListener,
} = require("../../../src/main/typescript/elvarg/net/packet/impl/PlayerOptionPacketListener");
const {
  PlayerRights,
} = require("../../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const {
  recallRecruitedBot,
} = require("./BotRecruitRuntime");

const ATTR_RECRUIT_OPTION_VISIBLE = "botRecruitOptionVisible";

function registerBotStatusInteractions(options = {}) {
  const {
    api,
    botStatusReporter,
    statusOptionLabel = "Status",
    statusInteractionSlot = 1,
    recruitOptionLabel = "Recruit",
    recruitInteractionSlot = 5,
    runtime = null,
    behaviorMode = null,
  } = options;
  if (!api || !botStatusReporter) {
    return;
  }

  const corePlayerOptionListener = new PlayerOptionPacketListener();
  const coreTradeRequestListener = new TradeRequestPacketListener();
  const coreFinalizedMapRegionChangeListener =
    new FinalizedMapRegionChangePacketListener();
  const clonePacket = (packet) => {
    if (!packet?.getOpcode || !packet?.getBuffer) {
      return null;
    }
    const opcode = packet.getOpcode();
    const buffer = packet.getBuffer();
    if (!Number.isInteger(opcode) || !Buffer.isBuffer(buffer)) {
      return null;
    }
    return new Packet(opcode, Buffer.from(buffer));
  };

  const resolveTargetFromPacket = (packet) => {
    const probe = clonePacket(packet);
    if (!probe) {
      return null;
    }
    const opcode = probe.getOpcode();
    let targetIndex = Number.NaN;
    switch (opcode) {
      case PacketConstants.PLAYER_OPTION_1_OPCODE:
      case PacketConstants.PLAYER_OPTION_2_OPCODE:
        targetIndex = probe.readShort() & 0xffff;
        break;
      case PacketConstants.PLAYER_OPTION_3_OPCODE:
        targetIndex = probe.readLEShortA() & 0xffff;
        break;
      case PacketConstants.TRADE_REQUEST_OPCODE:
        targetIndex = probe.readLEShort() & 0xffff;
        break;
      default:
        return null;
    }
    if (!Number.isInteger(targetIndex)) {
      return null;
    }
    return World.getPlayers().get(targetIndex);
  };

  const getOwnedClan = (player) => ClanChatManager.getClanChat(player);
  const signalClanBotsToFollowOwner = (owner) => {
    const clan = getOwnedClan(owner);
    if (!clan || !runtime || !behaviorMode) {
      return;
    }
    for (const member of clan.getMembers?.() ?? []) {
      if (!member || member === owner || member.isPlayerBot?.() !== true) {
        continue;
      }
      if (member.isRegistered?.() !== true) {
        continue;
      }
      const botUsername = member.getUsername?.();
      const botState = botUsername
        ? runtime.botStatesByName?.get?.(botUsername) ??
          runtime.entriesByUsername?.get?.(botUsername)?.state
        : null;
      if (!botState) {
        member.setAttribute?.(ATTR_RECRUIT_OWNER_USERNAME, owner.getUsername?.() ?? null);
        member.setFollowing?.(owner);
        member.setMobileInteraction?.(owner);
        member.setPositionToFace?.(owner.getLocation?.());
        continue;
      }
      recallRecruitedBot(member, owner, botState, behaviorMode);
    }
  };
  const shouldShowRecruitOption = (player) => player?.isPlayerBot?.() !== true;
  const shouldShowStatusOption = (player) =>
    player?.isPlayerBot?.() !== true && player?.getRights?.() === PlayerRights.DEVELOPER;
  const syncInteractionOptions = (player, force = false) => {
    if (player?.isPlayerBot?.() === true) {
      return;
    }
    const sender = player?.getPacketSender?.();
    if (!sender) {
      return;
    }
    const visible = shouldShowRecruitOption(player);
    if (force || player.getAttribute?.(ATTR_RECRUIT_OPTION_VISIBLE) !== visible) {
      sender.sendInteractionOption?.(
        visible ? recruitOptionLabel : "null",
        recruitInteractionSlot,
        false
      );
      player.setAttribute?.(ATTR_RECRUIT_OPTION_VISIBLE, visible);
    }
    if (force) {
      sender.sendInteractionOption?.(
        shouldShowStatusOption(player) ? statusOptionLabel : "null",
        statusInteractionSlot,
        false
      );
    }
  };
  const recruitBot = (owner, bot) => {
    const clan = getOwnedClan(owner);
    if (!clan) {
      owner.getPacketSender?.().sendMessage?.("You need to set up a clan chat first.");
      return;
    }
    if (owner.getCurrentClanChat?.() !== clan) {
      if (owner.getCurrentClanChat?.() != null) {
        ClanChatManager.leave(owner, false);
      }
      ClanChatManager.join(owner, clan);
    }
    const enterRank =
      clan.getRankRequirement?.()?.[ClanChat.RANK_REQUIRED_TO_ENTER] ??
      ClanChatRank.RECRUIT;
    clan.givePlayerRank?.(bot, enterRank);
    if (bot.getCurrentClanChat?.() !== clan) {
      if (bot.getCurrentClanChat?.() != null) {
        ClanChatManager.leave(bot, false);
      }
      ClanChatManager.join(bot, clan);
    }
    if (bot.getCurrentClanChat?.() !== clan) {
      owner
        .getPacketSender?.()
        .sendMessage?.(`Failed to recruit ${bot.getUsername?.()}.`);
      return;
    }
    const botUsername = bot.getUsername?.();
    const botState = botUsername
      ? runtime?.botStatesByName?.get?.(botUsername) ??
        runtime?.entriesByUsername?.get?.(botUsername)?.state
      : null;
    if (botState && behaviorMode) {
      recallRecruitedBot(bot, owner, botState, behaviorMode);
    } else {
      bot.setAttribute?.(ATTR_RECRUIT_OWNER_USERNAME, owner.getUsername?.() ?? null);
      bot.setFollowing?.(owner);
      bot.setMobileInteraction?.(owner);
      bot.setPositionToFace?.(owner.getLocation?.());
    }
    owner
      .getPacketSender?.()
      .sendMessage?.(`${bot.getUsername?.()} joins your clan chat.`);
  };

  api.registerPacketListener(PacketConstants.PLAYER_OPTION_1_OPCODE, {
    execute: (player, packet) => {
      const target = resolveTargetFromPacket(packet);
      if (!target?.isPlayerBot?.()) {
        corePlayerOptionListener.execute(player, packet);
        return;
      }

      botStatusReporter.sendStatus(player, target);
      botStatusReporter.dumpToDiagnoseLog(player, target, "status_click");
    },
  });

  api.registerPacketListener(PacketConstants.PLAYER_OPTION_2_OPCODE, {
    execute: (player, packet) => {
      const target = resolveTargetFromPacket(packet);
      if (target?.isPlayerBot?.()) {
        botStatusReporter.dumpToDiagnoseLog(player, target, "follow_click");
      }
      corePlayerOptionListener.execute(player, packet);
    },
  });

  api.registerPacketListener(PacketConstants.PLAYER_OPTION_3_OPCODE, {
    execute: (player, packet) => {
      const target = resolveTargetFromPacket(packet);
      if (target?.isPlayerBot?.()) {
        botStatusReporter.dumpToDiagnoseLog(player, target, "follow_click");
      }
      corePlayerOptionListener.execute(player, packet);
    },
  });

  api.registerPacketListener(PacketConstants.TRADE_REQUEST_OPCODE, {
    execute: (player, packet) => {
      const target = resolveTargetFromPacket(packet);
      if (target?.isPlayerBot?.() !== true || !shouldShowRecruitOption(player)) {
        coreTradeRequestListener.execute(player, packet);
        return;
      }

      if (!target.getLocation?.().isWithinDistance?.(player.getLocation?.(), 20)) {
        return;
      }
      if (
        player.getHitpoints?.() <= 0 ||
        target.getHitpoints?.() <= 0 ||
        player.isRegistered?.() !== true ||
        target.isRegistered?.() !== true
      ) {
        return;
      }
      recruitBot(player, target);
    },
  });

  api.registerPacketListener(PacketConstants.FINALIZED_MAP_REGION_OPCODE, {
    execute: (player, packet) => {
      coreFinalizedMapRegionChangeListener.execute(player, packet);
      syncInteractionOptions(player, true);
    },
  });

  api.onPlayerLogin(({ player }) => {
    syncInteractionOptions(player, true);
    signalClanBotsToFollowOwner(player);
  });

  api.onPlayerProcess(({ player }) => {
    syncInteractionOptions(player, false);
  });
}

module.exports = {
  ATTR_RECRUIT_OWNER_USERNAME,
  registerBotStatusInteractions,
};
