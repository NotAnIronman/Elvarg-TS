const { World } = require("../../../src/main/typescript/elvarg/game/World");
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
  api.registerPacketListener(PacketConstants.PLAYER_OPTION_1_OPCODE, {
    execute: (player, packet) => {
      const payload = packet?.getBuffer?.();
      const targetIndex =
        payload && payload.length >= 2 ? payload.readUInt16BE(0) : Number.NaN;

      if (!Number.isInteger(targetIndex)) {
        corePlayerOptionListener.execute(player, packet);
        return;
      }

      const target = World.getPlayers().get(targetIndex);
      if (!target?.isPlayerBot?.()) {
        corePlayerOptionListener.execute(player, packet);
        return;
      }

      botStatusReporter.sendStatus(player, target);
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
