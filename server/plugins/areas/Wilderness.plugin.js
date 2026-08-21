const { Wilderness } = require("../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { Obelisks } = require("../../src/main/typescript/elvarg/game/content/Obelisks");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

// ---------------------------------------------------------------------------
// pvp_icons overlay (OSRS interface 90)
// ---------------------------------------------------------------------------

// Mounted permanently like every other gameframe overlay. The wilderness level text
// (90:50) is written by the cache's own script 388, which derives the level from the
// player's coordinates - the server sends no text for it.
const PVP_ICONS_TARGET_UID = (161 << 16) | 3; // component.toplevel_osrs_stretch:pvp_icons
const PVP_ICONS_INTERFACE = 90;
// pvp_icons:icons_dodger, the block's outermost container. Deliberately not its child
// icons (90:44): cache script 386 re-runs on a timer and unhides 90:44 every time, so a
// hide sent there is undone within a tick. Nothing in the cache touches 90:43, and the
// client skips a subtree whose ancestor is hidden.
const PVP_ICONS_UID = (90 << 16) | 43;
const PVPW_SAFE_UID = (90 << 16) | 47;
// ponytail: the client has no "gameframe ready" packet, so the login mount is simply
// retried a few ticks later; raise this if it still loses the race on slow clients.
const MOUNT_RETRY_TICKS = 3;

// ---------------------------------------------------------------------------
// Attack policy
// ---------------------------------------------------------------------------

const TELEPORT_BLOCK_LEVEL = 20;

function wildernessLevelOf(player) {
  const level = player?.getWildernessLevel?.() | 0;
  return level > 0 ? level : 0;
}

function shareClanChat(attacker, target) {
  if (!attacker || !target || attacker === target) {
    return false;
  }
  const attackerClan = attacker.getCurrentClanChat?.();
  const targetClan = target.getCurrentClanChat?.();
  return attackerClan != null && attackerClan === targetClan;
}

// ---------------------------------------------------------------------------
// Location tracking
// ---------------------------------------------------------------------------

function createState() {
  return {
    // player -> { x, y, z, inWilderness }, doubles as the tile cache for attack checks
    tiles: new Map(),
    // player -> ticks left before the login mount is re-sent
    pendingMount: new Map(),
  };
}

function readPlayerTile(player) {
  const location = player?.getLocation?.();
  const tile = Location.readTile(location);
  if (!location || !tile) {
    return null;
  }
  return { location, ...tile };
}

function isInWilderness(state, player) {
  if (!player) {
    return false;
  }
  if (wildernessLevelOf(player) > 0) {
    return true;
  }
  const cached = state.tiles.get(player);
  const tile = readPlayerTile(player);
  if (tile && Location.isSameTile(cached, tile) && typeof cached?.inWilderness === "boolean") {
    return cached.inWilderness;
  }
  if (!tile && cached && typeof cached.inWilderness === "boolean") {
    return cached.inWilderness;
  }
  const inWilderness = tile
    ? Wilderness.isInLocation(tile.location)
    : Wilderness.isIn(player);
  state.tiles.set(player, { ...cached, ...(tile ?? {}), inWilderness });
  return inWilderness;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const lastIconsVisible = new WeakMap();

function mountPvpIcons(player) {
  if (!player || player?.isPlayerBot?.() === true) {
    return;
  }
  const sender = player.getPacketSender();
  sender.sendSubInterface(PVP_ICONS_TARGET_UID, PVP_ICONS_INTERFACE, 1);
  // Cache script 386 leaves the "safe area" badge opaque everywhere outside the Clan Wars
  // arena, so keep it hidden until safe zones are actually configured.
  sender.sendInterfaceDisplayState(PVPW_SAFE_UID, true);
  // A fresh mount resets the group's widgets to their cache defaults.
  lastIconsVisible.delete(player);
  syncPvpIcons(player);
}

// Nothing outside the wilderness is wired up yet (skull timer, attack style, PvP worlds),
// so the server keeps the whole block hidden unless the player has a wilderness level.
// Driven off the level itself rather than an entry/exit edge: every tick reconverges, so a
// teleport, a login or a missed transition can't strand the block on screen.
function syncPvpIcons(player) {
  if (!player || player?.isPlayerBot?.() === true) {
    return;
  }
  const visible = wildernessLevelOf(player) > 0;
  if (lastIconsVisible.get(player) === visible) {
    return;
  }
  lastIconsVisible.set(player, visible);
  player.getPacketSender().sendInterfaceDisplayState(PVP_ICONS_UID, !visible);
}

function refreshWildernessUi(player, tile, inWilderness) {
  if (!player || player?.isPlayerBot?.() === true || !tile) {
    return;
  }

  if (inWilderness) {
    player.getPacketSender().sendInteractionOption("Attack", 2, true);

    const level = Wilderness.levelForY(tile.y);
    if (player.getWildernessLevel() !== level) {
      player.setWildernessLevel(level);
    }

    const multiIcon = Wilderness.isMulti(tile.x, tile.y) ? 1 : 0;
    if (player.getMultiIcon() !== multiIcon) {
      player.setMultiIcon(multiIcon);
    }
    return;
  }

  player.getPacketSender().sendInteractionOption("null", 2, true);

  if (player.getWildernessLevel() !== 0) {
    player.setWildernessLevel(0);
  }
  if (player.getMultiIcon() !== 0) {
    player.setMultiIcon(0);
  }
}

// ---------------------------------------------------------------------------
// Hook handlers
// ---------------------------------------------------------------------------

// World only emits this for real players - bots never reach any of it, which is why the
// combat rules derive a level from the tile instead of trusting the stored one.
function onPlayerProcess(state, player) {
  retryPendingMount(state, player);
  syncPvpIcons(player);

  const tile = readPlayerTile(player);
  if (!tile) {
    return;
  }
  const previous = state.tiles.get(player);
  if (Location.isSameTile(previous, tile) && typeof previous.inWilderness === "boolean") {
    return;
  }

  const inWilderness = Wilderness.isInLocation(tile.location);
  const wasInWilderness = previous?.inWilderness === true;

  if (inWilderness) {
    enterWilderness(player, tile, wasInWilderness);
  } else {
    leaveWilderness(player, tile, wasInWilderness);
  }

  state.tiles.set(player, {
    ...previous,
    x: tile.x,
    y: tile.y,
    z: tile.z,
    inWilderness,
  });
}

function enterWilderness(player, tile, wasInWilderness) {
  // Reassert wilderness UI while moving in wild; other interface/setup packets can clear
  // the attack option after entry. This also stores the level and multi icon.
  refreshWildernessUi(player, tile, true);
  if (!wasInWilderness) {
    // Covers a login that lost the race with the client's gameframe bootstrap.
    mountPvpIcons(player);
  }
}

function leaveWilderness(player, tile, wasInWilderness) {
  if (wasInWilderness) {
    refreshWildernessUi(player, tile, false);
    return;
  }

  if (player.getWildernessLevel() !== 0) {
    player.setWildernessLevel(0);
  }
  if (player.getMultiIcon() !== 0) {
    player.setMultiIcon(0);
  }
}

function retryPendingMount(state, player) {
  const retryIn = state.pendingMount.get(player);
  if (retryIn === undefined) {
    return;
  }
  if (retryIn > 0) {
    state.pendingMount.set(player, retryIn - 1);
    return;
  }
  state.pendingMount.delete(player);
  mountPvpIcons(player);
}

function onPlayerLogin(state, player) {
  if (player?.isPlayerBot?.() === true) {
    return;
  }
  // The mount is sent twice: now, and again once the client has had time to build its
  // gameframe - a login inside the wilderness otherwise shows no overlay at all.
  state.pendingMount.set(player, MOUNT_RETRY_TICKS);

  const tile = readPlayerTile(player);
  if (!tile) {
    return;
  }
  const inWilderness = Wilderness.isInLocation(tile.location);
  state.tiles.set(player, { x: tile.x, y: tile.y, z: tile.z, inWilderness });
  refreshWildernessUi(player, tile, inWilderness);
  mountPvpIcons(player);
}

function onPlayerDisconnect(state, player) {
  state.tiles.delete(player);
  state.pendingMount.delete(player);
}

function onCanAttack(state, event) {
  if (event.allow !== null) {
    return;
  }
  const { attacker, target } = event;
  if (!attacker?.isPlayer?.() || !target?.isPlayer?.()) {
    return;
  }

  if (shareClanChat(attacker, target)) {
    attacker
      .getPacketSender?.()
      .sendMessage?.("You cannot attack a player who is in your clan chat.");
    event.allow = false;
    return;
  }

  const attackerInWild = isInWilderness(state, attacker);
  const targetInWild = isInWilderness(state, target);
  if (attackerInWild && targetInWild) {
    event.allow = true;
  } else if (attackerInWild || targetInWild) {
    // One side in the Wilderness and one outside is never a fight; neither side in it is
    // somebody else's rule to make (duel arena, minigames).
    event.allow = false;
  }
}

function onCanTeleport(state, event) {
  if (event.allow !== null) {
    return;
  }
  const { player } = event;
  if (!isInWilderness(state, player)) {
    return;
  }
  if (
    wildernessLevelOf(player) > TELEPORT_BLOCK_LEVEL &&
    player.getRights() !== PlayerRights.DEVELOPER
  ) {
    player
      .getPacketSender()
      .sendMessage("Teleport spells are blocked in this level of Wilderness.");
    player
      .getPacketSender()
      .sendMessage(
        `You must be below level ${TELEPORT_BLOCK_LEVEL} of Wilderness to use teleportation spells.`
      );
    event.allow = false;
  }
}

function onNpcAggressionTolerance(state, event) {
  if (event.override !== null) {
    return;
  }
  if (isInWilderness(state, event.player)) {
    event.override = true;
  }
}

function onObeliskClick(event) {
  if (!Wilderness.isIn(event.player)) {
    return;
  }
  if (Obelisks.activate(event.objectId)) {
    event.handled = true;
  }
}

module.exports = {
  name: "Wilderness",
  register(api) {
    const state = createState();

    api.onPlayerProcess(({ player }) => onPlayerProcess(state, player));
    api.onPlayerLogin(({ player }) => onPlayerLogin(state, player));
    api.onPlayerDisconnect(({ player }) => onPlayerDisconnect(state, player));
    api.onCanAttack((event) => onCanAttack(state, event));
    api.onCanTeleport((event) => onCanTeleport(state, event));
    api.onNpcAggressionTolerance((event) => onNpcAggressionTolerance(state, event));
    api.onObjectFirstClick(Obelisks.OBELISK_IDS, onObeliskClick);

    api.log("registered");
  },
};
