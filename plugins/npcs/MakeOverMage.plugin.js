const { Appearance } = require("../../src/main/typescript/elvarg/game/model/Appearance");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");

const MAKEOVER_INTERFACE_ID = 3559;

// 8487 exists in the Java reference as MAKEOVER_MAGE_3 but is missing in the TS enum.
const MAKEOVER_NPC_IDS = [
  NpcIdentifiers.MAKE_OVER_MAGE,
  NpcIdentifiers.MAKE_OVER_MAGE_2,
  8487,
].filter((id) => Number.isInteger(id));

const MAKEOVER_NPC_ID_SET = new Set(MAKEOVER_NPC_IDS);

const CLOSE_BUTTON_IDS = new Set([18247, 38117, 16999]);
const MAKEOVER_CONTENT_TYPE_BUTTON_IDS = new Set([324, 325, 326]);

const ALLOWED_COLORS = [
  [0, 11], // hair color
  [0, 15], // torso color
  [0, 15], // legs color
  [0, 5], // feet color
  [0, 7], // skin color
];

const FEMALE_VALUES = [
  [45, 54], // head
  [-1, -1], // jaw
  [56, 60], // torso
  [61, 65], // arms
  [67, 68], // hands
  [70, 77], // legs
  [79, 80], // feet
];

const MALE_VALUES = [
  [0, 8], // head
  [10, 17], // jaw
  [18, 25], // torso
  [26, 31], // arms
  [33, 34], // hands
  [36, 40], // legs
  [42, 43], // feet
];

function openMakeoverInterface(player) {
  if (!player || typeof player.getPacketSender !== "function") {
    return;
  }
  player.getPacketSender().sendInterfaceRemoval().sendInterface(MAKEOVER_INTERFACE_ID);
  player.getAppearance?.().setCanChangeAppearance?.(true);
}

function isMakeoverSession(player) {
  if (!player) {
    return false;
  }
  if (player.getInterfaceId?.() === MAKEOVER_INTERFACE_ID) {
    return true;
  }
  return player.getAppearance?.().getCanChangeAppearance?.() === true;
}

function clampAppearanceValues(gender, packet) {
  const values = new Array(MALE_VALUES.length);
  for (let i = 0; i < values.length; i++) {
    const allowed = gender === 0 ? MALE_VALUES[i] : FEMALE_VALUES[i];
    const min = allowed[0];
    const max = allowed[1];
    let value = packet.readByte();
    if (value < min || value > max) {
      value = min;
    }
    values[i] = value;
  }
  return values;
}

function clampColorValues(packet) {
  const values = new Array(ALLOWED_COLORS.length);
  for (let i = 0; i < values.length; i++) {
    const min = ALLOWED_COLORS[i][0];
    const max = ALLOWED_COLORS[i][1];
    let value = packet.readByte();
    if (value < min || value > max) {
      value = min;
    }
    values[i] = value;
  }
  return values;
}

function applyAppearance(player, packet) {
  try {
    const gender = packet.readByte();
    if (gender !== 0 && gender !== 1) {
      return;
    }

    const appearances = clampAppearanceValues(gender, packet);
    const colors = clampColorValues(packet);

    if (
      player.getAppearance().getCanChangeAppearance() &&
      player.getInterfaceId() > 0
    ) {
      player.getAppearance().setLook(Appearance.GENDER, gender);
      player.getAppearance().setLook(Appearance.HEAD, appearances[0]);
      player.getAppearance().setLook(Appearance.CHEST, appearances[2]);
      player.getAppearance().setLook(Appearance.ARMS, appearances[3]);
      player.getAppearance().setLook(Appearance.HANDS, appearances[4]);
      player.getAppearance().setLook(Appearance.LEGS, appearances[5]);
      player.getAppearance().setLook(Appearance.FEET, appearances[6]);
      player.getAppearance().setLook(Appearance.BEARD, appearances[1]);
      player.getAppearance().setLook(Appearance.HAIR_COLOUR, colors[0]);
      player.getAppearance().setLook(Appearance.TORSO_COLOUR, colors[1]);
      player.getAppearance().setLook(Appearance.LEG_COLOUR, colors[2]);
      player.getAppearance().setLook(Appearance.FEET_COLOUR, colors[3]);
      player.getAppearance().setLook(Appearance.SKIN_COLOUR, colors[4]);
      player.getUpdateFlag().flag(Flag.APPEARANCE);
    }
  } catch (_err) {
    player.getAppearance().set();
  }

  player.getPacketSender().sendInterfaceRemoval();
  player.getAppearance().setCanChangeAppearance(false);
}

function handleMakeoverButton(player, button) {
  if (!isMakeoverSession(player)) {
    return false;
  }

  if (CLOSE_BUTTON_IDS.has(button)) {
    player.getPacketSender().sendInterfaceRemoval();
    return true;
  }

  if (
    MAKEOVER_CONTENT_TYPE_BUTTON_IDS.has(button) ||
    (button >= 300 && button <= 323)
  ) {
    // Client handles preview/selection for these widgets; keep makeover session alive.
    player.getAppearance()?.setCanChangeAppearance?.(true);
    return true;
  }

  return false;
}

module.exports = {
  name: "MakeOverMage",
  register(api) {
    api.onNpcInteraction((event) => {
      if (event.clickType !== 1 || !MAKEOVER_NPC_ID_SET.has(event.npcId)) {
        return;
      }
      openMakeoverInterface(event.player);
      event.handled = true;
    });

    api.onButtonClick((event) => {
      if (handleMakeoverButton(event.player, event.buttonId)) {
        event.handled = true;
      }
    });

    api.registerAlivePacketListener(PacketConstants.CHANGE_APPEARANCE, {
      execute(player, packet) {
        applyAppearance(player, packet);
      },
    });

    api.log("registered", {
      npcIds: MAKEOVER_NPC_IDS,
      interfaceId: MAKEOVER_INTERFACE_ID,
    });
  },
};
