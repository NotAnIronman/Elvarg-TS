const { World } = require("../../../src/main/typescript/elvarg/game/World");
const { Packet } = require("../../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { AreaManager } = require("../../../src/main/typescript/elvarg/game/model/areas/AreaManager");
const {
  CombatFactory,
  CanAttackResponse,
} = require("../../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const {
  ClanChatManager,
} = require("../../interface/ClanChat.plugin");
const {
  ATTR_RECRUIT_OWNER_USERNAME,
  ATTR_RECRUIT_RETURN_AFTER_DEATH_AT,
  ATTR_BOT_PVP_PROFILE_ID,
  getRecruitReturnDelayMs,
} = require("./BotRecruitConstants");
const {
  setModePvp,
} = require("../behaviours/state/PlayerBotState");
const {
  armRecruitFollowBack,
  recallRecruitedBot,
} = require("./BotRecruitRuntime");
const {
  clearBotDeathLootPlan,
  handleBotDeathItemDrop,
} = require("./BotDeathLoot");

const CLAN_ASSIST_DURATION_MS = 30000;

function resolveAttackedPlayer(packet) {
  const payload = packet?.getBuffer?.();
  const opcode = packet?.getOpcode?.();
  if (!payload || payload.length < 2 || opcode !== PacketConstants.ATTACK_PLAYER_OPCODE) {
    return null;
  }
  const parsed = new Packet(opcode, payload);
  const targetIndex = parsed.readLEShort();
  if (targetIndex < 0) {
    return null;
  }
  return World.getPlayers().get(targetIndex) ?? null;
}

function isActiveClanRecruit(owner, bot) {
  if (!owner || !bot || owner.isPlayerBot?.() === true || bot.isPlayerBot?.() !== true) {
    return false;
  }
  if (owner.isRegistered?.() !== true || bot.isRegistered?.() !== true) {
    return false;
  }
  if ((owner.getHitpoints?.() ?? 0) <= 0 || (bot.getHitpoints?.() ?? 0) <= 0) {
    return false;
  }
  if (owner.getPrivateArea?.() !== bot.getPrivateArea?.()) {
    return false;
  }
  const ownerClan = ClanChatManager.getClanChat(owner);
  return ownerClan != null && bot.getCurrentClanChat?.() === ownerClan;
}

function canStartPlayerAttack(attacker, target) {
  if (!attacker || !target) {
    return false;
  }
  const combatMethod = CombatFactory.getMethod(attacker);
  return (
    CombatFactory.canAttack(attacker, combatMethod, target) ===
    CanAttackResponse.CAN_ATTACK
  );
}

function sharesClanChat(left, right) {
  if (!left || !right || left === right) {
    return false;
  }
  const leftClan = left.getCurrentClanChat?.();
  const rightClan = right.getCurrentClanChat?.();
  return leftClan != null && leftClan === rightClan;
}

function handleClanRecruitAssist({ runtime, behaviorMode, player, packet, nowMs }) {
  if (!runtime || !behaviorMode || !player || player.isPlayerBot?.() === true) {
    return;
  }

  const target = resolveAttackedPlayer(packet);
  if (!target || target === player || target.isRegistered?.() !== true) {
    return;
  }
  if (!canStartPlayerAttack(player, target)) {
    return;
  }
  if (sharesClanChat(player, target)) {
    return;
  }

  const ownerClan = ClanChatManager.getClanChat(player);
  if (!ownerClan) {
    return;
  }

  let warnedSingle = false;
  for (const [botUsername, entry] of runtime.entriesByUsername ?? []) {
    const bot = entry?.player;
    const state = entry?.state;
    if (!bot || !state) {
      continue;
    }
    if (bot.getAttribute?.(ATTR_RECRUIT_OWNER_USERNAME) !== player.getUsername?.()) {
      continue;
    }
    if (!isActiveClanRecruit(player, bot)) {
      continue;
    }

    if (!AreaManager.inMulti(player) || !AreaManager.inMulti(bot) || !AreaManager.inMulti(target)) {
      if (!warnedSingle) {
        bot.forceChat?.("Sorry, not in multi- cant help");
        warnedSingle = true;
      }
      continue;
    }

    setModePvp(
      bot,
      state,
      target,
      nowMs,
      CLAN_ASSIST_DURATION_MS,
      behaviorMode,
      { allowInCombatTransition: true }
    );
    bot.getMovementQueue?.().reset?.();
    bot.getCombat?.().attack?.(target);
  }
}

function recallClanRecruitsOnOwnerDefeat({ runtime, behaviorMode, owner, nowMs }) {
  if (!runtime || !behaviorMode || !owner || owner.isPlayerBot?.() === true) {
    return;
  }
  for (const [, entry] of runtime.entriesByUsername ?? []) {
    const bot = entry?.player;
    const state = entry?.state;
    if (!bot || !state) {
      continue;
    }
    if (bot.getAttribute?.(ATTR_RECRUIT_OWNER_USERNAME) !== owner.getUsername?.()) {
      continue;
    }

    bot.getCombat?.().reset?.();
    bot.getCombat?.().setUnderAttack?.(null);
    bot.setCombatFollowing?.(null);
    bot.getMovementQueue?.().reset?.();

    armRecruitFollowBack(state, behaviorMode);
    recallRecruitedBot(
      bot,
      owner,
      state,
      behaviorMode,
      CLAN_ASSIST_DURATION_MS,
      nowMs
    );
  }
}

function registerBotEvents(options) {
  const {
    api,
    botApi,
    runtime,
    behaviorMode,
    playerPersistence,
    manualControlPacketOpcodes,
    followBackTrigger,
    combatReactionTrigger,
    pathBlockedHandler,
    npcAggroPolicyHandler,
    avengeOpponentPolicy,
    pvpJumpOnKillPolicy,
  } = options;

  api.onPlayerDisconnect(({ player, username }) => {
    if (player && player.isPlayerBot?.()) {
      try {
        playerPersistence.save(player);
      } catch (err) {
        botApi.log("bot_persistence_save_failed_disconnect", {
          username,
          error: String(err?.message ?? err),
        });
      }
    }
    const removed = runtime.handleDisconnect(player, username);
    if (removed) {
      botApi.log("botme_auto_disabled_disconnect", { username });
    }
  });

  api.onPlayerDeathItemDrop((event) => {
    handleBotDeathItemDrop(event, runtime);
  });

  api.onEstablishedPacket((event) => {
    const nowMs = Date.now();
    handleClanRecruitAssist({
      runtime,
      behaviorMode,
      player: event?.player,
      packet: event?.packet,
      nowMs,
    });
    followBackTrigger.handleEstablishedPacket(event, nowMs);
    combatReactionTrigger.handleEstablishedPacket(event, nowMs);

    const { opcode, player } = event;
    if (!manualControlPacketOpcodes.has(opcode)) {
      return;
    }

    const username = player.getUsername?.();
    if (!username || !runtime.botmeUsernames.has(username)) {
      return;
    }

    const disabled = runtime.disableControllerForPlayer(player);
    if (!disabled) {
      return;
    }
    player
      .getPacketSender()
      .sendMessage("botme auto-disabled due to manual input.");
    botApi.log("botme_auto_disabled_manual_input", { username, opcode });
  });

  api.onPlayerPathBlocked((event) => {
    const username = event?.username;
    if (!username || !runtime.playerBotUsernames.has(username)) {
      return;
    }
    pathBlockedHandler.handle(event, Date.now());
  });

  if (npcAggroPolicyHandler) {
    api.onCanAttack((event) => {
      npcAggroPolicyHandler.handleCanAttack(event);
    });
  }

  if (avengeOpponentPolicy) {
    api.onPlayerDefeated((event) => {
      const victim = event?.victim;
      if (victim?.isPlayerBot?.() === true) {
        const recruitOwnerUsername = victim.getAttribute?.(ATTR_RECRUIT_OWNER_USERNAME);
        if (recruitOwnerUsername) {
          const profileId =
            victim.getAttribute?.(ATTR_BOT_PVP_PROFILE_ID) ??
            runtime?.entriesByUsername?.get?.(victim.getUsername?.())?.state?.pvp?.profileId ??
            "standard";
          victim.setAttribute?.(
            ATTR_RECRUIT_RETURN_AFTER_DEATH_AT,
            Date.now() + getRecruitReturnDelayMs(profileId)
          );
        }
      }
      avengeOpponentPolicy.handle({
        killer: event?.killer,
        victim: event?.victim,
        nowMs: Date.now(),
      });
    });
  }

  api.onPlayerDefeated((event) => {
    clearBotDeathLootPlan(event?.victim);
    recallClanRecruitsOnOwnerDefeat({
      runtime,
      behaviorMode,
      owner: event?.victim,
      nowMs: Date.now(),
    });
  });

  api.onPlayerDefeated((event) => {
    const killer = event?.killer;
    const victim = event?.victim;
    if (killer?.isPlayerBot?.() !== true || victim?.isPlayerBot?.() !== true) {
      return;
    }
    const killerUsername = killer.getUsername?.();
    const killerEntry = killerUsername ? runtime?.entriesByUsername?.get?.(killerUsername) : null;
    const killerState = killerEntry?.state ?? runtime?.botStatesByName?.get?.(killerUsername);
    if (!killerState?.pvp) {
      return;
    }
    killerState.pvp.replenishAfterKillPending = true;
  });

  if (pvpJumpOnKillPolicy) {
    api.onPlayerDefeated((event) => {
      pvpJumpOnKillPolicy.handle({
        killer: event?.killer,
        victim: event?.victim,
        nowMs: Date.now(),
      });
    });
  }
}

module.exports = {
  registerBotEvents,
};
