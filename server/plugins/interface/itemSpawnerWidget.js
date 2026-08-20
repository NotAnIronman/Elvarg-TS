const GROUP_ID = 30002;
const SLOT_COUNT = 32;
const COLUMNS = 8;
const BACKGROUND_START = 20;
const ICON_START = 100;
const FLAG_OP1 = 1 << 1;
const FLAG_OP2 = 1 << 2;

const uid = (component) => (GROUP_ID << 16) | component;

function buildItemSpawnerWidgetGroup() {
  const widgets = [];
  const add = (component, parent, overrides = {}) => {
    const id = uid(component);
    widgets.push({
      uid: id,
      id,
      childIndex: -1,
      parentUid: parent,
      groupId: GROUP_ID,
      fileId: component,
      isIf3: true,
      type: 0,
      contentType: 0,
      rawX: 0,
      rawY: 0,
      rawWidth: 0,
      rawHeight: 0,
      widthMode: 0,
      heightMode: 0,
      xPositionMode: 0,
      yPositionMode: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scrollX: 0,
      scrollY: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      isHidden: false,
      hidden: false,
      cachedHidden: false,
      rootIndex: -1,
      cycle: -1,
      modelFrame: 0,
      modelFrameCycle: 0,
      aspectWidth: 1,
      aspectHeight: 1,
      itemId: -1,
      itemQuantity: 0,
      ...overrides,
    });
    return id;
  };

  const root = add(0, -1, {
    rawWidth: 18,
    rawHeight: 18,
    widthMode: 1,
    heightMode: 1,
    width: 520,
    height: 412,
    xPositionMode: 1,
    yPositionMode: 1,
  });
  add(1, root, { widthMode: 1, heightMode: 1, width: 520, height: 412 });
  add(2, root, {
    type: 4,
    rawX: 34,
    rawY: 62,
    rawWidth: 68,
    rawHeight: 20,
    widthMode: 1,
    width: 452,
    height: 20,
    text: "",
    fontId: 496,
    textColor: 0xffd27f,
    textShadowed: true,
    xTextAlignment: 1,
    yTextAlignment: 1,
    isHidden: true,
    hidden: true,
  });
  add(3, root, {
    type: 4,
    rawX: 34,
    rawY: 86,
    rawWidth: 68,
    rawHeight: 16,
    widthMode: 1,
    width: 452,
    height: 16,
    text: "",
    fontId: 494,
    textColor: 0xe8ded0,
    textShadowed: true,
    xTextAlignment: 1,
    yTextAlignment: 1,
    isHidden: true,
    hidden: true,
  });
  add(10, root, {
    type: 3,
    rawX: 34,
    rawY: 42,
    rawWidth: 68,
    rawHeight: 24,
    widthMode: 1,
    width: 452,
    height: 24,
    filled: true,
    color: 0x2b241b,
    mouseOverColor: 0x342b20,
    textColor: 0x2b241b,
    opacity: 32,
    actions: ["Edit"],
    flags: FLAG_OP1,
  });
  add(4, root, {
    type: 4,
    rawX: 44,
    rawY: 46,
    rawWidth: 58,
    rawHeight: 16,
    widthMode: 1,
    width: 432,
    height: 16,
    text: "",
    fontId: 494,
    textColor: 0xe8ded0,
    textShadowed: true,
    yTextAlignment: 1,
    actions: ["Edit"],
    flags: FLAG_OP1,
  });
  add(6, root, {
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
  add(5, root, {
    type: 4,
    rawX: 34,
    rawY: 70,
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

  const results = add(8, root, {
    rawX: 34,
    rawY: 94,
    rawWidth: 432,
    rawHeight: 140,
    width: 432,
    height: 140,
    scrollWidth: 432,
    scrollHeight: 140,
  });
  add(9, root, {
    rawX: 470,
    rawY: 94,
    rawWidth: 16,
    rawHeight: 140,
    width: 16,
    height: 140,
    noClickThrough: true,
  });

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const column = slot % COLUMNS;
    const row = Math.floor(slot / COLUMNS);
    add(BACKGROUND_START + slot, results, {
      type: 3,
      rawX: 56 + column * 40,
      rawY: row * 44,
      rawWidth: 40,
      rawHeight: 36,
      width: 40,
      height: 36,
      filled: true,
      color: 0x241e16,
      mouseOverColor: 0x241e16,
      textColor: 0x241e16,
      opacity: 64,
      isHidden: true,
      hidden: true,
    });
    add(ICON_START + slot, results, {
      type: 5,
      rawX: 58 + column * 40,
      rawY: 2 + row * 44,
      rawWidth: 36,
      rawHeight: 32,
      width: 36,
      height: 32,
      itemQuantityMode: 2,
      borderType: 1,
      graphicShadow: 0x333333,
      shadowColor: 0x333333,
      text: "",
      // actions[i] is op i+1 client-side (inferWidgetOpId), and each op needs its
      // transmit bit set in flags or the client will not send the click.
      actions: ["Spawn", "Spawn X"],
      flags: FLAG_OP1 | FLAG_OP2,
      isHidden: true,
      hidden: true,
    });
  }

  add(7, root, {
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

  if (widgets.length !== 75) throw new Error("Invalid item spawner widget group");
  return { groupId: GROUP_ID, widgets };
}

module.exports = {
  GROUP_ID,
  ICON_START,
  SLOT_COUNT,
  uid,
  buildItemSpawnerWidgetGroup,
};
