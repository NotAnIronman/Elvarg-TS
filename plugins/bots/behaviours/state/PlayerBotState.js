const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { Animation } = require("../../../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../../../src/main/typescript/elvarg/game/model/Graphic");
const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");
const { TaskManager } = require("../../../../src/main/typescript/elvarg/game/task/TaskManager");

const HOME_TELEPORT_START_ANIMATION = new Animation(714);
const HOME_TELEPORT_END_ANIMATION = new Animation(715);
const HOME_TELEPORT_START_GRAPHIC = new Graphic(308, 50);
let BANK_RUN_SEQUENCE = 0;

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

function createMiningBehaviorState() {
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
    phase: "burning",
    nextActionAt: 0,
    bankTarget: null,
    lightTile: null,
    travelTarget: null,
  };
}

function createBankRunBehaviorState() {
  return {
    id: null,
    phase: "idle",
    nextActionAt: 0,
    bankTarget: null,
    travelTarget: null,
    returnMode: null,
    returnTo: null,
    resumeWoodcuttingTarget: null,
    resumeMiningTarget: null,
    startedAt: 0,
    phaseStartedAt: 0,
    lastPhaseLogged: null,
    phaseTimeoutCount: 0,
    lastHeartbeatAt: 0,
    lastStuckWarningAt: 0,
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
    manualMode: null,
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

function clearMiningBehaviorState(state) {
  if (!state?.mining) {
    return;
  }
  state.mining.target = null;
  state.mining.nextActionAt = 0;
  state.mining.nextSearchAt = 0;
  state.mining.nextDebugChatAt = 0;
  state.mining.searchTarget = null;
}

function clearFiremakingBehaviorState(state) {
  if (!state?.firemaking) {
    return;
  }
  state.firemaking.phase = "burning";
  state.firemaking.nextActionAt = 0;
  state.firemaking.bankTarget = null;
  state.firemaking.lightTile = null;
  state.firemaking.travelTarget = null;
}

function clearBankRunBehaviorState(state) {
  if (!state?.bankRun) {
    return;
  }
  state.bankRun.phase = "idle";
  state.bankRun.id = null;
  state.bankRun.nextActionAt = 0;
  state.bankRun.bankTarget = null;
  state.bankRun.travelTarget = null;
  state.bankRun.returnMode = null;
  state.bankRun.returnTo = null;
  state.bankRun.resumeWoodcuttingTarget = null;
  state.bankRun.resumeMiningTarget = null;
  state.bankRun.startedAt = 0;
  state.bankRun.phaseStartedAt = 0;
  state.bankRun.lastPhaseLogged = null;
  state.bankRun.phaseTimeoutCount = 0;
  state.bankRun.lastHeartbeatAt = 0;
  state.bankRun.lastStuckWarningAt = 0;
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

function clearAllBehaviorStates(state) {
  if (!state) {
    return;
  }
  clearRoamingBehaviorState(state);
  clearWoodcuttingBehaviorState(state);
  clearMiningBehaviorState(state);
  clearFiremakingBehaviorState(state);
  clearBankRunBehaviorState(state);
  clearSparringBehaviorState(state);
}

function applyModeTransition(player, state, mode, options = {}) {
  if (!state) {
    return;
  }
  const clearFollow = options.clearFollow !== false;
  const resetTraversal = options.resetTraversal === true;
  state.mode = mode;
  if (clearFollow) {
    clearFollowState(player, state);
  }
  clearAllBehaviorStates(state);
  if (resetTraversal) {
    state.awaitingDitchTransition = null;
  }
}

function setModeRoaming(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  // Roaming state is isolated so other behavior families can be swapped in
  // without changing the generic player-bot lifecycle structure.
  applyModeTransition(player, state, behaviorMode.ROAMING, {
    resetTraversal: false,
  });
}

function setModeReturnHome(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  applyModeTransition(player, state, behaviorMode.RETURN_HOME, {
    resetTraversal: true,
  });
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

  applyModeTransition(player, state, behaviorMode.FOLLOW_BACK, {
    resetTraversal: true,
  });
  state.followTargetUsername = followTargetUsername;
  state.followUntilMs = nowMs + followBackDurationMs;
  state.nextFollowRepathAt = 0;
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
  applyModeTransition(player, state, behaviorMode.WOODCUTTING, {
    resetTraversal: true,
  });
}

function setModeMining(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  applyModeTransition(player, state, behaviorMode.MINING, {
    resetTraversal: true,
  });
}

function setModeFiremaking(player, state, behaviorMode) {
  if (!state) {
    return;
  }
  applyModeTransition(player, state, behaviorMode.FIREMAKING, {
    resetTraversal: true,
  });
}

function setModeBankRun(player, state, behaviorMode, options = {}) {
  if (!state) {
    return false;
  }
  const loc = player?.getLocation?.();
  const fallbackReturn = loc
    ? { x: loc.getX(), y: loc.getY(), z: loc.getZ() }
    : null;
  const returnMode = options.returnMode ?? behaviorMode.ROAMING;
  const returnTo = options.returnTo ?? fallbackReturn;
  const resumeWoodcuttingTarget = options.resumeWoodcuttingTarget
    ? {
        objectId: options.resumeWoodcuttingTarget.objectId,
        x: options.resumeWoodcuttingTarget.x,
        y: options.resumeWoodcuttingTarget.y,
        z: options.resumeWoodcuttingTarget.z,
      }
    : null;
  const resumeMiningTarget = options.resumeMiningTarget
    ? {
        objectId: options.resumeMiningTarget.objectId,
        x: options.resumeMiningTarget.x,
        y: options.resumeMiningTarget.y,
        z: options.resumeMiningTarget.z,
      }
    : null;

  applyModeTransition(player, state, behaviorMode.BANK_RUN, {
    resetTraversal: true,
  });
  if (!state.bankRun) {
    state.bankRun = createBankRunBehaviorState();
  }
  const nowMs = Date.now();
  BANK_RUN_SEQUENCE += 1;
  state.bankRun.id = BANK_RUN_SEQUENCE;
  state.bankRun.phase = "to_bank";
  state.bankRun.nextActionAt = 0;
  state.bankRun.bankTarget = null;
  state.bankRun.travelTarget = null;
  state.bankRun.returnMode = returnMode;
  state.bankRun.returnTo = returnTo
    ? { x: returnTo.x, y: returnTo.y, z: returnTo.z }
    : null;
  state.bankRun.resumeWoodcuttingTarget = resumeWoodcuttingTarget;
  state.bankRun.resumeMiningTarget = resumeMiningTarget;
  state.bankRun.startedAt = nowMs;
  state.bankRun.phaseStartedAt = nowMs;
  state.bankRun.lastPhaseLogged = null;
  state.bankRun.phaseTimeoutCount = 0;
  state.bankRun.lastHeartbeatAt = 0;
  state.bankRun.lastStuckWarningAt = 0;
  return true;
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

  applyModeTransition(player, state, behaviorMode.SPARRING, {
    resetTraversal: true,
  });
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
    mining: createMiningBehaviorState(),
    firemaking: createFiremakingBehaviorState(),
    bankRun: createBankRunBehaviorState(),
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
  setModeBankRun,
  setModeWoodcutting,
  setModeMining,
  setModeFiremaking,
  teleportHome,
};
