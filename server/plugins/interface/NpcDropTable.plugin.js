const { ItemDefinition } = require("../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { NpcDefinition } = require("../../src/main/typescript/elvarg/game/definition/NpcDefinition");
const { NpcDropDefinition } = require("../../src/main/typescript/elvarg/game/definition/NpcDropDefinition");
const { FLAG_OP1, createWidgetGroup } = require("./widgetGroup");

const GROUP_ID = 30031;
const MAIN_MODAL_UID = (161 << 16) | 16;
const FRAME_COMPONENT = 1;
const STATUS_COMPONENT = 6;
const VIEW_COMPONENT = 8;
const SCROLLBAR_COMPONENT = 9;
const CLOSE_COMPONENT = 7;
const ROW_CAPACITY = 100;
const ROW_HEIGHT = 34;
const BACKGROUND_START = 20;
const ICON_START = 100;
const NAME_START = 200;
const QUANTITY_START = 300;
const RATE_START = 400;

const uid = (component) => (GROUP_ID << 16) | component;

function buildWidgetGroup() {
  const { widgets, add } = createWidgetGroup(GROUP_ID);
  const root = add(0, -1, {
    rawWidth: 18,
    rawHeight: 18,
    widthMode: 1,
    heightMode: 1,
    width: 520,
    height: 334,
    xPositionMode: 1,
    yPositionMode: 1,
  });
  add(1, root, { widthMode: 1, heightMode: 1, width: 520, height: 334 });
  add(STATUS_COMPONENT, root, {
    type: 4,
    rawX: 34,
    rawY: 24,
    rawWidth: 68,
    rawHeight: 16,
    widthMode: 1,
    width: 452,
    height: 16,
    text: "",
    fontId: 494,
    textColor: 0xc5b79b,
    textShadowed: true,
    xTextAlignment: 1,
    yTextAlignment: 1,
  });

  const view = add(VIEW_COMPONENT, root, {
    rawX: 34,
    rawY: 48,
    rawWidth: 452,
    rawHeight: 268,
    width: 452,
    height: 268,
    scrollWidth: 452,
    scrollHeight: ROW_CAPACITY * ROW_HEIGHT,
  });
  add(SCROLLBAR_COMPONENT, root, {
    rawX: 490,
    rawY: 48,
    rawWidth: 16,
    rawHeight: 268,
    width: 16,
    height: 268,
    noClickThrough: true,
  });

  for (let row = 0; row < ROW_CAPACITY; row++) {
    const y = row * ROW_HEIGHT;
    add(BACKGROUND_START + row, view, {
      type: 3,
      rawX: 0,
      rawY: y,
      rawWidth: 452,
      rawHeight: ROW_HEIGHT - 2,
      width: 452,
      height: ROW_HEIGHT - 2,
      filled: true,
      color: 0x241e16,
      mouseOverColor: 0x241e16,
      textColor: 0x241e16,
      opacity: 32,
      isHidden: true,
      hidden: true,
    });
    add(ICON_START + row, view, {
      type: 5,
      rawX: 4,
      rawY: y + 1,
      rawWidth: 32,
      rawHeight: 32,
      width: 32,
      height: 32,
      itemQuantityMode: 2,
      borderType: 1,
      graphicShadow: 0x333333,
      shadowColor: 0x333333,
      isHidden: true,
      hidden: true,
    });
    add(NAME_START + row, view, {
      type: 4,
      rawX: 44,
      rawY: y + 2,
      rawWidth: 220,
      rawHeight: 16,
      width: 220,
      height: 16,
      text: "",
      fontId: 494,
      textColor: 0xe8ded0,
      textShadowed: true,
      yTextAlignment: 1,
      isHidden: true,
      hidden: true,
    });
    add(QUANTITY_START + row, view, {
      type: 4,
      rawX: 44,
      rawY: y + 18,
      rawWidth: 220,
      rawHeight: 14,
      width: 220,
      height: 14,
      text: "",
      fontId: 494,
      textColor: 0xc5b79b,
      textShadowed: true,
      yTextAlignment: 1,
      isHidden: true,
      hidden: true,
    });
    add(RATE_START + row, view, {
      type: 4,
      rawX: 276,
      rawY: y + 9,
      rawWidth: 170,
      rawHeight: 16,
      width: 170,
      height: 16,
      text: "",
      fontId: 494,
      textColor: 0xffcf70,
      textShadowed: true,
      xTextAlignment: 2,
      yTextAlignment: 1,
      isHidden: true,
      hidden: true,
    });
  }

  add(CLOSE_COMPONENT, root, {
    rawY: 24,
    rawWidth: 110,
    rawHeight: 30,
    xPositionMode: 1,
    yPositionMode: 2,
    width: 110,
    height: 30,
    actions: ["Close"],
    flags: FLAG_OP1,
  });

  return { groupId: GROUP_ID, widgets };
}

const INTERFACE_DEFINITION = {
  ...buildWidgetGroup(),
  scroll: [{
    viewComponent: VIEW_COMPONENT,
    scrollbarComponent: SCROLLBAR_COMPONENT,
    contentHeight: ROW_CAPACITY * ROW_HEIGHT,
  }],
};

function cleanText(value) {
  return String(value ?? "").replace(/[<>]/g, "");
}

function itemName(itemId) {
  const name = ItemDefinition.forId(itemId)?.getName?.();
  return name && name.toLowerCase() !== "null" ? cleanText(name) : `Item ${itemId}`;
}

function quantityText(drop) {
  const min = Number(drop?.getMinAmount?.() ?? 0);
  const max = Number(drop?.getMaxAmount?.() ?? min);
  return min === max ? `x${min.toLocaleString("en-US")}` : `x${min.toLocaleString("en-US")}-${max.toLocaleString("en-US")}`;
}

function rateText(drop, category) {
  const chance = Number(drop?.getChance?.() ?? -1);
  if (Number.isFinite(chance) && chance > 0) {
    return `1/${Math.max(1, Math.round(chance)).toLocaleString("en-US")}`;
  }
  return category === "Always" ? "Always" : category;
}

function rowsFor(npcId) {
  const definition = NpcDropDefinition.get(npcId);
  if (!definition) return [];

  const categories = [
    ["Always", definition.getAlwaysDrops?.()],
    ["Common", definition.getCommonDrops?.()],
    ["Uncommon", definition.getUncommonDrops?.()],
    ["Rare", definition.getRareDrops?.()],
    ["Very rare", definition.getVeryRareDrops?.()],
    ["Special", definition.getSpecialDrops?.()],
  ];
  const rows = [];
  for (const [category, drops] of categories) {
    for (const drop of drops ?? []) {
      const itemId = Number(drop?.getItemId?.() ?? -1);
      if (!Number.isInteger(itemId) || itemId < 0) continue;
      rows.push({
        itemId,
        name: itemName(itemId),
                quantity: quantityText(drop),
                rate: `${category}: ${rateText(drop, category)}`,
      });
    }
  }
  return rows;
}

function npcName(npcId) {
  const name = NpcDefinition.forId(npcId)?.getName?.();
  return name && name.toLowerCase() !== "null" ? cleanText(name) : `NPC ${npcId}`;
}

function renderRows(player, rows) {
  const sender = player.getPacketSender();
  const shown = Math.min(rows.length, ROW_CAPACITY);
  for (let row = 0; row < ROW_CAPACITY; row++) {
    const value = row < shown ? rows[row] : null;
    const hidden = !value;
    sender.sendInterfaceDisplayState(uid(BACKGROUND_START + row), hidden);
    sender.sendInterfaceDisplayState(uid(ICON_START + row), hidden);
    sender.sendInterfaceDisplayState(uid(NAME_START + row), hidden);
    sender.sendInterfaceDisplayState(uid(QUANTITY_START + row), hidden);
    sender.sendInterfaceDisplayState(uid(RATE_START + row), hidden);
    if (!value) {
      sender.sendInterfaceModel(uid(ICON_START + row), -1, 0);
      sender.sendString("", uid(NAME_START + row));
      sender.sendString("", uid(QUANTITY_START + row));
      sender.sendString("", uid(RATE_START + row));
      continue;
    }
    sender.sendInterfaceModel(uid(ICON_START + row), value.itemId, 1);
    sender.sendString(value.name, uid(NAME_START + row));
    sender.sendString(value.quantity, uid(QUANTITY_START + row));
    sender.sendString(value.rate, uid(RATE_START + row));
  }
  const suffix = rows.length > ROW_CAPACITY ? ` (showing ${ROW_CAPACITY} of ${rows.length})` : "";
  sender.sendString(`Drop table entries: ${rows.length}${suffix}`, uid(STATUS_COMPONENT));
}

function openDropTable(player, npcId) {
  const rows = rowsFor(npcId);
  if (rows.length === 0) return false;

  player.setInterfaceId(GROUP_ID);
  const sender = player.getPacketSender();
  // Script 227 must run as a postScript bundled into the same open_sub
  // packet (matching Presets.plugin.js's working pattern) - calling it as a
  // separate sendClientScript afterward crashes client-side with a
  // Cs2Error RuntimeException, since it expects to run in the context of
  // the interface being opened, not as an independent later invocation.
  sender.sendSubInterface(MAIN_MODAL_UID, GROUP_ID, 0, {
    postScripts: [{ scriptId: 227, args: [uid(FRAME_COMPONENT), `${npcName(npcId)} drops`] }],
  });
  renderRows(player, rows);
  return true;
}

module.exports = {
  name: "NpcDropTable",
  register(api) {
    api.registerCustomInterface(INTERFACE_DEFINITION);
    api.onNpcExamine((event) => {
      if (openDropTable(event.player, event.npcId)) {
        event.handled = true;
      }
    });
    api.registerCommand("drops", ({ player, parts }) => {
      const npcId = Number.parseInt(parts?.[1] ?? "", 10);
      if (!Number.isInteger(npcId) || npcId < 0) {
        return "Usage: ::drops <NpcID>";
      }
      return openDropTable(player, npcId)
      ? undefined
      : `No drop table is available for NPC ${npcId}.`;
    });
    api.onInterfaceActionButton(uid(CLOSE_COMPONENT), ({ player }) => {
      player.getPacketSender().closeInterface(GROUP_ID);
      return true;
    });
    api.log("registered", { groupId: GROUP_ID });
  },
};
