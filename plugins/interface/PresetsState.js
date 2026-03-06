const { PlayerSave } = require("../../src/main/typescript/elvarg/game/entity/impl/player/persistence/PlayerSave");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { WeaponInterfaces } = require("../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { BonusManager } = require("../../src/main/typescript/elvarg/game/model/equipment/BonusManager");
const {
  PlayerFlags,
  PlayerFlagAttributes,
} = require("../../src/main/typescript/elvarg/game/entity/flags/PlayerFlags");

function hasPresetSnapshot(player) {
  const snapshot = player?.getAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT);
  return Boolean(snapshot && typeof snapshot.applyToPlayer === "function");
}

function isPresetActive(player) {
  return Boolean(player?.hasFlag?.(PlayerFlags.PRESET_ACTIVE) || hasPresetSnapshot(player));
}

function clearPresetState(player) {
  if (!player) {
    return;
  }
  player.removeFlag?.(PlayerFlags.PRESET_ACTIVE);
  player.setAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT, null);
  player.setCurrentPreset?.(null);
}

function loadSnapshotFromPersistence(player) {
  const username = player?.getUsername?.();
  const persistence = GameConstants?.PLAYER_PERSISTENCE;
  if (!username || !persistence || typeof persistence.load !== "function") {
    return null;
  }

  try {
    const loadedSave = persistence.load(username);
    if (loadedSave && typeof loadedSave.applyToPlayer === "function") {
      return loadedSave;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function markPresetActiveWithSnapshot(player, options = {}) {
  if (!player) {
    return false;
  }

  const providedSnapshot = options.snapshot;
  const existingSnapshot = player.getAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT);
  if (!existingSnapshot || typeof existingSnapshot.applyToPlayer !== "function") {
    // If we're already in preset mode (e.g. after relog) and no in-memory snapshot exists,
    // never snapshot the current live state because it may already be preset-mutated.
    const activeWithSnapshot =
      player?.hasFlag?.(PlayerFlags.PRESET_ACTIVE) === true && hasPresetSnapshot(player);
    const baselineSnapshot =
      (providedSnapshot && typeof providedSnapshot.applyToPlayer === "function"
        ? providedSnapshot
        : null) ??
      (activeWithSnapshot ? loadSnapshotFromPersistence(player) : null) ??
      PlayerSave.fromPlayer(player);
    player.setAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT, baselineSnapshot);
  }
  if (options.setFlag !== false) {
    player.setFlag?.(PlayerFlags.PRESET_ACTIVE, true);
  }
  return true;
}

function resolvePresetSnapshot(player) {
  const snapshot = player.getAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT);
  if (snapshot && typeof snapshot.applyToPlayer === "function") {
    return snapshot;
  }
  return loadSnapshotFromPersistence(player);
}

function restorePresetSnapshot(player, options = {}) {
  if (!player) {
    return false;
  }

  const overrideSnapshot = options.snapshotOverride;
  const snapshot =
    overrideSnapshot && typeof overrideSnapshot.applyToPlayer === "function"
      ? overrideSnapshot
      : resolvePresetSnapshot(player);
  if (!snapshot || typeof snapshot.applyToPlayer !== "function") {
    clearPresetState(player);
    return false;
  }

  const preserveLocation = options.preserveLocation !== false;
  const currentLocation = preserveLocation ? player.getLocation?.()?.clone?.() : null;
  snapshot.applyToPlayer(player);

  if (currentLocation) {
    player.setLocation?.(currentLocation);
    player.getMovementQueue?.()?.reset?.();
    player.setNeedsPlacement?.(true);
    player.setResetMovementQueue?.(true);
  }

  // Snapshot apply updates server-side containers directly; explicitly refresh
  // packets so tabs (especially equipment) are redrawn immediately client-side.
  player.getInventory?.()?.refreshItems?.();
  player.getEquipment?.()?.refreshItems?.();
  WeaponInterfaces.assign?.(player);
  BonusManager.update?.(player);

  player.getUpdateFlag?.()?.flag?.(Flag.APPEARANCE);
  clearPresetState(player);
  return true;
}

module.exports = {
  isPresetActive,
  hasPresetSnapshot,
  clearPresetState,
  markPresetActiveWithSnapshot,
  resolvePresetSnapshot,
  restorePresetSnapshot,
};
