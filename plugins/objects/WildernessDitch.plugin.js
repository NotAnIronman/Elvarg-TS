const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { ForceMovementTask } = require("../../src/main/typescript/elvarg/game/task/impl/ForceMovementTask");
const { ForceMovement } = require("../../src/main/typescript/elvarg/game/model/ForceMovement");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const {
  isPresetActive,
  resolvePresetSnapshot,
  restorePresetSnapshot,
} = require("../interface/PresetsState");

const WILDERNESS_DITCH_OBJECT_ID = ObjectIds.WILDERNESS_DITCH;
function openPresetDitchPrompt(api, player, ditchY, sourceY) {
  if (!api || !player) {
    return;
  }
  const presetSnapshot = resolvePresetSnapshot(player);
  const snapshotOverride =
    presetSnapshot && typeof presetSnapshot.applyToPlayer === "function"
      ? presetSnapshot
      : null;

  api.sendMultiChatboxPrompt(
    player,
    "Presets Forbidden",
    "Remove the preset and cross",
    () => {
      const restored = restorePresetSnapshot(player, {
        preserveLocation: true,
        snapshotOverride,
      });
      if (!restored) {
        player
          .getPacketSender()
          .sendMessage("Unable to remove your active preset right now.");
        return;
      }
      player
        .getPacketSender()
        .sendMessage(
          "Preset cleared. Your original character state has been restored."
        );
      tryCrossWildernessDitch(player, ditchY, sourceY, {
        skipPresetPrompt: true,
      });
    },
    "I'll stay here for now",
    () => {}
  );
}

function resolveDitchYOffset(player, ditchY, sourceY) {
  const thresholdY = Number.isInteger(ditchY) ? ditchY + 1 : 3522;
  const approachY = Number.isInteger(sourceY)
    ? sourceY
    : player.getLocation().getY();
  return approachY < thresholdY ? 3 : -3;
}

function tryCrossWildernessDitch(player, ditchY, sourceY, options = {}) {
  if (!player || player.getForceMovement() != null) {
    return { crossed: false, reason: "force_movement_active" };
  }

  const clickDelay = player.getClickDelay();
  const elapsed = clickDelay ? clickDelay.elapsed() : -1;
  if (!clickDelay || !clickDelay.elapsedTime(250)) {
    return { crossed: false, reason: "click_delay", elapsed };
  }

  const yOffset = resolveDitchYOffset(player, ditchY, sourceY);
  if (yOffset < 0 && options.skipPresetPrompt !== true && isPresetActive(player)) {
    openPresetDitchPrompt(options.promptApi, player, ditchY, sourceY);
    return { crossed: false, reason: "preset_confirmation_required", elapsed };
  }

  const crossDitch = new Location(0, yOffset);
  const forceMovement = new ForceMovement(
    player.getLocation().clone(),
    crossDitch,
    0,
    70,
    yOffset === 3 ? 0 : 2,
    6132
  );

  TaskManager.submit(new ForceMovementTask(player, 3, forceMovement));
  Sounds.sendSound(player, Sound.WILDERNESS_DITCH_JUMP);
  clickDelay.reset();
  return { crossed: true, reason: "ok", elapsed };
}

module.exports = {
  name: "WildernessDitch",
  register: (api) => {
    api.onObjectFirstClick(
      WILDERNESS_DITCH_OBJECT_ID,
      ({ player, location, sourceLocation }) =>
        tryCrossWildernessDitch(player, location?.y, sourceLocation?.y, {
          promptApi: api,
        })
    );
  },
};
