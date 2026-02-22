const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");

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

const ignorePacketListener = {
  execute(player, packet) {
    try {
      const username = readUsername(packet);
      if (username == null) {
        return;
      }

      switch (packet.getOpcode()) {
        case PacketConstants.ADD_IGNORE_OPCODE:
          player.getRelations().addIgnore(username);
          return;
        case PacketConstants.REMOVE_IGNORE_OPCODE:
          player.getRelations().deleteIgnore(username);
          return;
        default:
          return;
      }
    } catch (err) {
      console.error("[plugin:IgnoreList] packet handling failed", err);
    }
  },
};

module.exports = {
  name: "IgnoreList",
  register(api) {
    api.registerAlivePacketListener(PacketConstants.ADD_IGNORE_OPCODE, ignorePacketListener);
    api.registerAlivePacketListener(PacketConstants.REMOVE_IGNORE_OPCODE, ignorePacketListener);
  },
};
