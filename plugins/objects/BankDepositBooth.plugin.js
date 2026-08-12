const { Bank } = require("../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
let pluginApi;
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

// OpenRune cache names: interface.bank_depositbox and its inventory controls.
const IFACE = 192;
const CONTAINER = (IFACE << 16) | 24; // component.bank_depositbox:inventory
const BTN_DEPOSIT = new Set([
  (IFACE << 16) | 31, // component.bank_depositbox:deposit_inv
  (IFACE << 16) | 30, // component.bank_depositbox:deposit_worn
]);
// Deposit quantity per right-click option on a container item, matching
// OSRS's Deposit-1/5/10/All/X convention. clickType 5 (X) prompts for a
// custom amount instead of having a fixed one.
const DEPOSIT_AMOUNT_BY_CLICK_TYPE = { 1: 1, 2: 5, 3: 10, 4: Number.MAX_SAFE_INTEGER };

const DEPOSIT_BOX_IDS = [
  ObjectIds.BANK_DEPOSIT_BOX,
  ObjectIds.BANK_DEPOSIT_BOX_2,
  ObjectIds.BANK_DEPOSIT_BOX_3,
  ObjectIds.BANK_DEPOSIT_BOX_4,
  ObjectIds.BANK_DEPOSIT_BOX_5,
  ObjectIds.BANK_DEPOSIT_BOX_6,
  ObjectIds.BANK_DEPOSIT_BOX_7,
  ObjectIds.BANK_DEPOSIT_BOX_8,
  ObjectIds.BANK_DEPOSIT_BOX_9,
  ObjectIds.DOOR_223,
].filter((id) => Number.isInteger(id));

function refresh(player) {
  const sender = player?.getPacketSender?.();
  if (!sender) return;
  sender.clearItemOnInterface(CONTAINER);
  sender.sendItemContainer(player.getInventory(), CONTAINER);
}

function open(player) {
  const sender = player?.getPacketSender?.();
  if (!sender) return;
  sender.sendInterface(IFACE);
  refresh(player);
  Sounds.sendSound(player, Sound.CONTAINER_OPEN);
}

function deposit(player, slot, itemId, amount) {
  const inv = player?.getInventory?.();
  const slotItem = inv?.forSlot?.(slot);
  if (!inv || !slotItem || slotItem.getId() !== itemId) return;

  const max = inv.getAmount(itemId);
  const finalAmount = Math.max(0, Math.min(amount, max));
  if (finalAmount <= 0) return;

  Bank.deposits(player, itemId, slot, finalAmount);
  refresh(player);
}

// interfaceId/itemId/slot/clickType are already decoded for us here - the
// live ItemActionPacketListener.handleAction (called from NetworkBuilder.ts
// for every inventory/container item click) parses the packet once and
// fires pluginApi.emitItemAction with the result, for every clickType
// (1 through 5) uniformly. Filtering on interfaceId === CONTAINER is the
// same scoping the old raw-opcode iface check used to do.
function handleDepositContainerAction(player, interfaceId, itemId, slot, clickType) {
  if (interfaceId !== CONTAINER) return false;
  if (pluginApi.emitCanBank(player) === false) {
    return true;
  }

  const amount = DEPOSIT_AMOUNT_BY_CLICK_TYPE[clickType];
  if (amount === undefined) {
    player.setEnteredAmountAction({
      execute: (entered) => deposit(player, slot, itemId, entered),
    });
    player.getPacketSender().sendEnterAmountPrompt("How many would you like to deposit?");
    return true;
  }

  deposit(player, slot, itemId, amount);
  return true;
}

function handleDepositButton(player, button) {
  if (!player || player.getInterfaceId?.() !== IFACE) return false;
  if (pluginApi.emitCanBank(player) === false) {
    return true;
  }
  if (BTN_DEPOSIT.has(button)) {
    Bank.depositItems(
      player,
      button === ((IFACE << 16) | 30)
        ? player.getEquipment()
        : player.getInventory(),
      true
    );
    refresh(player);
    return true;
  }
  return false;
}

function isDepositBooth(event) {
  if (DEPOSIT_BOX_IDS.includes(event.objectId)) return true;
  const name = event.object?.getDefinition?.()?.name;
  return typeof name === "string" && name.trim().toLowerCase() === "bank deposit box";
}

module.exports = {
  name: "BankDepositBooth",
  register(api) {
    pluginApi = api;
    api.onObjectFirstClick(DEPOSIT_BOX_IDS, (event) => {
      if (!isDepositBooth(event)) return;
      if (pluginApi.emitCanBank(event.player) === false) {
        event.handled = true;
        return;
      }
      open(event.player);
      event.handled = true;
    });

    api.onItemAction((event) => {
      if (handleDepositContainerAction(event.player, event.interfaceId, event.itemId, event.slot, event.clickType)) {
        event.handled = true;
      }
    });

    api.onInterfaceActionButton([...BTN_DEPOSIT], (event) => {
      if (handleDepositButton(event.player, event.buttonId)) {
        return true;
      }
      return false;
    });
  },
};
