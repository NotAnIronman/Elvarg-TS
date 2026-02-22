const { Bank } = require("../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { Packet } = require("../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { ItemContainerActionPacketListener } = require("../../src/main/typescript/elvarg/net/packet/impl/ItemContainerActionPacketListener");
const { ButtonClickPacketListener } = require("../../src/main/typescript/elvarg/net/packet/impl/ButtonClickPacketListener");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const IFACE = 4465;
const CONTAINER = 7423;
const SIDEBAR = 192;

const BTN_DEPOSIT = new Set([50004, 50007]);
const BTN_CLOSE = new Set([5384, 50001]);

const DEPOSIT_OPCODES = [
  PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE,
];

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

const itemContainerFallback = new ItemContainerActionPacketListener();
const buttonFallback = new ButtonClickPacketListener();

function refresh(player) {
  const sender = player?.getPacketSender?.();
  if (!sender) return;
  sender.clearItemOnInterface(CONTAINER);
  sender.sendItemContainer(player.getInventory(), CONTAINER);
  sender.sendInterfaceSet(IFACE, SIDEBAR);
}

function open(player) {
  const sender = player?.getPacketSender?.();
  if (!sender) return;
  sender.sendInterface(IFACE);
  refresh(player);
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

function decodeDepositAction(opcode, payload) {
  const p = new Packet(opcode, payload);
  switch (opcode) {
    case PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE:
      return { iface: p.readInt(), slot: p.readShortA(), itemId: p.readShortA(), amount: 1 };
    case PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE:
      return { iface: p.readInt(), itemId: p.readLEShortA(), slot: p.readLEShort(), amount: 5 };
    case PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE:
      return { iface: p.readInt(), itemId: p.readShortA(), slot: p.readShortA(), amount: 10 };
    case PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE:
      return { slot: p.readShortA(), iface: p.readInt(), itemId: p.readShortA(), amount: Number.MAX_SAFE_INTEGER };
    case PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE:
      return { iface: p.readInt(), slot: p.readLEShort(), itemId: p.readLEShort(), amount: null };
    default:
      return null;
  }
}

function handleDepositContainerAction(player, opcode, payload) {
  const decoded = decodeDepositAction(opcode, payload);
  if (!decoded || decoded.iface !== CONTAINER) return false;

  if (decoded.amount == null) {
    player.setEnteredAmountAction({
      execute: (amount) => deposit(player, decoded.slot, decoded.itemId, amount),
    });
    player.getPacketSender().sendEnterAmountPrompt("How many would you like to deposit?");
    return true;
  }

  deposit(player, decoded.slot, decoded.itemId, decoded.amount);
  return true;
}

function handleDepositButton(player, payload) {
  if (!player || player.getInterfaceId?.() !== IFACE) return false;

  const button = new Packet(PacketConstants.BUTTON_CLICK_OPCODE, payload).readInt();
  if (BTN_DEPOSIT.has(button)) {
    Bank.depositItems(player, player.getInventory(), true);
    refresh(player);
    return true;
  }
  if (BTN_CLOSE.has(button)) {
    player.getPacketSender().sendInterfaceRemoval();
    return true;
  }
  return false;
}

function isDepositBooth(event) {
  if (DEPOSIT_BOX_IDS.includes(event?.objectId)) return true;
  const name = event?.object?.getDefinition?.()?.name;
  return typeof name === "string" && name.trim().toLowerCase() === "bank deposit box";
}

module.exports = {
  name: "BankDepositBooth",
  register(api) {
    api.onObjectFirstClick(DEPOSIT_BOX_IDS, (event) => {
      if (!isDepositBooth(event)) return;
      open(event.player);
      event.handled = true;
    });

    const onContainer = {
      execute(player, packet) {
        const opcode = packet.getOpcode();
        const payload = packet.getBuffer();
        if (handleDepositContainerAction(player, opcode, payload)) return;
        itemContainerFallback.execute(player, new Packet(opcode, payload));
      },
    };

    for (const opcode of DEPOSIT_OPCODES) {
      api.registerAlivePacketListener(opcode, onContainer);
    }

    api.registerAlivePacketListener(PacketConstants.BUTTON_CLICK_OPCODE, {
      execute(player, packet) {
        const payload = packet.getBuffer();
        if (handleDepositButton(player, payload)) return;
        buttonFallback.execute(player, new Packet(PacketConstants.BUTTON_CLICK_OPCODE, payload));
      },
    });
  },
};
