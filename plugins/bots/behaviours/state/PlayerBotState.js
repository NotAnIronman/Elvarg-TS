const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { Animation } = require("../../../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../../../src/main/typescript/elvarg/game/model/Graphic");
const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");
const { TaskManager } = require("../../../../src/main/typescript/elvarg/game/task/TaskManager");

const HOME_TELEPORT_START_ANIMATION = new Animation(714);
const HOME_TELEPORT_END_ANIMATION = new Animation(715);
const HOME_TELEPORT_START_GRAPHIC = new Graphic(308, 50);

function createRoamingBehaviorState() {
  return {
    target: null,
    nextWalkAt: 0,
    pendingRetry: null,
    endpointPauseUntil: 0,
  };
}

function clearRoamingBehaviorState(state) {
  if (!state?.roaming) {
    return;
  }
  state.roaming.target = null;
  state.roaming.nextWalkAt = 0;
  state.roaming.pendingRetry = null;
  state.roaming.endpointPauseUntil = 0;
}

function createWoodcuttingBehaviorState() {
  return {
    target: null,
    nextActionAt: 0,
    nextSearchAt: 0,
    nextDebugChatAt: 0,
    searchTarget: null,
  };
}

function createFiremakingBehaviorState() {
  return {
    nextActionAt: 0,
  };
}

function createSparringBehaviorState() {
  return {
    targetUsername: null,
    endsAt: 0,
    nextActionAt: 0,
  };
}

function clearSparringBehaviorState(state) {
  if (!state?.sparring) {
    return;
  }
  state.sparring.targetUsername = null;
  state.sparring.endsAt = 0;
  state.sparring.nextActionAt = 0;
}

function createAutonomyState() {
  return {
    nextDecisionAt: 0,
    modeEndsAt: 0,
    pvpCooldownUntil: 0,
  };
}

function clearWoodcuttingBehaviorState(state) {
  if (!state?.woodcutting) {
    return;
  }
  state.woodcutting.target = null;
  state.woodcutting.nextActionAt = 0;
  state.woodcutting.nextSearchAt = 0;
  state.woodcutting.nextDebugChatAt = 0;
  state.woodcutting.searchTarget = null;
}

function clearFiremakingBehaviorState(state) {
  if (!state?.firemaking) {
    return;
  }
  state.firemaking.nextActionAt = 0;
}

function resetMovementState(player) {
  if (!player) {
    return;
  }
  try {
    TaskManager.cancelTasks(player);
  } catch (_) {
    // Ignore task cancellation issues in plugin flow.
  }
  player.getMovementQueue().walkToReset();
  player.getMovementQueue().reset();
}

function clearFollowState(player, state) {
  if (player) {
    player.setFollowing(null);
    player.setMobileInteraction(null);
    player.setPositionToFace(null);
  }
  if (!state) {
    return;
  }
  state.followTargetUsername = null;
  state.followUntilMs = 0;
  state.nextFollowRepathAt = 0;
}

function setModeRoaming(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  // Roaming state is isolated so other behavior families can be swapped in
  // without changing the generic player-bot lifecycle structure.
  state.mode = behaviorMode.ROAMING;
  clearFollowState(player, state);
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearSparringBehaviorState(state);
}

function setModeReturnHome(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  state.mode = behaviorMode.RETURN_HOME;
  clearFollowState(player, state);
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearSparringBehaviorState(state);
  state.awaitingDitchTransition = null;
}

function setModeFollowBack(
  player,
  state,
  followTarget,
  nowMs,
  followBackDurationMs,
  behaviorMode
) {
  if (!player || !state || !followTarget) {
    return false;
  }
  const followTargetUsername = followTarget.getUsername?.();
  if (!followTargetUsername) {
    return false;
  }

  state.mode = behaviorMode.FOLLOW_BACK;
  state.followTargetUsername = followTargetUsername;
  state.followUntilMs = nowMs + followBackDurationMs;
  state.nextFollowRepathAt = 0;
  state.awaitingDitchTransition = null;
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearSparringBehaviorState(state);
  state.roaming.target = {
    x: followTarget.getLocation().getX(),
    y: followTarget.getLocation().getY(),
    z: followTarget.getLocation().getZ(),
  };

  resetMovementState(player);
  player.setFollowing(followTarget);
  player.setMobileInteraction(followTarget);
  player.setPositionToFace(followTarget.getLocation());
  return true;
}

function setModeWoodcutting(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  state.mode = behaviorMode.WOODCUTTING;
  clearFollowState(player, state);
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearSparringBehaviorState(state);
  state.awaitingDitchTransition = null;
}

function setModeFiremaking(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  state.mode = behaviorMode.FIREMAKING;
  clearFollowState(player, state);
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearSparringBehaviorState(state);
  state.awaitingDitchTransition = null;
}

function setModeSparring(
  player,
  state,
  targetPlayer,
  nowMs,
  durationMs,
  behaviorMode
) {
  if (!player || !state || !targetPlayer || durationMs <= 0) {
    return false;
  }
  const targetUsername = targetPlayer.getUsername?.();
  if (!targetUsername) {
    return false;
  }

  state.mode = behaviorMode.SPARRING;
  clearFollowState(player, state);
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearSparringBehaviorState(state);
  state.awaitingDitchTransition = null;
  if (!state.sparring) {
    state.sparring = createSparringBehaviorState();
  }

  state.sparring.targetUsername = targetUsername;
  state.sparring.endsAt = nowMs + durationMs;
  state.sparring.nextActionAt = nowMs;

  resetMovementState(player);
  player.setFollowing(targetPlayer);
  player.setMobileInteraction(targetPlayer);
  player.setPositionToFace(targetPlayer.getLocation());
  return true;
}

function isInsideHomeArea(player, state, botHomeRadius) {
  if (!player || !state?.home) {
    return false;
  }
  const current = player.getLocation();
  const homeX = state.home.x;
  const homeY = state.home.y;
  const homeZ = state.home.z ?? current.getZ();
  if (current.getZ() !== homeZ) {
    return false;
  }
  const dx = current.getX() - homeX;
  const dy = current.getY() - homeY;
  return dx * dx + dy * dy <= botHomeRadius * botHomeRadius;
}

function teleportHome(player, state) {
  if (!player || !state?.home) {
    return false;
  }
  const home = new Location(state.home.x, state.home.y, state.home.z ?? 0);
  player.performAnimation(HOME_TELEPORT_START_ANIMATION);
  player.performGraphic(HOME_TELEPORT_START_GRAPHIC);
  player.moveTo(home);
  player.performAnimation(HOME_TELEPORT_END_ANIMATION);
  player.getUpdateFlag().flag(Flag.APPEARANCE);
  return true;
}

function createInitialState(home, behaviorMode) {
  return {
    mode: behaviorMode.ROAMING,
    home,
    // Keep roaming internals in a dedicated child state; this prevents future
    // behavior modes (minigames, skilling, PvP) from coupling to roam fields.
    roaming: createRoamingBehaviorState(),
    woodcutting: createWoodcuttingBehaviorState(),
    firemaking: createFiremakingBehaviorState(),
    sparring: createSparringBehaviorState(),
    autonomy: createAutonomyState(),
    followTargetUsername: null,
    followUntilMs: 0,
    nextFollowRepathAt: 0,
    deathResetApplied: false,
    awaitingDitchTransition: null,
    nextDitchAttemptAt: 0,
  };
}

function markResumeSoon(state, nowMs = Date.now(), blockedRetargetMinDelayMs = 0) {
  if (!state) {
    return;
  }
  if (!state.roaming) {
    state.roaming = createRoamingBehaviorState();
  }
  state.roaming.nextWalkAt = nowMs + blockedRetargetMinDelayMs;
}

module.exports = {
  clearFollowState,
  createInitialState,
  isInsideHomeArea,
  markResumeSoon,
  resetMovementState,
  setModeFollowBack,
  setModeSparring,
  setModeReturnHome,
  setModeRoaming,
  setModeWoodcutting,
  setModeFiremaking,
  teleportHome,
};
