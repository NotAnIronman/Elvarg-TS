const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { Animation } = require("../../../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../../../src/main/typescript/elvarg/game/model/Graphic");
const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");
const { TaskManager } = require("../../../../src/main/typescript/elvarg/game/task/TaskManager");
const { clearMovementRequest } = require("../navigation/BotNavigation");
const {
  clearPresetState,
  isPresetActive,
  restorePresetSnapshot,
} = require("../../../interface/PresetsState");

const HOME_TELEPORT_START_ANIMATION = new Animation(714);
const HOME_TELEPORT_END_ANIMATION = new Animation(715);
const HOME_TELEPORT_START_GRAPHIC = new Graphic(308, 50);
let BANK_RUN_SEQUENCE = 0;
const DEFAULT_TRANSITION_PROFILE = Object.freeze({ resetTraversal: true });
const MODE_TRANSITION_PROFILE_OVERRIDES = Object.freeze({
  ROAMING: Object.freeze({ resetTraversal: false }),
});
const RESUMABLE_MODE_KEYS = Object.freeze([
  "ROAMING",
  "WOODCUTTING",
  "MINING",
  "SMELTING",
  "FIREMAKING",
  "PVP",
]);

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

function createSmeltingBehaviorState() {
  return {
    phase: "withdraw",
    nextActionAt: 0,
    recipeBarId: null,
    bankTarget: null,
    furnaceTarget: null,
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
    suppressAutoRetaliate: false,
    previousAutoRetaliate: null,
  };
}

function createPvpBehaviorState() {
  return {
    phase: "idle",
    targetUsername: null,
    targetPlayer: null,
    endsAt: 0,
    nextActionAt: 0,
  };
}

function clearPvpBehaviorState(state) {
  if (!state?.pvp) {
    return;
  }
  state.pvp.phase = "idle";
  state.pvp.targetUsername = null;
  state.pvp.targetPlayer = null;
  state.pvp.endsAt = 0;
  state.pvp.nextActionAt = 0;
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

function clearSmeltingBehaviorState(state) {
  if (!state?.smelting) {
    return;
  }
  state.smelting.phase = "withdraw";
  state.smelting.nextActionAt = 0;
  state.smelting.recipeBarId = null;
  state.smelting.bankTarget = null;
  state.smelting.furnaceTarget = null;
  state.smelting.travelTarget = null;
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
  state.bankRun.suppressAutoRetaliate = false;
  state.bankRun.previousAutoRetaliate = null;
}

function resetMovementState(player) {
  if (!player) {
    return;
  }
  clearMovementRequest(player);
  // Avoid canceling player-keyed tasks while a force movement is active
  // (e.g. wilderness ditch), otherwise the movement task can be interrupted.
  if (player.getForceMovement?.() == null) {
    try {
      TaskManager.cancelTasks(player);
    } catch (_) {
      // Ignore task cancellation issues in plugin flow.
    }
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
  clearSmeltingBehaviorState(state);
  clearBankRunBehaviorState(state);
  clearPvpBehaviorState(state);
}

function restoreSuppressedAutoRetaliate(player, state, nextMode) {
  if (
    !player ||
    !state ||
    state.bankRun?.suppressAutoRetaliate !== true ||
    state.mode === nextMode
  ) {
    return;
  }
  const previousAutoRetaliate = state.bankRun.previousAutoRetaliate;
  player.setAutoRetaliate(
    typeof previousAutoRetaliate === "boolean" ? previousAutoRetaliate : true
  );
  state.bankRun.suppressAutoRetaliate = false;
  state.bankRun.previousAutoRetaliate = null;
}

function clearCombatState(player) {
  if (!player) {
    return;
  }
  player.getCombat?.()?.reset?.();
  player.setCombatFollowing?.(null);
}

function clearBotActivePreset(player) {
  if (!player || player.isPlayerBot?.() !== true) {
    return false;
  }
  // Avoid visually clearing gear mid-death animation. We clear presets once
  // the bot is alive again in the post-death reset flow.
  const deadOrDying =
    (player.getHitpoints?.() ?? 0) <= 0 || player.isDyingReturn?.() === true;
  if (deadOrDying) {
    return false;
  }
  if (!isPresetActive(player)) {
    return false;
  }
  const restored = restorePresetSnapshot(player, { preserveLocation: true });
  if (!restored) {
    clearPresetState(player);
  }
  return true;
}

function applyModeTransitionSideEffects(player, state, mode, options = {}) {
  clearBotActivePreset(player);
  restoreSuppressedAutoRetaliate(player, state, mode);
  if (options.resetMovement !== false) {
    resetMovementState(player);
  } else {
    clearMovementRequest(player);
  }
  if (options.resetCombat !== false) {
    clearCombatState(player);
  }
  if (options.clearFollow !== false) {
    clearFollowState(player, state);
  }
}

function applyModeTransition(player, state, mode, options = {}) {
  if (!state) {
    return;
  }
  applyModeTransitionSideEffects(player, state, mode, options);
  const resetTraversal = options.resetTraversal === true;
  state.mode = mode;
  clearAllBehaviorStates(state);
  if (resetTraversal) {
    state.awaitingDitchTransition = null;
  }
}

function resolveBehaviorModeValue(behaviorMode, modeKey) {
  if (!behaviorMode || typeof modeKey !== "string" || modeKey.length === 0) {
    return null;
  }
  const mode = behaviorMode[modeKey];
  return typeof mode === "string" && mode.length > 0 ? mode : null;
}

function isPlayerInCombat(player) {
  if (!player) {
    return false;
  }
  const hitpoints = player.getHitpoints?.();
  if (Number.isFinite(hitpoints) && hitpoints <= 0) {
    return false;
  }
  if (player.isDyingReturn?.() === true) {
    return false;
  }
  const combat = player.getCombat?.();
  return !!(
    combat?.getTarget?.() ||
    combat?.getAttacker?.() ||
    player.getCombatFollowing?.()
  );
}

function transitionToMode(player, state, behaviorMode, modeKey, overrideOptions = null) {
  if (!state) {
    return false;
  }
  const mode = resolveBehaviorModeValue(behaviorMode, modeKey);
  if (!mode) {
    return false;
  }
  const profile =
    overrideOptions ??
    MODE_TRANSITION_PROFILE_OVERRIDES[modeKey] ??
    DEFAULT_TRANSITION_PROFILE;
  if (
    state.mode !== mode &&
    profile?.allowInCombatTransition !== true &&
    isPlayerInCombat(player)
  ) {
    return false;
  }
  applyModeTransition(player, state, mode, profile);
  return true;
}

function setModeRoaming(player, state, behaviorMode) {
  transitionToMode(player, state, behaviorMode, "ROAMING");
}

function setModeReturnHome(player, state, behaviorMode) {
  transitionToMode(player, state, behaviorMode, "RETURN_HOME");
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

  if (!transitionToMode(player, state, behaviorMode, "FOLLOW_BACK")) {
    return false;
  }
  state.followTargetUsername = followTargetUsername;
  state.followUntilMs = nowMs + followBackDurationMs;
  state.nextFollowRepathAt = 0;
  state.roaming.target = {
    x: followTarget.getLocation().getX(),
    y: followTarget.getLocation().getY(),
    z: followTarget.getLocation().getZ(),
  };
  player.setFollowing(followTarget);
  player.setMobileInteraction(followTarget);
  player.setPositionToFace(followTarget.getLocation());
  return true;
}

function setModeWoodcutting(player, state, behaviorMode) {
  transitionToMode(player, state, behaviorMode, "WOODCUTTING");
}

function setModeMining(player, state, behaviorMode) {
  transitionToMode(player, state, behaviorMode, "MINING");
}

function setModeFiremaking(player, state, behaviorMode) {
  transitionToMode(player, state, behaviorMode, "FIREMAKING");
}

function setModeSmelting(player, state, behaviorMode) {
  transitionToMode(player, state, behaviorMode, "SMELTING");
}

function isResumableMode(mode, behaviorMode) {
  if (!behaviorMode) {
    return false;
  }
  return RESUMABLE_MODE_KEYS.some(
    (modeKey) => resolveBehaviorModeValue(behaviorMode, modeKey) === mode
  );
}

function resolveBankRunResumeMode(state, behaviorMode) {
  if (!behaviorMode) {
    return null;
  }
  if (isResumableMode(state?.mode, behaviorMode)) {
    return state.mode;
  }
  const manualMode = state?.autonomy?.manualMode;
  if (isResumableMode(manualMode, behaviorMode)) {
    return manualMode;
  }
  return behaviorMode.ROAMING;
}

function setModeBankRun(player, state, behaviorMode, options = {}) {
  if (!state) {
    return false;
  }
  const loc = player?.getLocation?.();
  const fallbackReturn = loc
    ? { x: loc.getX(), y: loc.getY(), z: loc.getZ() }
    : null;
  const returnMode =
    options.returnMode ?? resolveBankRunResumeMode(state, behaviorMode);
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

  if (!transitionToMode(player, state, behaviorMode, "BANK_RUN")) {
    return false;
  }
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
  state.bankRun.suppressAutoRetaliate = options.suppressAutoRetaliate === true;
  state.bankRun.previousAutoRetaliate = null;
  if (
    state.bankRun.suppressAutoRetaliate &&
    player &&
    typeof player.autoRetaliateReturn === "function" &&
    typeof player.setAutoRetaliate === "function"
  ) {
    state.bankRun.previousAutoRetaliate = player.autoRetaliateReturn();
    player.setAutoRetaliate(false);
  }
  return true;
}

function setModePvp(
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

  if (!transitionToMode(player, state, behaviorMode, "PVP")) {
    return false;
  }
  if (!state.pvp) {
    state.pvp = createPvpBehaviorState();
  }

  state.pvp.phase = "seeking";
  state.pvp.targetUsername = targetUsername;
  state.pvp.targetPlayer = targetPlayer;
  state.pvp.endsAt = nowMs + durationMs;
  state.pvp.nextActionAt = nowMs;
  player.setFollowing(targetPlayer);
  player.setMobileInteraction(targetPlayer);
  player.setPositionToFace(targetPlayer.getLocation());
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
  return setModePvp(player, state, targetPlayer, nowMs, durationMs, behaviorMode);
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
    smelting: createSmeltingBehaviorState(),
    bankRun: createBankRunBehaviorState(),
    pvp: createPvpBehaviorState(),
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
  resolveBankRunResumeMode,
  resetMovementState,
  setModeFollowBack,
  setModePvp,
  setModeSparring,
  setModeReturnHome,
  setModeRoaming,
  setModeBankRun,
  setModeWoodcutting,
  setModeMining,
  setModeSmelting,
  setModeFiremaking,
  teleportHome,
  clearBotActivePreset,
};
