/**
 * Quest content bindings.
 *
 * Quest state and dialogue remain in the existing TypeScript quest model;
 * this plugin only connects that model to Elvarg's NPC and interface events.
 */

const QUEST_LIST_GROUP_ID = 399;
const QUEST_LIST_ENTRY_CHILD_ID = 7;
const QUEST_LIST_READ_ACTION = 2;

let QuestHandler;
let NpcIdentifiers;

module.exports = {
  name: "Quests",

  register(api) {
    QuestHandler = require("../../src/main/typescript/elvarg/game/content/quests/QuestHandler").QuestHandler;
    NpcIdentifiers = require("../../src/main/typescript/elvarg/util/NpcIdentifiers").NpcIdentifiers;

    api.onNpcFirstClick(NpcIdentifiers.COOK, function talkToQuestNpc(event) {
      if (QuestHandler.firstClickNpc(event.player, event.npc)) {
        event.handled = true;
        return true;
      }
      return false;
    });

    api.onInterfaceActionClick(function handleQuestJournalClick(event) {
      if (
        event.groupId !== QUEST_LIST_GROUP_ID ||
        event.childId !== QUEST_LIST_ENTRY_CHILD_ID ||
        event.action !== QUEST_LIST_READ_ACTION
      ) {
        return;
      }

      if (QuestHandler.handleQuestListClick(event.player, event.slot, event.action)) {
        event.handled = true;
      }
    });

    api.log("registered", {
      questNpcIds: [NpcIdentifiers.COOK],
      questListGroupId: QUEST_LIST_GROUP_ID,
    });
  },
};
