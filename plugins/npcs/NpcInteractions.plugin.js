const fs = require("fs");
const path = require("path");

const { openShopById } = require("../interface/Shops.plugin.js");

const INTERACTIONS_PATH = path.resolve(
  __dirname,
  "../../data/definitions/npc_interactions.json"
);

let interactionsByNpcId = new Map();

function readOptionalId(value, property, context) {
  if (value === undefined) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    console.warn(
      `[npc-interactions] Ignoring invalid ${property} at ${context}; expected a non-negative integer.`
    );
    return null;
  }
  return value;
}

function normalizeAction(value, context) {
  if (value === undefined) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    console.warn(
      `[npc-interactions] Ignoring invalid action at ${context}; expected an object.`
    );
    return null;
  }

  const shopId = readOptionalId(value.shop_id, "shop_id", context);
  const dialogueId = readOptionalId(value.dialogue_id, "dialogue_id", context);
  if (shopId === null && dialogueId === null) {
    return null;
  }

  return { shopId, dialogueId };
}

function loadInteractions() {
  const parsed = JSON.parse(fs.readFileSync(INTERACTIONS_PATH, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("npc_interactions.json must contain an object keyed by NPC id.");
  }

  const next = new Map();
  for (const [rawNpcId, value] of Object.entries(parsed)) {
    const npcId = Number(rawNpcId);
    if (!Number.isInteger(npcId) || npcId < 0) {
      console.warn(
        `[npc-interactions] Ignoring invalid NPC id key "${rawNpcId}".`
      );
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      console.warn(
        `[npc-interactions] Ignoring NPC ${npcId}; expected an object.`
      );
      continue;
    }

    const firstClick = normalizeAction(
      value.first_click,
      `${npcId}.first_click`
    );
    const secondClick = normalizeAction(
      value.second_click,
      `${npcId}.second_click`
    );
    if (firstClick || secondClick) {
      next.set(npcId, { firstClick, secondClick });
    }
  }

  interactionsByNpcId = next;
  console.info(
    `[npc-interactions] Loaded ${interactionsByNpcId.size} NPC interaction definitions.`
  );
}

function handleAction(player, action) {
  if (action.shopId !== null && openShopById(player, action.shopId, true)) {
    return true;
  }

  if (action.dialogueId !== null) {
    return player
      .getDialogueManager()
      .startStaticDialogue(action.dialogueId);
  }

  return false;
}

module.exports = {
  name: "NpcInteractions",
  dependsOn: ["Shops"],

  register(api) {
    loadInteractions();

    api.onNpcInteractionPre((event) => {
      const interaction = interactionsByNpcId.get(event.npcId);
      if (!interaction) {
        return;
      }

      const action =
        event.clickType === 1
          ? interaction.firstClick
          : event.clickType === 2
            ? interaction.secondClick
            : null;

      if (action && handleAction(event.player, action)) {
        event.handled = true;
      }
    });
  },
};
