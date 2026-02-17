const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { ForceMovementTask } = require("../../src/main/typescript/elvarg/game/task/impl/ForceMovementTask");
const { ForceMovement } = require("../../src/main/typescript/elvarg/game/model/ForceMovement");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

const WILDERNESS_DITCH_OBJECT_ID = 23271;

function tryCrossWildernessDitch(player, ditchY, sourceY) {
  if (!player || player.getForceMovement() != null) {
    return { crossed: false, reason: "force_movement_active" };
  }
  const clickDelay = player.getClickDelay();
  const elapsed = clickDelay ? clickDelay.elapsed() : -1;
  if (!clickDelay || !clickDelay.elapsedTime(250)) {
    return { crossed: false, reason: "click_delay", elapsed };
  }

  // Derive crossing direction from the clicked ditch tile instead of a
  // hardcoded world Y threshold. Treat the ditch tile itself as the
  // south-side approach so south->north clicks don't bounce back south.
  const thresholdY = Number.isInteger(ditchY) ? ditchY + 1 : 3522;
  const approachY = Number.isInteger(sourceY)
    ? sourceY
    : player.getLocation().getY();
  const yOffset = approachY < thresholdY ? 3 : -3;
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
  clickDelay.reset();
  return { crossed: true, reason: "ok", elapsed };
}

module.exports = {
  name: "WildernessDitch",
  register: (api) =>
    api.onObjectFirstClick(
      WILDERNESS_DITCH_OBJECT_ID,
      ({ player, location, sourceLocation }) =>
        tryCrossWildernessDitch(player, location?.y, sourceLocation?.y)
    ),
};
