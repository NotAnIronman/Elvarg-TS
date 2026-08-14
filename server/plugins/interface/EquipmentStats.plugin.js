
const OPEN_EQUIPMENT_STATS_BUTTON = (387 << 16) | 1; // component.wornitems:equipment

function openEquipmentStats(player) {
  // Java parity: close modal/blocking interfaces before opening equipment stats.
  if (player.busy?.()) {
    player.getPacketSender().sendInterfaceRemoval();
  }

  BonusManager.open(player);
  return true;
}

let BonusManager;

module.exports = {
  name: "EquipmentStats",
  register(api) {
    BonusManager = api.getBonusManager();
    api.onInterfaceActionButton(OPEN_EQUIPMENT_STATS_BUTTON, ({ player }) =>
      openEquipmentStats(player)
    );
  },
};
