const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Packet } = require("../../../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { setModeFollowBack } = require("../state/PlayerBotState");

class FollowBackTrigger {
  constructor({ botStatesByName, playerBotUsernames, api, options }) {
    this.botStatesByName = botStatesByName;
    this.playerBotUsernames = playerBotUsernames;
    this.api = api;
    this.followBackDurationMs = options.followBackDurationMs;
    this.behaviorMode = options.behaviorMode;
  }

  formatBehaviorLabel(mode) {
    if (typeof mode !== "string") {
      return "unknown";
    }
    const normalized = mode.trim();
    if (!normalized.length) {
      return "unknown";
    }
    return normalized.replace(/[_-]+/g, " ");
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

  handleEstablishedPacket({ opcode, packet, player }, nowMs = Date.now()) {
    if (
      (opcode !== PacketConstants.FOLLOW_PLAYER_OPCODE &&
        opcode !== PacketConstants.ATTACK_PLAYER_OPCODE) ||
      !packet ||
      !player
    ) {
      return;
    }

    const followed = this.resolveTargetedPlayer(opcode, packet);
    const followedUsername = followed?.getUsername?.();

    if (
      !followed ||
      followed === player ||
      (player.isPlayerBot?.() ?? false) ||
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

    if (opcode === PacketConstants.FOLLOW_PLAYER_OPCODE) {
      if (state.mode !== this.behaviorMode.ROAMING) {
        const behaviorLabel = this.formatBehaviorLabel(state.mode);
        followed?.sendChat?.(`Sorry, busy with: ${behaviorLabel}.`);
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

      this.api.log("follow_back_started", {
        bot: followedUsername,
        follower: player.getUsername?.() ?? null,
        durationMs: this.followBackDurationMs,
      });
      return;
    }

    // Attack packets should immediately pull bots out of roaming and into
    // follow/retaliation state so roaming pathing never competes with combat.
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
    if (
      botCombat &&
      followed.getHitpoints?.() > 0 &&
      player.getHitpoints?.() > 0 &&
      botCombat.getTarget?.() !== player
    ) {
      followed.getMovementQueue?.().reset?.();
      botCombat.attack(player);
    }

    this.api.log("follow_back_started_by_attack", {
      bot: followedUsername,
      attacker: player.getUsername?.() ?? null,
      durationMs: this.followBackDurationMs,
    });
  }
}

module.exports = {
  FollowBackTrigger,
};
