const { World } = require("../../../src/main/typescript/elvarg/game/World");
const { Packet } = require("../../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../../src/main/typescript/elvarg/net/packet/PacketConstants");
const {
  PlayerOptionPacketListener,
} = require("../../../src/main/typescript/elvarg/net/packet/impl/PlayerOptionPacketListener");

function registerBotStatusInteractions(options = {}) {
  const {
    api,
    botStatusReporter,
    statusOptionLabel = "Status",
    statusInteractionSlot = 1,
  } = options;
  if (!api || !botStatusReporter) {
    return;
  }

  const corePlayerOptionListener = new PlayerOptionPacketListener();
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
      default:
        return null;
    }
    if (!Number.isInteger(targetIndex)) {
      return null;
    }
    return World.getPlayers().get(targetIndex);
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

  api.onPlayerLogin(({ player }) => {
    if (player?.isPlayerBot?.()) {
      return;
    }
    player
      ?.getPacketSender?.()
      ?.sendInteractionOption?.(statusOptionLabel, statusInteractionSlot, false);
  });
}

module.exports = {
  registerBotStatusInteractions,
};
