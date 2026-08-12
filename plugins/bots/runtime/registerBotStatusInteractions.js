const {
  ClanChatManager,
  ClanChat,
  ClanChatRank,
} = require("../../interface/ClanChat.plugin");
const {
  ATTR_RECRUIT_OWNER_USERNAME,
} = require("./BotRecruitConstants");
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

  // NOTE: the "Status" right-click option (slot 1) and the follow/diagnose
  // logging on option slots 2/3 are not currently wired to anything live -
  // the client protocol hardcodes option 1 as Attack with no room for a
  // per-target relabeled action, so clicking "Status" today just attacks.
  // Fixing that needs a broader change to how custom interaction options
  // are represented, out of scope here. The finalized-map-region-triggered
  // resync is dropped too since it's redundant with the onPlayerProcess
  // resync below (every process tick already re-syncs when needed).
  //
  // Recruit (via trade request) is the one piece with real gameplay value
  // that's cleanly re-wireable: trade-request already cleanly maps to a
  // single well-defined event via PluginManager's onTradeRequest hook.
  api.onTradeRequest((event) => {
    const { player, target } = event;
    if (target?.isPlayerBot?.() !== true || !shouldShowRecruitOption(player)) {
      return;
    }
    // Aliveness/registration/range are already validated by
    // TradeRequestPacketListener.request() before this hook fires.
    event.handled = true;
    recruitBot(player, target);
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
