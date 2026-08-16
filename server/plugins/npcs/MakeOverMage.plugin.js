const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");
const { DialogueChainBuilder } = require("../../src/main/typescript/elvarg/game/model/dialogues/builders/DialogueChainBuilder");
const { NpcDialogue } = require("../../src/main/typescript/elvarg/game/model/dialogues/entries/impl/NpcDialogue");
const { EndDialogue } = require("../../src/main/typescript/elvarg/game/model/dialogues/entries/impl/EndDialogue");

const MAKEOVER_INTERFACE_ID = 679;
const MAIN_MODAL_TARGET_UID = (161 << 16) | 16;

const MAKEOVER_NPC_IDS = [
  NpcIdentifiers.MAKEOVER_MAGE,
  NpcIdentifiers.MAKEOVER_MAGE_2,
  NpcIdentifiers.MAKEOVER_MAGE_3,
].filter((id) => Number.isInteger(id));

function startMakeoverDialogue(player, npcId) {
  const dialogue = new DialogueChainBuilder().add(
    new NpcDialogue(0, npcId, "Hello! I can change your appearance. Choose Makeover when you're ready."),
    new EndDialogue(1),
  );
  player.getDialogueManager().startDialogues(dialogue);
}

function openMakeoverInterface(player) {
  if (!player || typeof player.getPacketSender !== "function") {
    return false;
  }
  player.getPacketSender().sendInterfaceRemoval();
  player.setInterfaceId?.(MAKEOVER_INTERFACE_ID);
  player.getAppearance?.().setCanChangeAppearance?.(true);
  player.getPacketSender().sendSubInterface(MAIN_MODAL_TARGET_UID, MAKEOVER_INTERFACE_ID, 0);
  return true;
}

module.exports = {
  name: "MakeOverMage",
  register(api) {
    api.onNpcFirstClick(MAKEOVER_NPC_IDS, function talkToMakeoverMage(event) {
      startMakeoverDialogue(event.player, event.npcId);
      event.handled = true;
      return true;
    });

    function openMakeover(event) {
      if (!openMakeoverInterface(event.player)) {
        return false;
      }
      event.handled = true;
      return true;
    }
    api.onNpcThirdClick(NpcIdentifiers.MAKEOVER_MAGE_3, openMakeover);
    api.onNpcFourthClick([
      NpcIdentifiers.MAKEOVER_MAGE,
      NpcIdentifiers.MAKEOVER_MAGE_2,
    ], openMakeover);

    api.log("registered", {
      npcIds: MAKEOVER_NPC_IDS,
      interfaceId: MAKEOVER_INTERFACE_ID,
    });
  },
};
