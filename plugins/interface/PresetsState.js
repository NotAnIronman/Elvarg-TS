const { PlayerSave } = require("../../src/main/typescript/elvarg/game/entity/impl/player/persistence/PlayerSave");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const {
  PlayerFlags,
  PlayerFlagAttributes,
} = require("../../src/main/typescript/elvarg/game/entity/flags/PlayerFlags");

function isPresetActive(player) {
  return Boolean(player?.hasFlag?.(PlayerFlags.PRESET_ACTIVE));
}

function clearPresetState(player) {
  if (!player) {
    return;
  }
  player.removeFlag?.(PlayerFlags.PRESET_ACTIVE);
  player.setAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT, null);
  player.setCurrentPreset?.(null);
}

function markPresetActiveWithSnapshot(player, options = {}) {
  if (!player) {
    return false;
  }

  const providedSnapshot = options.snapshot;
  const existingSnapshot = player.getAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT);
  if (!existingSnapshot || typeof existingSnapshot.applyToPlayer !== "function") {
    player.setAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT, providedSnapshot ?? PlayerSave.fromPlayer(player));
  }
  if (options.setFlag !== false) {
    player.setFlag?.(PlayerFlags.PRESET_ACTIVE, true);
  }
  return true;
}

function restorePresetSnapshot(player, options = {}) {
  if (!player) {
    return false;
  }

  const snapshot = player.getAttribute?.(PlayerFlagAttributes.PRESET_SNAPSHOT);
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

  player.getUpdateFlag?.()?.flag?.(Flag.APPEARANCE);
  clearPresetState(player);
  return true;
}

module.exports = {
  isPresetActive,
  clearPresetState,
  markPresetActiveWithSnapshot,
  restorePresetSnapshot,
};
