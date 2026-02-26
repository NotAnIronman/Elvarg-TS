const { Packet } = require("../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { Inventory } = require("../../src/main/typescript/elvarg/game/model/container/impl/Inventory");
const { ItemContainer } = require("../../src/main/typescript/elvarg/game/model/container/ItemContainer");
const { StackType } = require("../../src/main/typescript/elvarg/game/model/container/StackType");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { PlayerStatus } = require("../../src/main/typescript/elvarg/game/model/PlayerStatus");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");

const OPEN_PRICE_CHECKER_BUTTON = 27651;
const PRICE_CHECKER_WITHDRAW_ALL_BUTTON = 18255;
const PRICE_CHECKER_DEPOSIT_ALL_BUTTON = 18252;
const PRICE_CHECKER_INTERFACE_ID = 42000;
const PRICE_CHECKER_CONTAINER_ID = 18500;
const PRICE_CHECKER_INVENTORY_CONTAINER_ID = 3322;
const PRICE_CHECKER_TEXT_START_ROW_1 = 18300;
const PRICE_CHECKER_TEXT_START_ROW_2 = 18400;

const CONTAINER_ACTION_OPCODES = [
  PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE,
];

class PriceCheckerContainer extends ItemContainer {
  constructor(player) {
    super(player, 24);
  }

  capacity() {
    return 24;
  }

  stackType() {
    return StackType.DEFAULT;
  }

  open() {
    this.player.setStatus(PlayerStatus.PRICE_CHECKING);
    this.player.getMovementQueue().reset();
    this.refreshItems();
    return this;
  }

  refreshItems() {
    const items_ = this.getValidItems();
    if (items_.length > 0) {
      this.player
        .getPacketSender()
        .sendString("", 18355)
        .sendString(Misc.insertCommasToNumber(this.getTotalValue()), 18351);

      for (let i = 0; i < this.capacity(); i++) {
        let itemPrice = "";
        let totalPrice = "";

        if (this.getItems()[i].isValid()) {
          const value = this.getItems()[i].getDefinition().getValue();
          const amount = this.getItems()[i].getAmount();
          const total_price = value * amount;

          if (total_price >= Number.MAX_SAFE_INTEGER) {
            totalPrice = "Too High!";
          } else {
            totalPrice = " = " + Misc.insertCommasToNumber(String(total_price));
          }

          itemPrice =
            "" + Misc.insertCommasToNumber(String(value)) + " x" + String(amount);
        }

        this.player
          .getPacketSender()
          .sendString(itemPrice, PRICE_CHECKER_TEXT_START_ROW_1 + i);
        this.player
          .getPacketSender()
          .sendString(totalPrice, PRICE_CHECKER_TEXT_START_ROW_2 + i);
      }
    } else {
      this.player
        .getPacketSender()
        .sendString(
          "Click an item in your inventory to check it's wealth.",
          18355
        )
        .sendString("0", 18351);

      for (let i = 0; i < this.capacity(); i++) {
        this.player
          .getPacketSender()
          .sendString("", PRICE_CHECKER_TEXT_START_ROW_1 + i);
        this.player
          .getPacketSender()
          .sendString("", PRICE_CHECKER_TEXT_START_ROW_2 + i);
      }
    }

    this.player
      .getPacketSender()
      .sendInterfaceSet(PRICE_CHECKER_INTERFACE_ID, 3321);
    this.player
      .getPacketSender()
      .sendItemContainer(this, PRICE_CHECKER_CONTAINER_ID);
    this.player
      .getPacketSender()
      .sendItemContainer(
        this.player.getInventory(),
        PRICE_CHECKER_INVENTORY_CONTAINER_ID
      );
    return this;
  }

  full() {
    this.player
      .getPacketSender()
      .sendMessage("The pricechecker cannot hold any more items.");
    return this;
  }

  withdrawAll() {
    if (
      this.player.getStatus() == PlayerStatus.PRICE_CHECKING &&
      this.player.getInterfaceId() == PRICE_CHECKER_INTERFACE_ID
    ) {
      for (const item of this.getValidItems()) {
        this.switchItems(this.player.getInventory(), item.clone(), false, false);
      }
      this.refreshItems();
      this.player.getInventory().refreshItems();
    }
  }

  depositAll() {
    if (
      this.player.getStatus() == PlayerStatus.PRICE_CHECKING &&
      this.player.getInterfaceId() == PRICE_CHECKER_INTERFACE_ID
    ) {
      for (const item of this.player.getInventory().getValidItems()) {
        const definition = item.getDefinition();
        if (!definition.isSellable() || definition.getValue() <= 0) {
          continue;
        }
        this.player
          .getInventory()
          .switchItems(this, item.clone(), false, false);
      }
      this.refreshItems();
      this.player.getInventory().refreshItems();
    }
  }

  deposit(id, amount, slot) {
    if (
      this.player.getStatus() == PlayerStatus.PRICE_CHECKING &&
      this.player.getInterfaceId() == PRICE_CHECKER_INTERFACE_ID
    ) {
      if (this.player.getInventory().getItems()[slot].getId() == id) {
        const item = new Item(id, amount);
        if (!item.getDefinition().isSellable()) {
          this.player
            .getPacketSender()
            .sendMessage("That item cannot be pricechecked because it isn't sellable.");
          return true;
        }
        if (item.getDefinition().getValue() == 0) {
          this.player
            .getPacketSender()
            .sendMessage("There's no point pricechecking that item. It has no value.");
          return true;
        }

        if (item.getAmount() == 1) {
          this.player
            .getInventory()
            .switchItem(this, item, false, slot, true);
        } else {
          this.switchItems(this, item, false, true);
        }
      }
      return true;
    }
    return false;
  }

  withdraw(id, amount, slot) {
    if (
      this.player.getStatus() == PlayerStatus.PRICE_CHECKING &&
      this.player.getInterfaceId() == PRICE_CHECKER_INTERFACE_ID
    ) {
      if (this.items[slot].getId() == id) {
        const item = new Item(id, amount);
        if (item.getAmount() == 1) {
          this.switchItem(this.player.getInventory(), item, false, slot, true);
        } else {
          this.switchItems(this.player.getInventory(), item, false, true);
        }
      }
      return true;
    }
    return false;
  }
}

function getPriceChecker(player) {
  if (!player) {
    return null;
  }
  if (!player.__priceCheckerContainer) {
    player.__priceCheckerContainer = new PriceCheckerContainer(player);
  }
  return player.__priceCheckerContainer;
}

function handlePriceCheckerButton(player, buttonId) {
  switch (buttonId) {
    case OPEN_PRICE_CHECKER_BUTTON:
      if (player.busy?.()) {
        player.getPacketSender().sendInterfaceRemoval();
      }
      getPriceChecker(player)?.open();
      return true;
    case PRICE_CHECKER_WITHDRAW_ALL_BUTTON:
      getPriceChecker(player)?.withdrawAll();
      return true;
    case PRICE_CHECKER_DEPOSIT_ALL_BUTTON:
      getPriceChecker(player)?.depositAll();
      return true;
    default:
      return false;
  }
}

function handlePriceCheckerInterfaceAction(player, buttonId, action) {
  if (player?.getInterfaceId?.() !== PRICE_CHECKER_INTERFACE_ID) {
    return false;
  }

  if (buttonId !== PRICE_CHECKER_INTERFACE_ID) {
    return false;
  }

  if (action === 0 || action === 1) {
    getPriceChecker(player)?.depositAll();
    return true;
  }

  if (action === 2) {
    getPriceChecker(player)?.withdrawAll();
    return true;
  }

  return false;
}

function decodeContainerAction(opcode, payload) {
  const packet = new Packet(opcode, payload);
  switch (opcode) {
    case PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        slot: packet.readShortA(),
        itemId: packet.readShortA(),
        amountType: "fixed",
        amount: 1,
      };
    case PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        itemId: packet.readLEShortA(),
        slot: packet.readLEShort(),
        amountType: "fixed",
        amount: 5,
      };
    case PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        itemId: packet.readShortA(),
        slot: packet.readShortA(),
        amountType: "fixed",
        amount: 10,
      };
    case PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        slot: packet.readShortA(),
        interfaceId: packet.readInt(),
        itemId: packet.readShortA(),
        amountType: "all",
      };
    case PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        slot: packet.readLEShort(),
        itemId: packet.readLEShort(),
        amountType: "x",
      };
    default:
      return null;
  }
}

function normalizeItemId(itemId) {
  if (!Number.isInteger(itemId)) {
    return -1;
  }
  return itemId < 0 ? itemId + 0x10000 : itemId;
}

function readShortVariants(payload, offset) {
  if (!Buffer.isBuffer(payload) || payload.length < offset + 2) {
    return [];
  }

  const be = payload.readInt16BE(offset);
  const le = payload.readInt16LE(offset);
  const shortA = (((payload[offset] & 0xff) << 8) | ((payload[offset + 1] - 128) & 0xff));
  const shortASigned = shortA > 32767 ? shortA - 0x10000 : shortA;
  const leShortA = (((payload[offset] - 128) & 0xff) | ((payload[offset + 1] & 0xff) << 8));
  const leShortASigned = leShortA > 32767 ? leShortA - 0x10000 : leShortA;

  return [...new Set([be, le, shortASigned, leShortASigned])];
}

function matchSlotAndItem(container, candidates) {
  const items = container?.getItems?.();
  const capacity = container?.capacity?.();
  if (!items || !Number.isInteger(capacity) || capacity <= 0) {
    return null;
  }

  for (const candidate of candidates) {
    const slot = candidate.slot;
    const itemId = normalizeItemId(candidate.itemId);
    if (!Number.isInteger(slot) || slot < 0 || slot >= capacity || itemId <= 0) {
      continue;
    }
    const slotItemId = items?.[slot]?.getId?.();
    if (slotItemId === itemId || slotItemId === candidate.itemId) {
      return { slot, itemId };
    }
  }

  return null;
}

function buildContainerCandidates(opcode, payload, fallback) {
  const slotOffsetsByOpcode = {
    [PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE]: 4,
    [PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE]: 6,
    [PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE]: 6,
    [PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE]: 0,
    [PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE]: 4,
  };
  const itemOffsetsByOpcode = {
    [PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE]: 6,
    [PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE]: 4,
    [PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE]: 4,
    [PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE]: 6,
    [PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE]: 6,
  };

  const slotOffset = slotOffsetsByOpcode[opcode];
  const itemOffset = itemOffsetsByOpcode[opcode];
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (slot, itemId) => {
    const key = `${slot}:${itemId}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ slot, itemId });
  };

  pushCandidate(fallback.slot, fallback.itemId);
  if (!Number.isInteger(slotOffset) || !Number.isInteger(itemOffset)) {
    return candidates;
  }

  const slotVariants = readShortVariants(payload, slotOffset);
  const itemVariants = readShortVariants(payload, itemOffset);
  for (const slot of slotVariants) {
    for (const itemId of itemVariants) {
      pushCandidate(slot, itemId);
      if (opcode === PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE) {
        pushCandidate(itemId, slot);
      }
    }
  }

  return candidates;
}

function resolveContainerForInterface(player, interfaceId) {
  if (interfaceId === PRICE_CHECKER_CONTAINER_ID) {
    return getPriceChecker(player);
  }

  const isPriceCheckerInventoryInterface =
    interfaceId === PRICE_CHECKER_INVENTORY_CONTAINER_ID ||
    (interfaceId === Inventory.INTERFACE_ID &&
      player?.getInterfaceId?.() === PRICE_CHECKER_INTERFACE_ID);
  if (isPriceCheckerInventoryInterface) {
    return player.getInventory();
  }

  return null;
}

function resolveContainerSlotAndItem(player, interfaceId, opcode, payload, fallback) {
  const container = resolveContainerForInterface(player, interfaceId);
  const candidates = buildContainerCandidates(opcode, payload, fallback);
  if (!container) {
    return {
      slot: fallback.slot,
      itemId: normalizeItemId(fallback.itemId),
      matched: null,
    };
  }

  const matched = matchSlotAndItem(container, candidates);
  if (matched) {
    return { ...matched, matched: true };
  }

  return {
    slot: fallback.slot,
    itemId: normalizeItemId(fallback.itemId),
    matched: false,
  };
}

function handlePriceCheckerContainerAction(player, opcode, payload) {
  const decoded = decodeContainerAction(opcode, payload);
  if (!decoded) {
    return false;
  }

  const resolved = resolveContainerSlotAndItem(
    player,
    decoded.interfaceId,
    opcode,
    payload,
    { slot: decoded.slot, itemId: decoded.itemId }
  );
  decoded.slot = resolved.slot;
  decoded.itemId = resolved.itemId;

  let isInventorySide =
    decoded.interfaceId === PRICE_CHECKER_INVENTORY_CONTAINER_ID ||
    (decoded.interfaceId === Inventory.INTERFACE_ID &&
      player?.getInterfaceId?.() === PRICE_CHECKER_INTERFACE_ID);
  let isCheckerSide = decoded.interfaceId === PRICE_CHECKER_CONTAINER_ID;

  if (!isInventorySide && !isCheckerSide && player?.getInterfaceId?.() === PRICE_CHECKER_INTERFACE_ID) {
    const fallbackCandidates = buildContainerCandidates(opcode, payload, {
      slot: decoded.slot,
      itemId: decoded.itemId,
    });
    const inventoryMatch = matchSlotAndItem(player.getInventory(), fallbackCandidates);
    const checkerMatch = matchSlotAndItem(
      getPriceChecker(player),
      fallbackCandidates
    );
    if (inventoryMatch && !checkerMatch) {
      isInventorySide = true;
      decoded.slot = inventoryMatch.slot;
      decoded.itemId = inventoryMatch.itemId;
    } else if (checkerMatch && !inventoryMatch) {
      isCheckerSide = true;
      decoded.slot = checkerMatch.slot;
      decoded.itemId = checkerMatch.itemId;
    }
  }

  if (!isInventorySide && !isCheckerSide) {
    return false;
  }
  if (!Number.isInteger(decoded.slot) || decoded.slot < 0 || decoded.itemId <= 0) {
    return false;
  }

  if (decoded.amountType === "x") {
    player.setEnteredAmountAction({
      execute: (amount) => {
        if (!Number.isInteger(amount) || amount <= 0) {
          return;
        }
        const priceChecker = getPriceChecker(player);
        if (!priceChecker) {
          return;
        }
        if (isInventorySide) {
          priceChecker.deposit(decoded.itemId, amount, decoded.slot);
          return;
        }
        priceChecker.withdraw(decoded.itemId, amount, decoded.slot);
      },
    });
    player
      .getPacketSender()
      .sendEnterAmountPrompt(
        isInventorySide
          ? "How many would you like to deposit?"
          : "How many would you like to withdraw?"
      );
    return true;
  }

  let amount = decoded.amount;
  if (decoded.amountType === "all") {
    amount = isInventorySide
      ? player.getInventory().getAmount(decoded.itemId)
      : getPriceChecker(player)?.getAmount?.(decoded.itemId) ?? 0;
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return true;
  }

  if (isInventorySide) {
    getPriceChecker(player)?.deposit(decoded.itemId, amount, decoded.slot);
    return true;
  }

  getPriceChecker(player)?.withdraw(decoded.itemId, amount, decoded.slot);
  return true;
}

module.exports = {
  name: "PriceChecker",
  register(api) {
    const PRICE_CHECKER_BUTTONS = [
      OPEN_PRICE_CHECKER_BUTTON,
      PRICE_CHECKER_WITHDRAW_ALL_BUTTON,
      PRICE_CHECKER_DEPOSIT_ALL_BUTTON,
    ];

    api.onButton(
      PRICE_CHECKER_BUTTONS,
      ({ player, buttonId }) => handlePriceCheckerButton(player, buttonId)
    );

    api.onInterfaceActionButton(
      PRICE_CHECKER_BUTTONS,
      ({ player, buttonId }) => handlePriceCheckerButton(player, buttonId)
    );

    api.onInterfaceActionButton(
      PRICE_CHECKER_INTERFACE_ID,
      ({ player, buttonId, action }) =>
        handlePriceCheckerInterfaceAction(player, buttonId, action)
    );

    api.onEstablishedPacket(({ opcode, packet, player }) => {
      if (!CONTAINER_ACTION_OPCODES.includes(opcode)) {
        return;
      }
      handlePriceCheckerContainerAction(player, opcode, packet.getBuffer());
    });
  },
};
