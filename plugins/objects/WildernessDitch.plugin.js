const { ForceMovementTask } = require("../../src/main/typescript/elvarg/game/task/impl/ForceMovementTask");
const { ForceMovement } = require("../../src/main/typescript/elvarg/game/model/ForceMovement");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { Sound } = require("../../src/main/typescript/elvarg/game/Sound");
const { Sounds } = require("../../src/main/typescript/elvarg/game/Sounds");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const {
  commitPresetState,
  isPresetActive,
  initPresetsStateCoreAccess,
} = require("../interface/PresetsState");

const WILDERNESS_DITCH_OBJECT_ID = ObjectIds.WILDERNESS_DITCH;

let TaskManager;

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
  if (yOffset < 0 && isPresetActive(player)) {
    commitPresetState(player);
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
    TaskManager = api.getTaskManager();
    initPresetsStateCoreAccess(api);
    api.onObjectFirstClick(
      WILDERNESS_DITCH_OBJECT_ID,
      ({ player, location, sourceLocation }) =>
        tryCrossWildernessDitch(player, location?.y, sourceLocation?.y)
    );
  },
};
