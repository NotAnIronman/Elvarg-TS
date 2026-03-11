const { World } = require("../../src/main/typescript/elvarg/game/World");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { PluginManager } = require("../../src/main/typescript/elvarg/plugins/PluginManager");

function readUsername(packet) {
  if (!packet || packet.getSize() < 8) {
    return null;
  }
  const username = packet.readLongBigInt ? packet.readLongBigInt() : BigInt(packet.readLong());
  if (typeof username !== "bigint" || username <= 0n) {
    return null;
  }
  return username;
}

function resolvePmTarget(usernameLong) {
  const formatted = Misc.formatText(Misc.longToString(usernameLong)).replace(/_/g, " ");
  return World.getPlayerByName(formatted);
}

const friendPacketListener = {
  execute(player, packet) {
    try {
      const username = readUsername(packet);
      if (username == null) {
        return;
      }

      switch (packet.getOpcode()) {
        case PacketConstants.ADD_FRIEND_OPCODE:
          player.getRelations().addFriend(username);
          {
            const other = World.getPlayerByName(Misc.formatName(Misc.longToString(username)));
            if (other) {
              PluginManager.emitFriendAdd({ player, other });
            }
          }
          return;
        case PacketConstants.REMOVE_FRIEND_OPCODE:
          player.getRelations().deleteFriend(username);
          {
            const other = World.getPlayerByName(Misc.formatName(Misc.longToString(username)));
            if (other) {
              PluginManager.emitFriendRemove({ player, other });
            }
          }
          return;
        case PacketConstants.SEND_PM_OPCODE: {
          const size = packet.getSize();
          const message = packet.readBytes(size);
          const target = resolvePmTarget(username);
          if (target) {
            player.getRelations().message(target, new Uint8Array(message), size);
          } else {
            player.getPacketSender().sendMessage("That player is offline.");
          }
          return;
        }
        default:
          return;
      }
    } catch (err) {
      console.error("[plugin:FriendsList] packet handling failed", err);
    }
  },
};

module.exports = {
  name: "FriendsList",
  register(api) {
    api.onPlayerLogin(({ player }) => {
      const relations = player?.getRelations?.();
      const sender = player?.getPacketSender?.();
      if (!relations) {
        return;
      }
      relations.setPrivateMessageId?.(1);
      relations.onLogin?.(player);
      sender?.sendFriendStatus?.(2);
      relations.updateLists?.(true);
    });

    api.registerAlivePacketListener(PacketConstants.ADD_FRIEND_OPCODE, friendPacketListener);
    api.registerAlivePacketListener(PacketConstants.REMOVE_FRIEND_OPCODE, friendPacketListener);
    api.registerAlivePacketListener(PacketConstants.SEND_PM_OPCODE, friendPacketListener);
  },
};
