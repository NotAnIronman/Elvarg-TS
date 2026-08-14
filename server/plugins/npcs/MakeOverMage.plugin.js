const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");

// OpenRune cache name: interface.makeover_mage.
const MAKEOVER_INTERFACE_ID = 205;

// 8487 exists in the Java reference as MAKEOVER_MAGE_3 but is missing in the TS enum.
const MAKEOVER_NPC_IDS = [
  NpcIdentifiers.MAKE_OVER_MAGE,
  NpcIdentifiers.MAKE_OVER_MAGE_2,
  8487,
].filter((id) => Number.isInteger(id));

const MAKEOVER_NPC_ID_SET = new Set(MAKEOVER_NPC_IDS);

function openMakeoverInterface(player) {
  if (!player || typeof player.getPacketSender !== "function") {
    return;
  }
  player.getPacketSender().sendInterfaceRemoval().sendInterface(MAKEOVER_INTERFACE_ID);
  player.getAppearance?.().setCanChangeAppearance?.(true);
}

module.exports = {
  name: "MakeOverMage",
  register(api) {
    api.onNpcFirstClick(MAKEOVER_NPC_IDS, function openMakeover(event) {
      openMakeoverInterface(event.player);
      event.handled = true;
      return true;
    });

    api.log("registered", {
      npcIds: MAKEOVER_NPC_IDS,
      interfaceId: MAKEOVER_INTERFACE_ID,
    });
  },
};
