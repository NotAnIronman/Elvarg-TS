const { Bank } = require("../../src/main/typescript/elvarg/game/model/container/impl/Bank");
const { Packet } = require("../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { Inventory } = require("../../src/main/typescript/elvarg/game/model/container/impl/Inventory");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const BANK_BOOTH_IDS = Object.entries(ObjectIds)
  .filter(
    ([name, id]) =>
      typeof name === "string" &&
      name.includes("BANK_BOOTH") &&
      Number.isInteger(id)
  )
  .map(([, id]) => id);

function isBankBoothName(name) {
  return (
    typeof name === "string" &&
    name.trim().toLowerCase().includes("bank booth")
  );
}

function isBankBoothEvent(event) {
  if (BANK_BOOTH_IDS.includes(event.objectId)) {
    return true;
  }

  const definition = event.object.getDefinition?.();
  const name = definition?.name ?? definition?.getName?.();
  return isBankBoothName(name);
}

function openBank(player) {
  if (!player) {
    return false;
  }
  player.getBank(player.getCurrentBankTab()).open();
  return true;
}

function decodeBankContainerAction(opcode, payload) {
  const packet = new Packet(opcode, payload);
  switch (opcode) {
    case PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        slot: packet.readShortA(),
        itemId: packet.readShortA(),
        amount: 1,
      };
    case PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        itemId: packet.readLEShortA(),
        slot: packet.readLEShort(),
        amount: 5,
      };
    case PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        itemId: packet.readShortA(),
        slot: packet.readShortA(),
        amount: 10,
      };
    case PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        slot: packet.readShortA(),
        interfaceId: packet.readInt(),
        itemId: packet.readShortA(),
        amount: -1,
      };
    case PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE:
      return {
        interfaceId: packet.readInt(),
        slot: packet.readLEShort(),
        itemId: packet.readLEShort(),
        amount: null,
      };
    default:
      return null;
  }
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

function normalizeItemId(itemId) {
  if (!Number.isInteger(itemId)) {
    return -1;
  }
  return itemId < 0 ? itemId + 0x10000 : itemId;
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

function getContainerForInterface(player, interfaceId) {
  if (isBankTabContainer(interfaceId)) {
    return player.getBank(interfaceId - Bank.CONTAINER_START);
  }

  if (interfaceId === Bank.INVENTORY_INTERFACE_ID) {
    return player.getInventory();
  }

  // Web client can still emit inventory interface id 3214 while banking.
  if (
    interfaceId === Inventory.INTERFACE_ID &&
    player?.getInterfaceId?.() === 5292
  ) {
    return player.getInventory();
  }

  return null;
}

function resolveContainerSlotAndItem(player, interfaceId, opcode, payload, fallback) {
  const container = getContainerForInterface(player, interfaceId);
  if (!container) {
    return fallback;
  }

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
  if (!Number.isInteger(slotOffset) || !Number.isInteger(itemOffset)) {
    return fallback;
  }

  const slotVariants = readShortVariants(payload, slotOffset);
  const itemVariants = readShortVariants(payload, itemOffset);
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

  for (const slot of slotVariants) {
    for (const itemId of itemVariants) {
      pushCandidate(slot, itemId);
      if (opcode === PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE) {
        pushCandidate(itemId, slot);
      }
    }
  }

  return matchSlotAndItem(container, candidates) ?? fallback;
}

function isBankTabContainer(interfaceId) {
  return (
    interfaceId >= Bank.CONTAINER_START &&
    interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS
  );
}

function normalizeAmount(amount) {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.max(0, Math.floor(amount));
}

function resolveWithdrawTab(player, requestedTab, itemId, slot) {
  if (!player || !Number.isInteger(requestedTab)) {
    return requestedTab;
  }

  const normalizedItemId = normalizeItemId(itemId);
  if (normalizedItemId <= 0) {
    return requestedTab;
  }

  const requestedBank = player.getBank(requestedTab);
  const requestedSlotItemId =
    requestedBank?.getItems?.()?.[slot]?.getId?.() ?? -1;
  if (requestedSlotItemId === normalizedItemId) {
    return requestedTab;
  }

  const currentTab = player?.getCurrentBankTab?.();
  if (Number.isInteger(currentTab) && currentTab >= 0 && currentTab < Bank.TOTAL_BANK_TABS) {
    const currentTabSlotItemId =
      player.getBank(currentTab)?.getItems?.()?.[slot]?.getId?.() ?? -1;
    if (currentTabSlotItemId === normalizedItemId) {
      return currentTab;
    }
  }

  const inferredTab = Bank.getTabForItem(player, normalizedItemId);
  if (!Number.isInteger(inferredTab) || inferredTab < 0) {
    return requestedTab;
  }
  return inferredTab;
}

function handleBankContainerAction(player, opcode, payload) {
  if (!player) {
    return false;
  }

  const decoded = decodeBankContainerAction(opcode, payload);
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
  decoded.itemId = normalizeItemId(resolved.itemId);
  if (!Number.isInteger(decoded.slot) || decoded.slot < 0 || decoded.itemId <= 0) {
    return false;
  }

  if (isBankTabContainer(decoded.interfaceId)) {
    let fromBankTab = decoded.interfaceId - Bank.CONTAINER_START;
    fromBankTab = resolveWithdrawTab(
      player,
      fromBankTab,
      decoded.itemId,
      decoded.slot
    );
    const inferredSlot = player
      .getBank(fromBankTab)
      .getSlotForItemId(decoded.itemId);
    if (inferredSlot >= 0) {
      decoded.slot = inferredSlot;
    }

    if (decoded.amount == null) {
      player.setEnteredAmountAction({
        execute: (amount) => {
          const finalAmount = normalizeAmount(amount);
          if (finalAmount <= 0) {
            return;
          }
          Bank.withdraw(
            player,
            decoded.itemId,
            decoded.slot,
            finalAmount,
            fromBankTab
          );
        },
      });
      player
        .getPacketSender()
        .sendEnterAmountPrompt("How many would you like to withdraw?");
      return true;
    }

    Bank.withdraw(player, decoded.itemId, decoded.slot, decoded.amount, fromBankTab);
    return true;
  }

  const isBankInventoryInterface =
    decoded.interfaceId === Bank.INVENTORY_INTERFACE_ID ||
    (decoded.interfaceId === Inventory.INTERFACE_ID &&
      player?.getInterfaceId?.() === 5292);

  if (isBankInventoryInterface) {
    if (decoded.amount == null) {
      player.setEnteredAmountAction({
        execute: (amount) => {
          const finalAmount = normalizeAmount(amount);
          if (finalAmount <= 0) {
            return;
          }
          Bank.deposits(player, decoded.itemId, decoded.slot, finalAmount);
        },
      });
      player
        .getPacketSender()
        .sendEnterAmountPrompt("How many would you like to bank?");
      return true;
    }

    Bank.deposits(player, decoded.itemId, decoded.slot, decoded.amount);
    return true;
  }

  return false;
}

function handleBankButton(player, buttonId) {
  if (!player) {
    return false;
  }
  if (!Number.isInteger(buttonId)) {
    return false;
  }
  return Bank.handleButton(player, buttonId, 0) === true;
}

function handleBankInterfaceAction(player, buttonId, action) {
  if (!player) {
    return false;
  }
  if (!Number.isInteger(buttonId) || !Number.isInteger(action)) {
    return false;
  }
  return Bank.handleButton(player, buttonId, action) === true;
}

module.exports = {
  name: "BankBooths",
  handleBankContainerAction,
  handleBankButton,
  handleBankInterfaceAction,
  register(api) {
    api.onObjectInteraction((event) => {
      if (event.clickType !== 1 && event.clickType !== 2) {
        return;
      }
      if (!isBankBoothEvent(event)) {
        return;
      }
      if (openBank(event.player)) {
        event.handled = true;
      }
    });

    api.onButtonClick((event) => {
      if (handleBankButton(event.player, event.buttonId)) {
        event.handled = true;
      }
    });

    api.onInterfaceActionClick((event) => {
      if (handleBankInterfaceAction(event.player, event.buttonId, event.action)) {
        event.handled = true;
      }
    });
  },
};
