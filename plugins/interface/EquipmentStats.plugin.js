const { BonusManager } = require("../../src/main/typescript/elvarg/game/model/equipment/BonusManager");

const OPEN_EQUIPMENT_STATS_BUTTON = 27653;

function openEquipmentStats(player) {
  // Java parity: close modal/blocking interfaces before opening equipment stats.
  if (player.busy?.()) {
    player.getPacketSender().sendInterfaceRemoval();
  }

  BonusManager.open(player);
  return true;
}

module.exports = {
  name: "EquipmentStats",
  register(api) {
    api.onButton(OPEN_EQUIPMENT_STATS_BUTTON, ({ player }) =>
      openEquipmentStats(player)
    );
  },
};
