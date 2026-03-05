const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { PathFinder } = require("../../../../src/main/typescript/elvarg/game/model/movement/path/PathFinder");

const MAX_ROUTE_SEGMENT_TILES = 24;
const PATH_BLOCKED_LOG_THROTTLE_MS = 2500;
const pendingMovementByPlayer = new WeakMap();
const pathBlockedLogStateByUsername = new Map();

function consumePathBlockedLogBudget(username, nowMs) {
  if (!username) {
    return { shouldLog: true, suppressedCount: 0 };
  }
  const state =
    pathBlockedLogStateByUsername.get(username) ?? {
      lastLogAt: 0,
      suppressedCount: 0,
    };
  if (nowMs - state.lastLogAt < PATH_BLOCKED_LOG_THROTTLE_MS) {
    state.suppressedCount += 1;
    pathBlockedLogStateByUsername.set(username, state);
    return { shouldLog: false, suppressedCount: state.suppressedCount };
  }
  const suppressedCount = state.suppressedCount;
  state.lastLogAt = nowMs;
  state.suppressedCount = 0;
  pathBlockedLogStateByUsername.set(username, state);
  return { shouldLog: true, suppressedCount };
}

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

function resolveSegmentTarget(
  player,
  targetX,
  targetY,
  maxRouteSegmentTiles = MAX_ROUTE_SEGMENT_TILES
) {
  if (!player) {
    return { x: targetX, y: targetY };
  }
  const maxSegmentTiles = Math.max(1, Math.floor(maxRouteSegmentTiles));
  const loc = player.getLocation();
  const currentX = loc.getX();
  const currentY = loc.getY();
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  const chebyshevDistance = Math.max(Math.abs(dx), Math.abs(dy));
  if (chebyshevDistance <= maxSegmentTiles) {
    return { x: targetX, y: targetY };
  }

  const ratio = maxSegmentTiles / chebyshevDistance;
  let segmentX = currentX + Math.round(dx * ratio);
  let segmentY = currentY + Math.round(dy * ratio);

  if (segmentX === currentX && dx !== 0) {
    segmentX += Math.sign(dx);
  }
  if (segmentY === currentY && dy !== 0) {
    segmentY += Math.sign(dy);
  }

  return {
    x: segmentX,
    y: segmentY,
  };
}

function queueRouteAndFlagAppearance(player, targetX, targetY) {
  return requestMovement(player, targetX, targetY);
}

function requestMovement(player, targetX, targetY, options = {}) {
  if (!player) {
    return false;
  }
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    return false;
  }
  const loc = player.getLocation?.();
  const z = Number.isFinite(options.z) ? Math.floor(options.z) : loc?.getZ?.();
  pendingMovementByPlayer.set(player, {
    x: Math.floor(targetX),
    y: Math.floor(targetY),
    z: Number.isFinite(z) ? z : null,
    reason: typeof options.reason === "string" ? options.reason : null,
    requestedAtMs: Number.isFinite(options.nowMs) ? options.nowMs : Date.now(),
    maxRouteSegmentTiles:
      Number.isFinite(options.maxRouteSegmentTiles) &&
      options.maxRouteSegmentTiles > 0
        ? Math.floor(options.maxRouteSegmentTiles)
        : MAX_ROUTE_SEGMENT_TILES,
  });
  return true;
}

function peekMovementRequest(player) {
  if (!player) {
    return null;
  }
  return pendingMovementByPlayer.get(player) ?? null;
}

function clearMovementRequest(player) {
  if (!player) {
    return;
  }
  pendingMovementByPlayer.delete(player);
}

function dispatchMovementRequest(player, request) {
  if (!player || !request) {
    return null;
  }
  const segmentTarget = resolveSegmentTarget(
    player,
    request.x,
    request.y,
    request.maxRouteSegmentTiles
  );
  calculateStrictWalkRoute(player, segmentTarget.x, segmentTarget.y);
  player.getUpdateFlag().flag(Flag.APPEARANCE);
  return segmentTarget;
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
  const username = player.getUsername?.();
  const logBudget = consumePathBlockedLogBudget(username, nowMs);

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
    if (logBudget.shouldLog) {
      api.log("path_blocked_retarget_failed", {
        username,
        reason,
        previousTarget,
        from: event?.from ?? null,
        to: event?.to ?? null,
        suppressed: logBudget.suppressedCount,
      });
    }
    return false;
  }

  state.roaming.target = nextTarget;
  const retryInMs = randomInRange(
    blockedRetargetMinDelayMs,
    blockedRetargetMaxDelayMs
  );
  state.roaming.nextWalkAt = nowMs + retryInMs;
  if (logBudget.shouldLog) {
    api.log("path_blocked_retarget", {
      username,
      reason,
      previousTarget,
      nextTarget,
      retryInMs,
      from: event?.from ?? null,
      to: event?.to ?? null,
      suppressed: logBudget.suppressedCount,
    });
  }
  return true;
}

module.exports = {
  calculateStrictWalkRoute,
  chooseNextTarget,
  clearMovementRequest,
  dispatchMovementRequest,
  isAtTarget,
  peekMovementRequest,
  queueRouteAndFlagAppearance,
  randomInRange,
  requestMovement,
  resolveSegmentTarget,
  retargetAfterBlocked,
};
