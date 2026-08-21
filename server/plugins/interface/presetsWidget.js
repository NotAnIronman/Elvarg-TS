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
const EQUIPMENT_COLUMNS = 4;
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

// The cache frame draws a border and title bar over the group, so content lives inside
// roughly x 8..512, y 26..390 of the 520x412 modal. Anything past that is clipped.
const LEFT_X = 8;
const CUSTOM_X = 112;
const MIDDLE_X = 220;
const INVENTORY_X = 352;
const COLUMN_WIDTH = 100;
const MIDDLE_WIDTH = 124;
const INVENTORY_WIDTH = 152;
const HEADER_Y = 26;
const ROW_Y = 44;
const ROW_PITCH = 17;
const STAT_Y = 46;
const STAT_PITCH = 16;
const EQUIPMENT_HEADER_Y = 186;
const EQUIPMENT_Y = 204;
const EQUIPMENT_CELL = { width: 30, height: 30 };
const INVENTORY_CELL = { width: 38, height: 32 };
const BUTTON_Y = 344;
const BUTTON_HEIGHT = 22;

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

  const slot = (iconComponent, backgroundComponent, x, y, size) => {
    add(backgroundComponent, root, {
      type: TYPE_RECTANGLE,
      rawX: x,
      rawY: y,
      rawWidth: size.width,
      rawHeight: size.height,
      width: size.width,
      height: size.height,
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
      rawWidth: size.width - 4,
      rawHeight: size.height - 4,
      width: size.width - 4,
      height: size.height - 4,
      itemQuantityMode: 2,
      borderType: 1,
      graphicShadow: 0x333333,
      shadowColor: 0x333333,
      text: "",
    });
  };

  const button = (component, x, y, width) => {
    add(component, root, {
      type: TYPE_RECTANGLE,
      rawX: x,
      rawY: y,
      rawWidth: width,
      rawHeight: BUTTON_HEIGHT,
      width,
      height: BUTTON_HEIGHT,
      filled: true,
      color: BUTTON_COLOUR,
      mouseOverColor: BUTTON_HOVER_COLOUR,
      textColor: BUTTON_COLOUR,
      opacity: 32,
      actions: ["Select"],
      flags: FLAG_OP1,
    });
    // Server-set label, so a button can say what it currently does.
    label(component + 50, x, y + 4, width, {
      xTextAlignment: 1,
      textColor: COLOUR_HEADER,
    });
  };

  // Two columns of preset names down the left.
  header(COMPONENT.GLOBAL_HEADER, LEFT_X, HEADER_Y, COLUMN_WIDTH, "Global presets");
  for (let row = 0; row < GLOBAL_ROW_COUNT; row++) {
    label(GLOBAL_ROW_START + row, LEFT_X, ROW_Y + row * ROW_PITCH, COLUMN_WIDTH, {
      textColor: COLOUR_MUTED,
      actions: ["Select"],
      flags: FLAG_OP1,
    });
  }
  header(COMPONENT.CUSTOM_HEADER, CUSTOM_X, HEADER_Y, COLUMN_WIDTH, "Your presets");
  for (let row = 0; row < CUSTOM_ROW_COUNT; row++) {
    label(CUSTOM_ROW_START + row, CUSTOM_X, ROW_Y + row * ROW_PITCH, COLUMN_WIDTH, {
      textColor: COLOUR_MUTED,
      actions: ["Select"],
      flags: FLAG_OP1,
    });
  }

  // Middle column: the selected preset's name, combat levels, spellbook and equipment.
  header(COMPONENT.SELECTED_NAME, MIDDLE_X, HEADER_Y, MIDDLE_WIDTH, "");
  for (let row = 0; row < STAT_ROW_COUNT; row++) {
    label(STAT_ROW_START + row, MIDDLE_X, STAT_Y + row * STAT_PITCH, MIDDLE_WIDTH);
  }
  label(COMPONENT.SPELLBOOK, MIDDLE_X, STAT_Y + STAT_ROW_COUNT * STAT_PITCH + 4, MIDDLE_WIDTH, {
    textColor: COLOUR_MUTED,
  });
  header(COMPONENT.EQUIPMENT_HEADER, MIDDLE_X, EQUIPMENT_HEADER_Y, MIDDLE_WIDTH, "Equipment");
  for (let index = 0; index < EQUIPMENT_SLOT_COUNT; index++) {
    const column = index % EQUIPMENT_COLUMNS;
    const row = Math.floor(index / EQUIPMENT_COLUMNS);
    slot(
      EQUIPMENT_SLOT_START + index,
      EQUIPMENT_BACKGROUND_START + index,
      MIDDLE_X + column * EQUIPMENT_CELL.width,
      EQUIPMENT_Y + row * EQUIPMENT_CELL.height,
      EQUIPMENT_CELL
    );
  }

  // Right column: the selected preset's inventory.
  header(COMPONENT.INVENTORY_HEADER, INVENTORY_X, HEADER_Y, INVENTORY_WIDTH, "Inventory");
  for (let index = 0; index < INVENTORY_SLOT_COUNT; index++) {
    const column = index % INVENTORY_COLUMNS;
    const row = Math.floor(index / INVENTORY_COLUMNS);
    slot(
      INVENTORY_SLOT_START + index,
      INVENTORY_BACKGROUND_START + index,
      INVENTORY_X + column * INVENTORY_CELL.width,
      ROW_Y + row * INVENTORY_CELL.height,
      INVENTORY_CELL
    );
  }

  button(COMPONENT.CLEAR_BUTTON, LEFT_X, BUTTON_Y, COLUMN_WIDTH);
  button(COMPONENT.DEATH_BUTTON, CUSTOM_X, BUTTON_Y, COLUMN_WIDTH);
  button(COMPONENT.LOAD_BUTTON, MIDDLE_X, BUTTON_Y, MIDDLE_WIDTH);
  button(COMPONENT.SAVE_BUTTON, INVENTORY_X, BUTTON_Y, INVENTORY_WIDTH);

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
