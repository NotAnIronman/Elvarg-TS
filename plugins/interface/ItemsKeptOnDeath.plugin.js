const { PluginManager } = require("../../src/main/typescript/elvarg/plugins/PluginManager");
const { PrayerHandler } = require("../../src/main/typescript/elvarg/game/content/PrayerHandler");
const { SkullType } = require("../../src/main/typescript/elvarg/game/model/SkullType");

const OPEN_ITEMS_KEPT_ON_DEATH_BUTTON = 27654;
const ITEMS_KEPT_ON_DEATH_INTERFACE_ID = 17100;
const ITEMS_KEPT_AMOUNT_STRING_ID = 17107;
const ITEMS_KEPT_START_SLOT = 17108;
const ITEMS_KEPT_END_SLOT = 17152;
const ITEMS_KEPT_KEPT_START_SLOT = 17108;
const ITEMS_KEPT_OTHER_START_SLOT = 17112;

function getAmountToKeep(player) {
  if (player.getSkullTimer() > 0 && player.getSkullType() === SkullType.RED_SKULL) {
    return 0;
  }
  return (
    (player.getSkullTimer() > 0 ? 0 : 3) +
    (PrayerHandler.isActivated(player, PrayerHandler.PROTECT_ITEM) ? 1 : 0)
  );
}

function getItemsToKeep(player) {
  const items = [];
  for (const item of [
    ...player.getInventory().getItems(),
    ...player.getEquipment().getItems(),
  ]) {
    if (
      !item ||
      item.getId() <= 0 ||
      item.getAmount() <= 0 ||
      !item.getDefinition().isTradeable()
    ) {
      continue;
    }
    if (PluginManager.emitShouldKeepItemOnDeath(player, item) === false) {
      continue;
    }
    items.push(item);
  }

  items.sort((a, b) => b.getDefinition().getValue() - a.getDefinition().getValue());
  const amountToKeep = getAmountToKeep(player);
  return items.slice(0, amountToKeep);
}

function clearInterfaceData(player) {
  for (let i = ITEMS_KEPT_START_SLOT; i <= ITEMS_KEPT_END_SLOT; i++) {
    player.getPacketSender().clearItemOnInterface(i);
  }
}

function sendInterfaceData(player) {
  player
    .getPacketSender()
    .sendString(String(getAmountToKeep(player)), ITEMS_KEPT_AMOUNT_STRING_ID);

  const toKeep = getItemsToKeep(player);
  for (let i = 0; i < toKeep.length; i++) {
    player
      .getPacketSender()
      .sendItemOnInterface(ITEMS_KEPT_KEPT_START_SLOT + i, toKeep[i].getId(), 0, 1);
  }

  let toSend = ITEMS_KEPT_OTHER_START_SLOT;
  for (const item of [
    ...player.getInventory().getItems(),
    ...player.getEquipment().getItems(),
  ]) {
    if (
      !item ||
      item.getId() <= 0 ||
      item.getAmount() <= 0 ||
      !item.getDefinition().isTradeable() ||
      toKeep.includes(item)
    ) {
      continue;
    }

    player
      .getPacketSender()
      .sendItemOnInterface(toSend, item.getId(), 0, item.getAmount());
    toSend++;
  }
}

function open(player) {
  clearInterfaceData(player);
  sendInterfaceData(player);
  player.getPacketSender().sendInterface(ITEMS_KEPT_ON_DEATH_INTERFACE_ID);
}

module.exports = {
  name: "ItemsKeptOnDeath",
  register(api) {
    api.onButton(OPEN_ITEMS_KEPT_ON_DEATH_BUTTON, ({ player }) => {
      if (player.busy?.()) {
        player.getPacketSender().sendInterfaceRemoval();
      }
      open(player);
      return true;
    });
  },
};
