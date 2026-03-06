const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Packet } = require("../../../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../../../src/main/typescript/elvarg/net/packet/PacketConstants");
const {
  resolveBankRunResumeMode,
  resetMovementState,
  setModeBankRun,
  setModeFollowBack,
} = require("../state/PlayerBotState");

class CombatReactionTrigger {
  constructor({ botStatesByName, playerBotUsernames, api, options }) {
    this.botStatesByName = botStatesByName;
    this.playerBotUsernames = playerBotUsernames;
    this.api = api;
    this.followBackDurationMs = options.followBackDurationMs;
    this.playerRunAwayChance = Math.max(
      0,
      Math.min(1, Number(options.playerRunAwayChance ?? 0.5))
    );
    this.behaviorMode = options.behaviorMode;
  }

  resolveTargetedPlayer(opcode, packet) {
    const payload = packet?.getBuffer?.();
    if (!payload || payload.length < 2) {
      return null;
    }
    const parsed = new Packet(opcode, payload);
    const targetIndex = parsed.readLEShort();
    if (targetIndex < 0) {
      return null;
    }
    return World.getPlayers().get(targetIndex) ?? null;
  }

  cloneResourceTarget(target) {
    if (
      !target ||
      !Number.isFinite(target.objectId) ||
      !Number.isFinite(target.x) ||
      !Number.isFinite(target.y) ||
      !Number.isFinite(target.z)
    ) {
      return null;
    }
    return {
      objectId: target.objectId,
      x: target.x,
      y: target.y,
      z: target.z,
    };
  }

  startRunAwayBankRun(bot, state, attacker, nowMs) {
    if (!bot || !state) {
      return false;
    }
    if (state.mode === this.behaviorMode.BANK_RUN) {
      return true;
    }

    const location = bot.getLocation?.();
    const returnTo = location
      ? {
          x: location.getX(),
          y: location.getY(),
          z: location.getZ(),
        }
      : null;
    const returnMode = resolveBankRunResumeMode(state, this.behaviorMode);
    const switched = setModeBankRun(bot, state, this.behaviorMode, {
      returnMode,
      returnTo,
      resumeWoodcuttingTarget: this.cloneResourceTarget(state?.woodcutting?.target),
      resumeMiningTarget: this.cloneResourceTarget(state?.mining?.target),
      suppressAutoRetaliate: true,
    });
    if (!switched) {
      return false;
    }

    const combat = bot.getCombat?.();
    combat?.reset?.();
    resetMovementState(bot);
    bot.setFollowing?.(null);
    bot.setMobileInteraction?.(null);
    bot.setPositionToFace?.(null);
    state.bankRun.nextActionAt = nowMs;
    this.api.log("bot_mode_switch", {
      username: bot.getUsername?.(),
      mode: this.behaviorMode.BANK_RUN,
      reason: "attacked_by_player_flee_bank_run",
      returnMode,
    });
    this.api.log("bot_run_away_started_by_attack", {
      bot: bot.getUsername?.(),
      attacker: attacker?.getUsername?.() ?? null,
      returnMode,
    });
    return true;
  }

  handleEstablishedPacket({ opcode, packet, player }, nowMs = Date.now()) {
    if (opcode !== PacketConstants.ATTACK_PLAYER_OPCODE || !packet || !player) {
      return;
    }

    const followed = this.resolveTargetedPlayer(opcode, packet);
    const followedUsername = followed?.getUsername?.();
    if (
      !followed ||
      followed === player ||
      !followedUsername ||
      !this.playerBotUsernames.has(followedUsername) ||
      !followed.isRegistered()
    ) {
      return;
    }

    const state = this.botStatesByName.get(followedUsername);
    if (!state) {
      return;
    }

    const attackerIsPlayerBot = player.isPlayerBot?.() === true;
    if (
      !attackerIsPlayerBot &&
      Math.random() < this.playerRunAwayChance &&
      this.startRunAwayBankRun(followed, state, player, nowMs)
    ) {
      return;
    }

    if (
      !setModeFollowBack(
        followed,
        state,
        player,
        nowMs,
        this.followBackDurationMs,
        this.behaviorMode
      )
    ) {
      return;
    }

    const botCombat = followed.getCombat?.();
    if (botCombat && followed.getHitpoints?.() > 0 && player.getHitpoints?.() > 0) {
      const alreadyTargetingAttacker = botCombat.getTarget?.() === player;
      if (attackerIsPlayerBot && !alreadyTargetingAttacker) {
        followed.getMovementQueue?.().reset?.();
        botCombat.attack(player);
      } else if (!attackerIsPlayerBot) {
        // Avoid pre-emptive attack on raw ATTACK_PLAYER packet against real
        // players so bots are not treated as initiators and incorrectly skulled.
        const alreadyUnderAttackByPlayer = botCombat.getAttacker?.() === player;
        const alreadyHasDamageFromPlayer = botCombat.damageMapContains?.(player) === true;
        if (
          (alreadyUnderAttackByPlayer || alreadyHasDamageFromPlayer) &&
          !alreadyTargetingAttacker
        ) {
          followed.getMovementQueue?.().reset?.();
          botCombat.attack(player);
        }
      }
    }

    this.api.log("follow_back_started_by_attack", {
      bot: followedUsername,
      attacker: player.getUsername?.() ?? null,
      attackerIsPlayerBot,
      durationMs: this.followBackDurationMs,
    });
  }
}

module.exports = {
  CombatReactionTrigger,
};
