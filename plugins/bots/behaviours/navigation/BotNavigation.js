const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { PathFinder } = require("../../../../src/main/typescript/elvarg/game/model/movement/path/PathFinder");

function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isAtTarget(player, target) {
  if (!player || !target) {
    return false;
  }
  const loc = player.getLocation();
  return (
    loc.getX() === target.x &&
    loc.getY() === target.y &&
    loc.getZ() === target.z
  );
}

function chooseNextTarget(player, state, botWalkRadius) {
  if (!player || !state?.home) {
    return null;
  }

  const homeX = state.home.x;
  const homeY = state.home.y;
  const homeZ = state.home.z ?? player.getLocation().getZ();
  const currentX = player.getLocation().getX();
  const currentY = player.getLocation().getY();
  const previousTarget = state.roaming?.target;
  const radiusSq = botWalkRadius * botWalkRadius;
  const maxAttempts = 24;

  // Keep roaming local to each bot's home tile; ditch crossing remains organic
  // and is only triggered by path-blocked handling when a route is obstructed.
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const dx = randomInRange(-botWalkRadius, botWalkRadius);
    const dy = randomInRange(-botWalkRadius, botWalkRadius);
    if (dx * dx + dy * dy > radiusSq) {
      continue;
    }

    const targetX = homeX + dx;
    const targetY = homeY + dy;
    if (targetX === currentX && targetY === currentY) {
      continue;
    }
    if (
      previousTarget &&
      targetX === previousTarget.x &&
      targetY === previousTarget.y &&
      attempt < maxAttempts - 1
    ) {
      continue;
    }
    return { x: targetX, y: targetY, z: homeZ };
  }

  const fallbackTargets = [
    [homeX + botWalkRadius, homeY],
    [homeX - botWalkRadius, homeY],
    [homeX, homeY + botWalkRadius],
    [homeX, homeY - botWalkRadius],
    [homeX, homeY],
  ];

  for (const [targetX, targetY] of fallbackTargets) {
    if (targetX === currentX && targetY === currentY) {
      continue;
    }
    return { x: targetX, y: targetY, z: homeZ };
  }

  return null;
}

function calculateStrictWalkRoute(player, targetX, targetY) {
  // Bot ditch traversal depends on `path_blocked` events. The default walk route
  // uses basic fallback and can stop near the target instead of reporting blocked.
  PathFinder.calculateRoute(player, 0, targetX, targetY, 0, 0, 0, 0, false);
}

function queueRouteAndFlagAppearance(player, targetX, targetY) {
  calculateStrictWalkRoute(player, targetX, targetY);
  player.getUpdateFlag().flag(Flag.APPEARANCE);
}

function retargetAfterBlocked(
  player,
  state,
  api,
  reason,
  event,
  nowMs = Date.now(),
  blockedRetargetMinDelayMs = 0,
  blockedRetargetMaxDelayMs = 0,
  botWalkRadius = 0
) {
  if (!player || !state) {
    return false;
  }
  if (!state.roaming) {
    return false;
  }

  const previousTarget = state.roaming.target
    ? {
        x: state.roaming.target.x,
        y: state.roaming.target.y,
        z: state.roaming.target.z,
      }
    : null;

  state.roaming.endpointPauseUntil = 0;
  const nextTarget = chooseNextTarget(player, state, botWalkRadius);
  if (!nextTarget) {
    state.roaming.target = null;
    state.roaming.nextWalkAt = nowMs + blockedRetargetMaxDelayMs;
    api.log("path_blocked_retarget_failed", {
      username: player.getUsername(),
      reason,
      previousTarget,
      from: event?.from ?? null,
      to: event?.to ?? null,
    });
    return false;
  }

  state.roaming.target = nextTarget;
  const retryInMs = randomInRange(
    blockedRetargetMinDelayMs,
    blockedRetargetMaxDelayMs
  );
  state.roaming.nextWalkAt = nowMs + retryInMs;
  api.log("path_blocked_retarget", {
    username: player.getUsername(),
    reason,
    previousTarget,
    nextTarget,
    retryInMs,
    from: event?.from ?? null,
    to: event?.to ?? null,
  });
  return true;
}

module.exports = {
  calculateStrictWalkRoute,
  chooseNextTarget,
  isAtTarget,
  queueRouteAndFlagAppearance,
  randomInRange,
  retargetAfterBlocked,
};
