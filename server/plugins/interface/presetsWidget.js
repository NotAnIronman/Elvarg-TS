const {
  FLAG_OP1,
  TYPE_RECTANGLE,
  TYPE_TEXT,
  TYPE_GRAPHIC,
  createWidgetGroup,
} = require("./widgetGroup");

const GROUP_ID = 30003;

// Column of global presets, then the player's own slots.
const GLOBAL_ROW_START = 200;
const GLOBAL_ROW_COUNT = 17;
const CUSTOM_ROW_START = 230;
const CUSTOM_ROW_COUNT = 10;

const INVENTORY_SLOT_START = 100;
const INVENTORY_SLOT_COUNT = 28;
const INVENTORY_COLUMNS = 4;
const INVENTORY_BACKGROUND_START = 60;

const EQUIPMENT_SLOT_START = 140;
const EQUIPMENT_SLOT_COUNT = 14;
const EQUIPMENT_COLUMNS = 3;
const EQUIPMENT_BACKGROUND_START = 160;

const STAT_ROW_START = 20;
const STAT_ROW_COUNT = 7;

const COMPONENT = {
  ROOT: 0,
  FRAME: 1,
  CLOSE: 7,
  GLOBAL_HEADER: 10,
  CUSTOM_HEADER: 11,
  EQUIPMENT_HEADER: 13,
  INVENTORY_HEADER: 14,
  SELECTED_NAME: 30,
  SPELLBOOK: 31,
  LOAD_BUTTON: 40,
  SAVE_BUTTON: 41,
  CLEAR_BUTTON: 42,
  DEATH_BUTTON: 43,
};

const uid = (component) => (GROUP_ID << 16) | component;

const FONT_SMALL = 494;
const FONT_BOLD = 496;
const COLOUR_HEADER = 0xffd27f;
const COLOUR_TEXT = 0xe8ded0;
const COLOUR_MUTED = 0xc5b79b;
const SLOT_BACKGROUND = 0x241e16;
const BUTTON_COLOUR = 0x2b241b;
const BUTTON_HOVER_COLOUR = 0x3a3125;

function buildPresetsWidgetGroup() {
  const { widgets, add } = createWidgetGroup(GROUP_ID);

  const root = add(COMPONENT.ROOT, -1, {
    rawWidth: 18,
    rawHeight: 18,
    widthMode: 1,
    heightMode: 1,
    width: 520,
    height: 412,
    xPositionMode: 1,
    yPositionMode: 1,
  });
  add(COMPONENT.FRAME, root, { widthMode: 1, heightMode: 1, width: 520, height: 412 });
  add(COMPONENT.CLOSE, root, {
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

  const header = (component, x, y, width, text) =>
    add(component, root, {
      type: TYPE_TEXT,
      rawX: x,
      rawY: y,
      rawWidth: width,
      rawHeight: 16,
      width,
      height: 16,
      text,
      fontId: FONT_BOLD,
      textColor: COLOUR_HEADER,
      textShadowed: true,
      yTextAlignment: 1,
    });

  const label = (component, x, y, width, overrides = {}) =>
    add(component, root, {
      type: TYPE_TEXT,
      rawX: x,
      rawY: y,
      rawWidth: width,
      rawHeight: 15,
      width,
      height: 15,
      text: "",
      fontId: FONT_SMALL,
      textColor: COLOUR_TEXT,
      textShadowed: true,
      yTextAlignment: 1,
      ...overrides,
    });

  const slot = (iconComponent, backgroundComponent, x, y, actions) => {
    add(backgroundComponent, root, {
      type: TYPE_RECTANGLE,
      rawX: x,
      rawY: y,
      rawWidth: 36,
      rawHeight: 32,
      width: 36,
      height: 32,
      filled: true,
      color: SLOT_BACKGROUND,
      mouseOverColor: SLOT_BACKGROUND,
      textColor: SLOT_BACKGROUND,
      opacity: 64,
    });
    add(iconComponent, root, {
      type: TYPE_GRAPHIC,
      rawX: x + 2,
      rawY: y + 2,
      rawWidth: 32,
      rawHeight: 28,
      width: 32,
      height: 28,
      itemQuantityMode: 2,
      borderType: 1,
      graphicShadow: 0x333333,
      shadowColor: 0x333333,
      text: "",
      ...(actions ? { actions, flags: FLAG_OP1 } : {}),
    });
  };

  const button = (component, x, y, width) => {
    add(component, root, {
      type: TYPE_RECTANGLE,
      rawX: x,
      rawY: y,
      rawWidth: width,
      rawHeight: 22,
      width,
      height: 22,
      filled: true,
      color: BUTTON_COLOUR,
      mouseOverColor: BUTTON_HOVER_COLOUR,
      textColor: BUTTON_COLOUR,
      opacity: 32,
      actions: ["Select"],
      flags: FLAG_OP1,
    });
    // Server-set label, so a button can say what it currently does.
    label(component + 50, x, y + 3, width, {
      xTextAlignment: 1,
      textColor: COLOUR_HEADER,
    });
  };

  // Preset lists.
  header(COMPONENT.GLOBAL_HEADER, 14, 26, 110, "Global presets");
  for (let row = 0; row < GLOBAL_ROW_COUNT; row++) {
    label(GLOBAL_ROW_START + row, 14, 44 + row * 19, 110, {
      textColor: COLOUR_MUTED,
      actions: ["Select"],
      flags: FLAG_OP1,
    });
  }
  header(COMPONENT.CUSTOM_HEADER, 132, 26, 110, "Your presets");
  for (let row = 0; row < CUSTOM_ROW_COUNT; row++) {
    label(CUSTOM_ROW_START + row, 132, 44 + row * 19, 110, {
      textColor: COLOUR_MUTED,
      actions: ["Select"],
      flags: FLAG_OP1,
    });
  }

  // Selected preset: name, combat levels, spellbook.
  header(COMPONENT.SELECTED_NAME, 256, 26, 110, "");
  for (let row = 0; row < STAT_ROW_COUNT; row++) {
    label(STAT_ROW_START + row, 256, 46 + row * 16, 110);
  }
  label(COMPONENT.SPELLBOOK, 256, 46 + STAT_ROW_COUNT * 16 + 4, 110, {
    textColor: COLOUR_MUTED,
  });

  // Equipment, then inventory.
  header(COMPONENT.EQUIPMENT_HEADER, 256, 186, 110, "Equipment");
  for (let index = 0; index < EQUIPMENT_SLOT_COUNT; index++) {
    const column = index % EQUIPMENT_COLUMNS;
    const row = Math.floor(index / EQUIPMENT_COLUMNS);
    slot(
      EQUIPMENT_SLOT_START + index,
      EQUIPMENT_BACKGROUND_START + index,
      256 + column * 38,
      204 + row * 34
    );
  }

  header(COMPONENT.INVENTORY_HEADER, 380, 26, 160, "Inventory");
  for (let index = 0; index < INVENTORY_SLOT_COUNT; index++) {
    const column = index % INVENTORY_COLUMNS;
    const row = Math.floor(index / INVENTORY_COLUMNS);
    slot(
      INVENTORY_SLOT_START + index,
      INVENTORY_BACKGROUND_START + index,
      380 + column * 38,
      44 + row * 34
    );
  }

  button(COMPONENT.CLEAR_BUTTON, 14, 384, 110);
  button(COMPONENT.DEATH_BUTTON, 132, 384, 110);
  button(COMPONENT.LOAD_BUTTON, 256, 384, 110);
  button(COMPONENT.SAVE_BUTTON, 380, 384, 110);

  return { groupId: GROUP_ID, widgets };
}

module.exports = {
  GROUP_ID,
  COMPONENT,
  GLOBAL_ROW_START,
  GLOBAL_ROW_COUNT,
  CUSTOM_ROW_START,
  CUSTOM_ROW_COUNT,
  INVENTORY_SLOT_START,
  INVENTORY_SLOT_COUNT,
  EQUIPMENT_SLOT_START,
  EQUIPMENT_SLOT_COUNT,
  STAT_ROW_START,
  STAT_ROW_COUNT,
  uid,
  buildPresetsWidgetGroup,
};
