const fs = require("fs");
const path = require("path");

const { Packet } = require("../../src/main/typescript/elvarg/net/packet/Packet");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { PlayerStatus } = require("../../src/main/typescript/elvarg/game/model/PlayerStatus");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { ItemDefinition } = require("../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { NpcIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const { ShopIdentifiers } = require("../../src/main/typescript/elvarg/util/ShopIdentifiers");
const { ItemIdentifiers } = require("../../src/main/typescript/elvarg/util/ItemIdentifiers");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");

const SHOPS_PATH = path.resolve(__dirname, "../../data/definitions/shops.json");

const IFACE_SHOP = 3824;
const IFACE_INV = 3823;
const IFACE_ITEMS = 3900;
const IFACE_NAME = 3901;
const IFACE_SCROLL = 29995;

const MAX_SHOP_ITEMS = 1000;
const MAX_ACTION_AMOUNT = 5000;
const SALES_TAX = 0.85;

const SHOP_ACTION_OPCODES = new Set([
  PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE,
  PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE,
]);

const shopsById = new Map();
const activeShopByPlayer = new WeakMap();
const viewersByShopId = new Map();

let loaded = false;
let restockTaskRunning = false;

class ShopRestockTask extends Task {
  constructor() {
    super(4);
  }

  execute() {
    let changed = false;
    for (const shop of shopsById.values()) {
      if (restockShop(shop)) {
        changed = true;
      }
    }

    if (!changed) {
      this.stop();
      restockTaskRunning = false;
    }
  }
}

function ensureRestockTask() {
  if (restockTaskRunning) {
    return;
  }
  restockTaskRunning = true;
  TaskManager.submit(new ShopRestockTask());
}

function normalizeAmount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeCurrency(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "COINS";
  }
  return value.toUpperCase();
}

function toUnsignedShort(value) {
  return Number.isInteger(value) ? (value & 0xffff) : -1;
}

function currencyName(currency) {
  switch (currency) {
    case "COINS":
      return "Coins";
    case "BLOOD_MONEY":
      return "Blood money";
    case "POINTS":
      return "Points";
    default:
      return "Currency";
  }
}

function currencyItemId(currency) {
  switch (currency) {
    case "COINS":
      return ItemIdentifiers.COINS;
    case "BLOOD_MONEY":
      return ItemIdentifiers.BLOOD_MONEY;
    default:
      return -1;
  }
}

function currencyAmount(player, currency) {
  if (currency === "POINTS") {
    return Number(player?.getPoints?.() ?? 0);
  }
  const id = currencyItemId(currency);
  return id > 0 ? Number(player?.getInventory?.()?.getAmount?.(id) ?? 0) : 0;
}

function addCurrency(player, currency, amount) {
  const qty = normalizeAmount(amount);
  if (qty <= 0) {
    return;
  }

  if (currency === "POINTS") {
    player.setPoints((player.getPoints?.() ?? 0) + qty);
    return;
  }

  const id = currencyItemId(currency);
  if (id > 0) {
    player.getInventory().adds(id, qty);
  }
}

function removeCurrency(player, currency, amount) {
  const qty = normalizeAmount(amount);
  if (qty <= 0) {
    return;
  }

  if (currency === "POINTS") {
    player.setPoints(Math.max(0, (player.getPoints?.() ?? 0) - qty));
    return;
  }

  const id = currencyItemId(currency);
  if (id > 0) {
    player.getInventory().deleteNumber(id, qty);
  }
}

function parseShopDefinitions() {
  try {
    const decoded = JSON.parse(fs.readFileSync(SHOPS_PATH, "utf8"));
    return Array.isArray(decoded) ? decoded : [];
  } catch (error) {
    console.error("[Shops] Failed to load shops.json", error);
    return [];
  }
}

function ensureLoaded() {
  if (loaded) {
    return;
  }

  shopsById.clear();

  for (const def of parseShopDefinitions()) {
    if (!Number.isInteger(def?.id) || def.id < 0) {
      continue;
    }

    const originalAmounts = new Map();
    const stock = new Map();
    const order = [];
    const seen = new Set();
    const originalStock = Array.isArray(def.originalStock) ? def.originalStock : [];

    for (const stockEntry of originalStock) {
      const id = Number(stockEntry?.id ?? -1);
      const amount = normalizeAmount(stockEntry?.amount ?? 1);
      if (id <= 0 || amount <= 0) {
        continue;
      }

      originalAmounts.set(id, (originalAmounts.get(id) ?? 0) + amount);
      stock.set(id, (stock.get(id) ?? 0) + amount);

      if (!seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }

    shopsById.set(def.id, {
      id: def.id,
      name: typeof def.name === "string" ? def.name : "Shop",
      currency: normalizeCurrency(def.currency),
      originalAmounts,
      stock,
      order,
      originalSlotCount: originalStock.length,
    });
  }

  loaded = true;
}

function reloadShops() {
  loaded = false;
  shopsById.clear();
  ensureLoaded();

  for (const shopId of Array.from(viewersByShopId.keys())) {
    if (!shopsById.has(shopId)) {
      const viewers = viewersByShopId.get(shopId);
      if (!viewers) {
        continue;
      }
      for (const player of Array.from(viewers)) {
        clearActiveShop(player);
      }
      continue;
    }
    refreshShop(shopId);
  }

  return { shopCount: shopsById.size };
}

function isGeneralStore(shop) {
  return shop.id === ShopIdentifiers.GENERAL_STORE;
}

function deletesItems(shop) {
  return isGeneralStore(shop);
}

function restocks(shop) {
  return !isGeneralStore(shop);
}

function buysItem(shop, itemId) {
  return isGeneralStore(shop) || (shop.originalAmounts.get(itemId) ?? 0) > 0;
}

function itemPrice(shop, itemDef) {
  if (shop.currency === "BLOOD_MONEY") {
    return Number(itemDef.getBloodMoneyValue?.() ?? 0);
  }
  return Number(itemDef.getValue?.() ?? 0);
}

function ensureInOrder(shop, itemId) {
  if (!shop.order.includes(itemId)) {
    shop.order.push(itemId);
  }
}

function addStock(shop, itemId, amount) {
  const qty = normalizeAmount(amount);
  if (qty <= 0) {
    return false;
  }

  const current = shop.stock.get(itemId) ?? 0;
  if (current <= 0 && shop.order.length >= MAX_SHOP_ITEMS) {
    return false;
  }

  ensureInOrder(shop, itemId);
  shop.stock.set(itemId, Math.min(Number.MAX_SAFE_INTEGER, current + qty));
  return true;
}

function removeStock(shop, itemId, amount) {
  const qty = normalizeAmount(amount);
  if (qty <= 0) {
    return 0;
  }

  const current = shop.stock.get(itemId) ?? 0;
  const floor = deletesItems(shop) ? 0 : 1;
  const removable = Math.max(0, current - floor);
  const removed = Math.min(removable, qty);

  if (removed <= 0) {
    return 0;
  }

  const remaining = current - removed;
  if (remaining <= 0) {
    shop.stock.delete(itemId);
    if (!shop.originalAmounts.has(itemId)) {
      shop.order = shop.order.filter((id) => id !== itemId);
    }
  } else {
    shop.stock.set(itemId, remaining);
  }

  return removed;
}

function displayEntries(shop) {
  const entries = [];
  for (const itemId of shop.order) {
    const amount = shop.stock.get(itemId) ?? 0;
    if (amount > 0) {
      entries.push({ itemId, amount });
    }
  }
  return entries;
}

function itemAtDisplaySlot(shop, slot) {
  if (!Number.isInteger(slot) || slot < 0) {
    return null;
  }
  return displayEntries(shop)[slot] ?? null;
}

function setActiveShop(player, shopId) {
  const previous = activeShopByPlayer.get(player);
  if (Number.isInteger(previous)) {
    const prevViewers = viewersByShopId.get(previous);
    prevViewers?.delete(player);
    if (prevViewers && prevViewers.size === 0) {
      viewersByShopId.delete(previous);
    }
  }

  activeShopByPlayer.set(player, shopId);

  if (!viewersByShopId.has(shopId)) {
    viewersByShopId.set(shopId, new Set());
  }
  viewersByShopId.get(shopId).add(player);
}

function clearActiveShop(player) {
  const shopId = activeShopByPlayer.get(player);
  if (!Number.isInteger(shopId)) {
    return;
  }

  const viewers = viewersByShopId.get(shopId);
  viewers?.delete(player);
  if (viewers && viewers.size === 0) {
    viewersByShopId.delete(shopId);
  }

  activeShopByPlayer.delete(player);
}

function isViewingShop(player) {
  return (
    player?.getStatus?.() === PlayerStatus.SHOPPING &&
    player?.getInterfaceId?.() === IFACE_SHOP
  );
}

function currentShop(player) {
  if (!isViewingShop(player)) {
    clearActiveShop(player);
    return null;
  }
  const shopId = activeShopByPlayer.get(player);
  return Number.isInteger(shopId) ? shopsById.get(shopId) ?? null : null;
}

function openShop(player, shop, resetScroll) {
  const sender = player.getPacketSender();
  const items = displayEntries(shop).map((entry) => new Item(entry.itemId, entry.amount));

  sender.sendItemContainer(player.getInventory(), IFACE_INV);
  sender.sendInterfaceItems(IFACE_ITEMS, items);
  sender.sendString(shop.name, IFACE_NAME);

  if (!player.getEnteredAmountAction?.()) {
    sender.sendInterfaceSet(IFACE_SHOP, IFACE_INV - 1);
  }

  if (resetScroll) {
    sender.sendInterfaceScrollReset(IFACE_SCROLL);
  }

  if (shop.originalSlotCount < 37) {
    sender.sendScrollbarHeight(IFACE_SCROLL, 0);
  } else {
    sender.sendScrollbarHeight(IFACE_SCROLL, Math.ceil(shop.originalSlotCount / 9) * 56);
  }

  player.setStatus(PlayerStatus.SHOPPING);
  return true;
}

function refreshShop(shopId) {
  const shop = shopsById.get(shopId);
  const viewers = viewersByShopId.get(shopId);
  if (!shop || !viewers) {
    return;
  }

  for (const player of Array.from(viewers)) {
    if (!isViewingShop(player) || activeShopByPlayer.get(player) !== shopId) {
      clearActiveShop(player);
      continue;
    }
    openShop(player, shop, false);
  }
}

function restockStep(target, current) {
  const delta = target - current;
  return delta <= 0 ? 0 : Math.max(1, Math.floor(delta * 0.3));
}

function restockShop(shop) {
  const ids = new Set([...shop.order, ...shop.originalAmounts.keys()]);
  let changed = false;

  for (const itemId of ids) {
    const original = shop.originalAmounts.get(itemId) ?? 0;
    const current = shop.stock.get(itemId) ?? 0;

    if (current > original) {
      const removed = removeStock(shop, itemId, restockStep(current, original));
      if (removed > 0) {
        changed = true;
      }
      continue;
    }

    if (current < original && restocks(shop)) {
      const added = addStock(shop, itemId, restockStep(original, current));
      if (added) {
        changed = true;
      }
    }
  }

  if (changed) {
    refreshShop(shop.id);
  }

  return changed;
}

function decodeAction(opcode, payload) {
  try {
    const p = new Packet(opcode, payload);
    switch (opcode) {
      case PacketConstants.FIRST_ITEM_CONTAINER_ACTION_OPCODE:
        return {
          kind: "value",
          containerId: p.readInt(),
          slot: p.readShortA(),
          itemId: p.readShortA(),
          amount: 0,
        };
      case PacketConstants.SECOND_ITEM_CONTAINER_ACTION_OPCODE:
        return {
          kind: "buy_sell",
          containerId: p.readInt(),
          itemId: p.readLEShortA(),
          slot: p.readLEShort(),
          amount: 1,
        };
      case PacketConstants.THIRD_ITEM_CONTAINER_ACTION_OPCODE:
        return {
          kind: "buy_sell",
          containerId: p.readInt(),
          itemId: p.readShortA(),
          slot: p.readShortA(),
          amount: 5,
        };
      case PacketConstants.FOURTH_ITEM_CONTAINER_ACTION_OPCODE:
        return {
          kind: "buy_sell",
          slot: p.readShortA(),
          containerId: p.readInt(),
          itemId: p.readShortA(),
          amount: 10,
        };
      case PacketConstants.FIFTH_ITEM_CONTAINER_ACTION_OPCODE:
        return {
          kind: "x",
          containerId: p.readInt(),
          slot: p.readLEShort(),
          itemId: p.readLEShort(),
          amount: 0,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function priceCheck(player, shop, itemId, slot, fromShop) {
  if (!fromShop && !buysItem(shop, itemId)) {
    player.getPacketSender().sendMessage("You cannot sell this item to this shop.");
    return;
  }

  const def = ItemDefinition.forId(itemId);
  let price = itemPrice(shop, def);

  if (!fromShop) {
    if (!def.isSellable?.()) {
      player.getPacketSender().sendMessage("This item cannot be sold to a shop.");
      return;
    }
    if (price > 1) {
      price = Math.floor(price * SALES_TAX);
    }
  }

  if (price <= 0) {
    player.getPacketSender().sendMessage("This item has no value.");
    return;
  }

  player.getPacketSender().sendMessage(
    `@dre@${def.getName()}@bla@${
      fromShop ? " currently costs " : ": shop will buy for "
    }@dre@${Misc.insertCommasToNumber(String(price))} x ${currencyName(shop.currency)}.`
  );
}

function buyItem(player, shop, itemId, amount) {
  const def = ItemDefinition.forId(itemId);
  const price = itemPrice(shop, def);
  if (price <= 0) {
    return;
  }

  let qty = Math.min(normalizeAmount(amount), MAX_ACTION_AMOUNT);
  if (qty <= 0) {
    return;
  }

  const stock = shop.stock.get(itemId) ?? 0;
  const floor = deletesItems(shop) ? 0 : 1;
  const available = Math.max(0, stock - floor);
  if (available <= 0) {
    player
      .getPacketSender()
      .sendMessage("This item is currently out of stock. Come back later.");
    return;
  }

  const affordable = Math.floor(currencyAmount(player, shop.currency) / price);
  qty = Math.min(qty, affordable, available);

  if (qty <= 0) {
    player.getPacketSender().sendMessage("You can't afford that.");
    return;
  }

  const inv = player.getInventory();
  if (def.isStackable?.()) {
    if (!inv.containsNumber(itemId) && inv.getFreeSlots() <= 0) {
      inv.full();
      return;
    }
  } else {
    qty = Math.min(qty, inv.getFreeSlots());
    if (qty <= 0) {
      inv.full();
      return;
    }
  }

  const removed = removeStock(shop, itemId, qty);
  if (removed <= 0) {
    return;
  }

  removeCurrency(player, shop.currency, removed * price);
  inv.adds(itemId, removed);

  refreshShop(shop.id);
  ensureRestockTask();
}

function sellItem(player, shop, itemId, amount) {
  if (!buysItem(shop, itemId)) {
    player.getPacketSender().sendMessage("You cannot sell this item to this shop.");
    return;
  }

  const def = ItemDefinition.forId(itemId);
  if (!def.isSellable?.()) {
    player.getPacketSender().sendMessage("This item cannot be sold.");
    return;
  }

  let qty = Math.min(normalizeAmount(amount), MAX_ACTION_AMOUNT);
  qty = Math.min(qty, player.getInventory().getAmount(itemId));
  if (qty <= 0) {
    return;
  }

  let price = itemPrice(shop, def);
  if (price > 1) {
    price = Math.floor(price * SALES_TAX);
  }
  if (price <= 0) {
    player.getPacketSender().sendMessage("This item has no value.");
    return;
  }

  const stock = shop.stock.get(itemId) ?? 0;
  if (stock <= 0 && shop.order.length >= MAX_SHOP_ITEMS) {
    player.getPacketSender().sendMessage("The shop is currently full.");
    return;
  }

  player.getInventory().deleteNumber(itemId, qty);
  addCurrency(player, shop.currency, qty * price);
  addStock(shop, itemId, qty);

  refreshShop(shop.id);
  ensureRestockTask();
}

function handleAction(player, opcode, payload) {
  const shop = currentShop(player);
  if (!shop) {
    return false;
  }

  const action = decodeAction(opcode, payload);
  if (!action) {
    return false;
  }

  const fromShop = action.containerId === IFACE_ITEMS;
  const fromInventory = action.containerId === IFACE_INV;
  if (!fromShop && !fromInventory) {
    return false;
  }

  if (fromShop) {
    const entry = itemAtDisplaySlot(shop, action.slot);
    if (!entry) {
      return true;
    }

    const packetItemId = toUnsignedShort(action.itemId);
    const itemId = packetItemId > 0 && packetItemId === entry.itemId ? packetItemId : entry.itemId;

    if (action.kind === "value") {
      priceCheck(player, shop, itemId, action.slot, true);
      return true;
    }

    if (action.kind === "x") {
      player.setEnteredAmountAction({ execute: (amt) => buyItem(player, shop, itemId, amt) });
      player.getPacketSender().sendEnterAmountPrompt("How many would you like to buy?");
      return true;
    }

    buyItem(player, shop, itemId, action.amount);
    return true;
  }

  const slot = action.slot;
  const inv = player.getInventory();
  if (!Number.isInteger(slot) || slot < 0 || slot >= inv.capacity()) {
    return true;
  }

  const invItem = inv.getItems()?.[slot];
  if (!invItem || invItem.getId() <= 0) {
    return true;
  }

  const itemId = invItem.getId();

  if (action.kind === "value") {
    priceCheck(player, shop, itemId, slot, false);
    return true;
  }

  if (action.kind === "x") {
    player.setEnteredAmountAction({ execute: (amt) => sellItem(player, shop, itemId, amt) });
    player.getPacketSender().sendEnterAmountPrompt("How many would you like to sell?");
    return true;
  }

  sellItem(player, shop, itemId, action.amount);
  return true;
}

function openShopById(player, shopId, resetScroll = true) {
  ensureLoaded();
  const shop = shopsById.get(shopId);
  if (!player || !shop) {
    return false;
  }

  setActiveShop(player, shopId);
  return openShop(player, shop, resetScroll);
}

function openGeneralStore(player) {
  return openShopById(player, ShopIdentifiers.GENERAL_STORE, true);
}

module.exports = {
  name: "Shops",

  openShopById,
  openGeneralStore,

  register(api) {
    ensureLoaded();
    globalThis.__shopReload = reloadShops;

    api.onNpcClick(NpcIds.SHOP_KEEPER, 1, ({ player }) => openGeneralStore(player));

    api.onEstablishedPacket(({ opcode, packet, player }) => {
      if (opcode === PacketConstants.CLOSE_INTERFACE_OPCODE) {
        clearActiveShop(player);
        return;
      }
      if (!SHOP_ACTION_OPCODES.has(opcode)) {
        return;
      }
      handleAction(player, opcode, packet.getBuffer());
    });

    api.onPlayerProcess(({ player }) => {
      if (activeShopByPlayer.has(player) && !isViewingShop(player)) {
        clearActiveShop(player);
      }
    });

    api.onPlayerLogout(({ player }) => clearActiveShop(player));
    api.onPlayerDisconnect(({ player }) => clearActiveShop(player));
  },
};
