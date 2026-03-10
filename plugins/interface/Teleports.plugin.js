const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { TeleportHandler } = require("../../src/main/typescript/elvarg/game/model/teleportation/TeleportHandler");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const {
  createHotspotAnchorLocation,
  getEnabledWildernessHotspots,
} = require("../bots/behaviours/pvp/WildernessHotspotRegistry.js");

const HOME_TELEPORT_BUTTON_IDS = new Set([19210, 21741]);
const TRAINING_TELEPORT_BUTTON_IDS = new Set([1164, 13035, 30064]);
const PVP_TELEPORT_BUTTON_IDS = new Set([1170, 13053, 30083]);
const PVP_DIALOGUE_OPTION_BUTTON_IDS = new Set([
  2494, 2495, 2496, 2497, 2498,
  2482, 2483, 2484, 2485,
]);
const ATTR_PVP_TELEPORT_PAGE = "teleports:pvp_page";

// Approximate Chaos Temple surface location matching the current bot hotspot anchor.
const TRAINING_TELEPORT_DESTINATION = new Location(2955, 3816, 0);

function sendFiveOptionDialogue(player, title, options) {
  player.getPacketSender().sendString(title, 2493);
  for (let i = 0; i < 5; i++) {
    player.getPacketSender().sendString(options[i] ?? "", 2494 + i);
  }
  player.getPacketSender().sendChatboxInterface(2492);
}

function closePvPTeleportDialogue(player) {
  player.setAttribute(ATTR_PVP_TELEPORT_PAGE, null);
  player.getPacketSender().sendInterfaceRemoval();
}

function getPvPTeleportPages() {
  const hotspotOrder = [
    "edge_ditch",
    "varrock_ditch",
    "revs_entrance",
    "green_drags_gate",
  ];
  const hotspotsById = new Map(
    getEnabledWildernessHotspots().map((hotspot) => [hotspot.id, hotspot])
  );
  const orderedHotspots = hotspotOrder
    .map((id) => hotspotsById.get(id))
    .filter(Boolean);

  return [
    {
      title: "PvP hotspots",
      options: [
        { label: "Edge Ditch", hotspot: orderedHotspots.find((h) => h.id === "edge_ditch") ?? null },
        { label: "Varrock Ditch (F2P)", hotspot: orderedHotspots.find((h) => h.id === "varrock_ditch") ?? null },
        { label: "Revs Entrance", hotspot: orderedHotspots.find((h) => h.id === "revs_entrance") ?? null },
        { label: "Green Dragons", hotspot: orderedHotspots.find((h) => h.id === "green_drags_gate") ?? null },
        { label: "More options", nextPage: 1 },
      ],
    },
    {
      title: "PvP hotspots",
      options: [
        { label: "Back", nextPage: 0 },
        { label: "Close", close: true },
        null,
        null,
        null,
      ],
    },
  ];
}

function openPvPTeleportDialogue(player, pageIndex = 0) {
  const pages = getPvPTeleportPages();
  const page = pages[pageIndex] ?? pages[0];
  player.setAttribute(ATTR_PVP_TELEPORT_PAGE, pageIndex);
  sendFiveOptionDialogue(
    player,
    page.title,
    page.options.map((option) => option?.label ?? "")
  );
}

function handlePvPTeleportOption(player, buttonId) {
  const pageIndex = Number(player.getAttribute(ATTR_PVP_TELEPORT_PAGE));
  if (!Number.isFinite(pageIndex)) {
    return false;
  }

  const optionButtonIds = [2494, 2495, 2496, 2497, 2498, 2482, 2483, 2484, 2485];
  const optionIndex = optionButtonIds.indexOf(Number(buttonId));
  if (optionIndex === -1) {
    return false;
  }

  const page = getPvPTeleportPages()[pageIndex];
  const option = page?.options?.[optionIndex];
  if (!option) {
    closePvPTeleportDialogue(player);
    return true;
  }

  if (option.close) {
    closePvPTeleportDialogue(player);
    return true;
  }

  if (Number.isInteger(option.nextPage)) {
    openPvPTeleportDialogue(player, option.nextPage);
    return true;
  }

  if (!option.hotspot) {
    closePvPTeleportDialogue(player);
    return true;
  }

  const destination = createHotspotAnchorLocation(option.hotspot);
  closePvPTeleportDialogue(player);
  if (!destination || !TeleportHandler.checkReqs(player, destination)) {
    return true;
  }

  TeleportHandler.teleport(
    player,
    destination,
    player.getSpellbook().getTeleportType(),
    false
  );
  return true;
}

function handleTeleportButton(player, buttonId) {
  if (!player) {
    return false;
  }

  const numericButtonId = Number(buttonId);
  if (HOME_TELEPORT_BUTTON_IDS.has(numericButtonId)) {
    if (!TeleportHandler.checkReqs(player, GameConstants.DEFAULT_LOCATION)) {
      return true;
    }

    TeleportHandler.teleport(
      player,
      GameConstants.DEFAULT_LOCATION,
      player.getSpellbook().getTeleportType(),
      false
    );
    return true;
  }

  if (PVP_TELEPORT_BUTTON_IDS.has(numericButtonId)) {
    openPvPTeleportDialogue(player, 0);
    return true;
  }

  if (PVP_DIALOGUE_OPTION_BUTTON_IDS.has(numericButtonId)) {
    return handlePvPTeleportOption(player, numericButtonId);
  }

  if (!TRAINING_TELEPORT_BUTTON_IDS.has(numericButtonId)) {
    return false;
  }

  if (!TeleportHandler.checkReqs(player, TRAINING_TELEPORT_DESTINATION)) {
    return true;
  }

  TeleportHandler.teleport(
    player,
    TRAINING_TELEPORT_DESTINATION,
    player.getSpellbook().getTeleportType(),
    false
  );
  return true;
}

module.exports = {
  name: "Teleports",
  register(api) {
    const allTeleportButtonIds = [
      ...HOME_TELEPORT_BUTTON_IDS,
      ...PVP_TELEPORT_BUTTON_IDS,
      ...PVP_DIALOGUE_OPTION_BUTTON_IDS,
      ...TRAINING_TELEPORT_BUTTON_IDS,
    ];

    api.onButton(allTeleportButtonIds, ({ player, buttonId }) =>
      handleTeleportButton(player, buttonId)
    );

    api.onInterfaceActionButton(
      allTeleportButtonIds,
      ({ player, buttonId }) => handleTeleportButton(player, buttonId)
    );
  },
};
