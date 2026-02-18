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

  handleEstablishedPacket({ opcode, packet, player }, nowMs = Date.now()) {
    if (opcode !== PacketConstants.FOLLOW_PLAYER_OPCODE || !packet || !player) {
      return;
    }

    const payload = packet.getBuffer?.();
    if (!payload || payload.length < 2) {
      return;
    }
    const followPacket = new Packet(opcode, payload);
    const targetIndex = followPacket.readLEShort();
    if (targetIndex < 1) {
      return;
    }
    const followed = World.getPlayers().get(targetIndex);
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
    if (state.mode !== this.behaviorMode.ROAMING) {
      followed?.sendChat?.("Sorry, busy rn.");
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
  }
}

module.exports = {
  FollowBackTrigger,
};
