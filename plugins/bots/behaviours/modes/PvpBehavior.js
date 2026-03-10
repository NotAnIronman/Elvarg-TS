const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Wilderness } = require("../../../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { RegionManager } = require("../../../../src/main/typescript/elvarg/game/collision/RegionManager");
const { AreaManager } = require("../../../../src/main/typescript/elvarg/game/model/areas/AreaManager");
const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");
const { Skill } = require("../../../../src/main/typescript/elvarg/game/model/Skill");
const { GameConstants } = require("../../../../src/main/typescript/elvarg/game/GameConstants");
const { TimerKey } = require("../../../../src/main/typescript/elvarg/util/timers/TimerKey");
const { randomInRange } = require("../navigation/BotNavigation");
const { PvpCombatExecutionNode } = require("../nodes/pvp/PvpCombatExecutionNode");
const { PvpDefensiveActionNode } = require("../nodes/pvp/PvpDefensiveActionNode");
const { PvpFreezeAndKiteNode } = require("../nodes/pvp/PvpFreezeAndKiteNode");
const { PvpJumpKilledTargetNode } = require("../nodes/pvp/PvpJumpKilledTargetNode");
const { PvpValidateEngagementNode } = require("../nodes/pvp/PvpValidateEngagementNode");
const {
  handlePlayerAttackReaction,
} = require("../policies/PlayerAttackReactionPolicy");
const { applyGeneratedPvpLoadout } = require("../policies/PvpLoadoutPolicy");
const { pickPvpOpponent } = require("../policies/PvpTargetSelectionPolicy");
const {
  scheduleCombatAction,
  scheduleFreezeReview,
  scheduleSpecReview,
  scheduleReviewTimers,
} = require("../policies/PvpTimingPolicy");
const {
  maybeSwitchBackToPrimaryWeapon,
  maybeUseSpecialAttack,
} = require("../policies/PvpSpecialAttackPolicy");
const {
  resetMovementState,
  setModePvp,
  setModeRoaming,
} = require("../state/PlayerBotState");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");
const {
  getPvpProfile,
  getWildernessHotspot,
} = require("../pvp/PvpAssignment");

const PVP_DURATION_DEFAULT_MIN_MS = 18000;
const PVP_DURATION_DEFAULT_MAX_MS = 50000;
const POST_PVP_DECISION_MIN_MS = 3500;
const POST_PVP_DECISION_MAX_MS = 9000;
const POST_PVP_COOLDOWN_MIN_MS = 35000;
const POST_PVP_COOLDOWN_MAX_MS = 110000;
const UNSTACK_CHECK_INTERVAL_MS = GameConstants.GAME_ENGINE_PROCESSING_CYCLE_RATE * 2;
const UNSTACK_COOLDOWN_MS = GameConstants.GAME_ENGINE_PROCESSING_CYCLE_RATE * 3;
const HOTSPOT_DECISION_JITTER_MS = 2600;
const HOTSPOT_DYNAMIC_DECISION_JITTER_MS = 4200;
const SEEKING_RESET_STAGGER_MIN_MS = 250;
const SEEKING_RESET_STAGGER_MAX_MS = 1800;

const PVP_PHASE = Object.freeze({
  IDLE: "idle",
  SEEKING: "seeking",
  COMBAT: "combat",
  DEAD: "dead",
});

function hashUsername(value) {
  const text = typeof value === "string" ? value : "";
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function resolveHotspotCycleJitterMs(username, nowMs, spreadMs) {
  const safeSpreadMs = Math.max(1, Math.floor(spreadMs));
  const cycleSeed = Math.floor(Math.max(0, Number(nowMs) || 0) / 7000);
  return hashUsername(`${username}:${cycleSeed}`) % safeSpreadMs;
}

class PvpBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.validateEngagementNode = new PvpValidateEngagementNode({
      behaviorMode: this.behaviorMode,
      setPhase: (state, phase) => this.setPhase(state, phase),
      stopPvp: (player, state, nowMs, reason) =>
        this.stopPvp(player, state, nowMs, reason),
      isFullTimePvp: (state) => this.isFullTimePvp(state),
      resetSeekingState: (player, state, nowMs, reason) =>
        this.resetSeekingState(player, state, nowMs, reason),
      resolveTargetPlayer: (state) => this.resolveTargetPlayer(state),
      isValidTarget: (player, target) => this.isValidTarget(player, target),
      isActivelyEngagedWithTarget: (player, target) =>
        this.isActivelyEngagedWithTarget(player, target),
      randomInRange,
      pvpPhase: PVP_PHASE,
    });
    this.defensiveActionNode = new PvpDefensiveActionNode({
      setPhase: (state, phase) => this.setPhase(state, phase),
      stopPvp: (player, state, nowMs, reason) =>
        this.stopPvp(player, state, nowMs, reason),
      isActivelyEngagedWithTarget: (player, target) =>
        this.isActivelyEngagedWithTarget(player, target),
      getProfile: (state) => this.getProfile(state),
      isFullTimePvp: (state) => this.isFullTimePvp(state),
      pvpPhase: PVP_PHASE,
    });
    this.freezeAndKiteNode = new PvpFreezeAndKiteNode({
      setPhase: (state, phase) => this.setPhase(state, phase),
      getProfile: (state) => this.getProfile(state),
      scheduleCombatAction,
      scheduleFreezeReview,
      pvpPhase: PVP_PHASE,
    });
    this.jumpKilledTargetNode = new PvpJumpKilledTargetNode({
      setPhase: (state, phase) => this.setPhase(state, phase),
      resolveTargetPlayer: (state) => this.resolveTargetPlayer(state),
      isValidTarget: (player, target) => this.isValidTarget(player, target),
      setModePvp,
      scheduleCombatAction,
      scheduleReviewTimers,
      applyGeneratedPvpLoadout: (player, state) =>
        applyGeneratedPvpLoadout(player, state, { api: this.api }),
      randomInRange,
      pvpPhase: PVP_PHASE,
      behaviorMode: this.behaviorMode,
    });
    this.combatExecutionNode = new PvpCombatExecutionNode({
      setPhase: (state, phase) => this.setPhase(state, phase),
      tryStepOutOfStack: (player, state, target, nowMs) =>
        this.tryStepOutOfStack(player, state, target, nowMs),
      maybeSwitchBackToPrimaryWeapon,
      maybeUseSpecialAttack,
      scheduleCombatAction,
      scheduleSpecReview,
      scheduleReviewTimers,
      pvpPhase: PVP_PHASE,
    });
  }

  handleBlocked() {
    // PvP movement/combat loop handles its own recovery.
    return true;
  }

  onPlayerAttackReaction(payload) {
    return handlePlayerAttackReaction({
      ...payload,
      behaviorMode: this.behaviorMode,
      api: this.api,
    });
  }

  setPhase(state, phase) {
    if (!state?.pvp) {
      return;
    }
    state.pvp.phase = phase;
  }

  appendStatusLines({ lines, state, nowMs, helpers = {} }) {
    if (!Array.isArray(lines) || !state?.pvp) {
      return;
    }
    const msRemainingLabel = helpers?.msRemainingLabel ?? (() => "n/a");
    lines.push(
      `pvp phase=${state.pvp.phase ?? PVP_PHASE.IDLE} target=${
        state.pvp.targetUsername ?? "n/a"
      } ends=${msRemainingLabel(state.pvp.endsAt, nowMs)} profile=${
        state.pvp.profileId ?? "standard"
      } loadout=${state.pvp.loadoutId ?? "edge_main_melee"} hotspot=${
        state.pvp.hotspotId ?? "none"
      }`
    );
  }

  getModeLogContext(state) {
    return {
      phase: state?.pvp?.phase ?? PVP_PHASE.IDLE,
      targetUsername: state?.pvp?.targetUsername ?? null,
      profileId: state?.pvp?.profileId ?? "standard",
      loadoutId: state?.pvp?.loadoutId ?? "edge_main_melee",
      hotspotId: state?.pvp?.hotspotId ?? null,
    };
  }

  getProfile(state) {
    return getPvpProfile(state?.pvp?.profileId);
  }

  isFullTimePvp(state) {
    return (
      state?.autonomy?.fullTimePvp === true ||
      state?.autonomy?.wildernessRoamerPvp === true ||
      state?.autonomy?.persistentPvpLoadout === true
    );
  }

  getHotspotDecisionJitterMs(player) {
    const username = player?.getUsername?.() ?? "";
    return hashUsername(username) % HOTSPOT_DECISION_JITTER_MS;
  }

  getDynamicHotspotDecisionJitterMs(player, nowMs) {
    const username = player?.getUsername?.() ?? "";
    return (
      this.getHotspotDecisionJitterMs(player) +
      resolveHotspotCycleJitterMs(username, nowMs, HOTSPOT_DYNAMIC_DECISION_JITTER_MS)
    );
  }

  resetSeekingState(player, state, nowMs, reason) {
    if (!player || !state) {
      return false;
    }
    if (!state.pvp) {
      return false;
    }
    this.setPhase(state, PVP_PHASE.SEEKING);
    state.pvp.targetUsername = null;
    state.pvp.targetPlayer = null;
    state.pvp.currentTargetScore = 0;
    state.pvp.targetLockUntil = 0;
    state.pvp.endsAt = 0;
    state.pvp.nextActionAt =
      nowMs +
      randomInRange(SEEKING_RESET_STAGGER_MIN_MS, SEEKING_RESET_STAGGER_MAX_MS) +
      this.getDynamicHotspotDecisionJitterMs(player, nowMs);
    resetMovementState(player);
    if (state.autonomy) {
      state.autonomy.modeEndsAt = 0;
      state.autonomy.nextDecisionAt = Math.max(
        state.autonomy.nextDecisionAt ?? 0,
        state.pvp.nextActionAt
      );
    }
    this.api?.log?.("pvp_seeking_reset", {
      username: player.getUsername?.(),
      reason,
      profileId: state?.pvp?.profileId ?? "standard",
      hotspotId: state?.pvp?.hotspotId ?? null,
    });
    return true;
  }

  behaviorRequirementsMet({ player, state, nowMs }) {
    if (!player || !state) {
      return false;
    }
    if (state.mode !== this.behaviorMode.ROAMING) {
      return false;
    }
    if (!Wilderness.isIn(player)) {
      this.setPhase(state, PVP_PHASE.IDLE);
      return false;
    }

    this.setPhase(state, PVP_PHASE.SEEKING);
    const fullTimePvp = state?.autonomy?.fullTimePvp === true;
    const pvpCooldownUntil = Number(state?.autonomy?.pvpCooldownUntil ?? 0);
    if (!fullTimePvp && Number.isInteger(nowMs) && nowMs < pvpCooldownUntil) {
      return false;
    }
    return true;
  }

  isInCombat(player) {
    if (!player) {
      return false;
    }
    const combat = player.getCombat?.();
    return !!(
      combat?.getTarget?.() ||
      combat?.getAttacker?.() ||
      player.getCombatFollowing?.()
    );
  }

  isActivelyEngagedWithTarget(player, target) {
    if (!player || !target) {
      return false;
    }
    const playerCombat = player.getCombat?.();
    const targetCombat = target.getCombat?.();
    return !!(
      playerCombat?.getTarget?.() === target ||
      playerCombat?.getAttacker?.() === target ||
      player.getCombatFollowing?.() === target ||
      targetCombat?.getTarget?.() === player ||
      targetCombat?.getAttacker?.() === player ||
      target.getCombatFollowing?.() === player
    );
  }

  resolveHotspotEngagementDecision(player, state, nowMs) {
    if (!this.isFullTimePvp(state)) {
      return true;
    }
    const hotspotId = state?.pvp?.hotspotId ?? null;
    const hotspot = hotspotId ? getWildernessHotspot(hotspotId) : null;
    const weights = hotspot?.activityWeights ?? null;
    if (!weights) {
      return true;
    }

    const seek = Math.max(0, Number(weights.seek ?? 0));
    const bait = Math.max(0, Number(weights.bait ?? 0));
    const fight = Math.max(0, Number(weights.fight ?? 0));
    const escape = Math.max(0, Number(weights.escape ?? 0));
    const total = seek + bait + fight + escape;
    if (total <= 0) {
      return true;
    }

    let roll = Math.random() * total;
    const pick = (label, weight) => {
      if (weight <= 0) {
        return false;
      }
      roll -= weight;
      return roll <= 0 ? label : false;
    };

    const activity =
      pick("seek", seek) ||
      pick("bait", bait) ||
      pick("fight", fight) ||
      "escape";
    if (activity === "fight") {
      return true;
    }

    const lingerBase = Math.max(4000, Number(hotspot?.lingerMs ?? 9000));
    const idleDelayByActivity = {
      seek: randomInRange(Math.floor(lingerBase * 0.8), Math.floor(lingerBase * 1.5)),
      bait: randomInRange(Math.floor(lingerBase * 1.0), Math.floor(lingerBase * 1.9)),
      escape: randomInRange(Math.floor(lingerBase * 1.1), Math.floor(lingerBase * 2.1)),
    };
    const nextDecisionAt =
      nowMs +
      (idleDelayByActivity[activity] ?? lingerBase) +
      this.getDynamicHotspotDecisionJitterMs(player, nowMs);
    if (!state.autonomy) {
      state.autonomy = {
        nextDecisionAt,
        modeEndsAt: 0,
        pvpCooldownUntil: 0,
        manualMode: null,
      };
    } else {
      state.autonomy.nextDecisionAt = Math.max(state.autonomy.nextDecisionAt ?? 0, nextDecisionAt);
    }
    this.setPhase(state, PVP_PHASE.SEEKING);
    return false;
  }

  countActiveHotspotFights(entries, hotspotId) {
    if (!Array.isArray(entries) || !hotspotId) {
      return 0;
    }
    let engagedBots = 0;
    for (const candidate of entries) {
      const candidateState = candidate?.state;
      const candidatePlayer = candidate?.player;
      if (!candidateState || !candidatePlayer) {
        continue;
      }
      if ((candidateState?.pvp?.hotspotId ?? null) !== hotspotId) {
        continue;
      }
      if (candidateState.mode !== this.behaviorMode.PVP) {
        continue;
      }
      if (candidateState?.pvp?.phase !== PVP_PHASE.COMBAT) {
        continue;
      }
      if (!this.isInCombat(candidatePlayer)) {
        continue;
      }
      engagedBots += 1;
    }
    return Math.floor(engagedBots / 2);
  }

  tryStartMode({
    entry,
    entries,
    nowMs,
    pvpMinMs = PVP_DURATION_DEFAULT_MIN_MS,
    pvpMaxMs = PVP_DURATION_DEFAULT_MAX_MS,
    pvpMaxDistanceTiles = 16,
    postPvpCooldownMinMs = POST_PVP_COOLDOWN_MIN_MS,
    postPvpCooldownMaxMs = POST_PVP_COOLDOWN_MAX_MS,
    scheduleNextDecision,
    startRoaming,
    isInCombat,
  }) {
    const sourcePlayer = entry?.player;
    const sourceState = entry?.state;
    if (!sourcePlayer || !sourceState) {
      return false;
    }
    const fullTimePvp = this.isFullTimePvp(sourceState);
    if (
      sourceState.mode !== this.behaviorMode.ROAMING &&
      !(fullTimePvp && sourceState.mode === this.behaviorMode.PVP)
    ) {
      return false;
    }
    if (!Wilderness.isIn(sourcePlayer)) {
      this.setPhase(sourceState, PVP_PHASE.IDLE);
      return false;
    }

    const sourceAutonomy = sourceState?.autonomy ?? null;
    if (!fullTimePvp && nowMs < (sourceAutonomy?.pvpCooldownUntil ?? 0)) {
      return false;
    }
    this.setPhase(sourceState, PVP_PHASE.SEEKING);

    if (!this.resolveHotspotEngagementDecision(sourcePlayer, sourceState, nowMs)) {
      return false;
    }

    const sourceHotspotId = sourceState?.pvp?.hotspotId ?? null;
    const sourceHotspot = sourceHotspotId ? getWildernessHotspot(sourceHotspotId) : null;
    const maxSimultaneousFights = Number(sourceHotspot?.maxSimultaneousFights ?? 0);
    if (maxSimultaneousFights > 0) {
      const activeFights = this.countActiveHotspotFights(entries, sourceHotspotId);
      if (activeFights >= maxSimultaneousFights) {
        const lingerBase = Math.max(5000, Number(sourceHotspot?.lingerMs ?? 9000));
        const nextDecisionAt =
          nowMs +
          randomInRange(lingerBase, Math.floor(lingerBase * 2)) +
          this.getDynamicHotspotDecisionJitterMs(sourcePlayer, nowMs);
        if (!sourceState.autonomy) {
          sourceState.autonomy = {
            nextDecisionAt,
            modeEndsAt: 0,
            pvpCooldownUntil: 0,
            manualMode: null,
          };
        } else {
          sourceState.autonomy.nextDecisionAt = Math.max(
            sourceState.autonomy.nextDecisionAt ?? 0,
            nextDecisionAt
          );
        }
        return false;
      }
    }

    const isInCombatCheck =
      typeof isInCombat === "function"
        ? isInCombat
        : (candidate) => this.isInCombat(candidate);

    const realPlayerOpponent = this.resolvePreferredRealPlayerOpponent({
      sourceEntry: entry,
      pvpMaxDistanceTiles,
      isInCombat: isInCombatCheck,
    });
    if (realPlayerOpponent) {
      const durationMs = randomInRange(pvpMinMs, pvpMaxMs);
      if (
        setModePvp(
          sourcePlayer,
          sourceState,
          realPlayerOpponent,
          nowMs,
          durationMs,
          this.behaviorMode
        )
      ) {
        if (sourceState?.pvp) {
          sourceState.pvp.phase = PVP_PHASE.COMBAT;
          scheduleCombatAction(sourceState, nowMs);
          scheduleReviewTimers(sourceState, nowMs);
        }

        applyGeneratedPvpLoadout(sourcePlayer, sourceState, {
          api: this.api,
        });

        if (sourceAutonomy) {
          sourceAutonomy.modeEndsAt = nowMs + durationMs;
          sourceAutonomy.pvpCooldownUntil =
            nowMs + durationMs + randomInRange(postPvpCooldownMinMs, postPvpCooldownMaxMs);
          sourceAutonomy.nextDecisionAt = nowMs + durationMs;
        }

        sourcePlayer.getMovementQueue?.().reset?.();
        sourcePlayer.getCombat?.()?.attack?.(realPlayerOpponent);
        this.api?.log?.("bot_pvp_started_real_player", {
          bot: sourcePlayer.getUsername?.(),
          target: realPlayerOpponent.getUsername?.(),
          profileId: sourceState?.pvp?.profileId ?? "standard",
          hotspotId: sourceState?.pvp?.hotspotId ?? null,
        });
        return true;
      }
    }

    const opponentEntry = pickPvpOpponent({
      sourceEntry: entry,
      entries,
      nowMs,
      pvpMaxDistanceTiles,
      isInCombat: isInCombatCheck,
      isPvpCandidate: (options) => this.isPvpCandidate(options),
    });
    if (!opponentEntry) {
      return false;
    }

    const opponentPlayer = opponentEntry.player;
    const opponentState = opponentEntry.state;
    const opponentAutonomy = opponentState?.autonomy ?? null;
    const durationMs = randomInRange(pvpMinMs, pvpMaxMs);

    if (
      !setModePvp(
        sourcePlayer,
        sourceState,
        opponentPlayer,
        nowMs,
        durationMs,
        this.behaviorMode
      )
    ) {
      return false;
    }
    if (
      !setModePvp(
        opponentPlayer,
        opponentState,
        sourcePlayer,
        nowMs,
        durationMs,
        this.behaviorMode
      )
    ) {
      if (fullTimePvp) {
        this.resetSeekingState(sourcePlayer, sourceState, nowMs, "pvp_pair_failed");
      } else if (typeof startRoaming === "function") {
        startRoaming(entry, nowMs, "pvp_pair_failed");
      } else {
        setModeRoaming(sourcePlayer, sourceState, this.behaviorMode);
      }
      return false;
    }

    if (sourceState?.pvp) {
      sourceState.pvp.phase = PVP_PHASE.COMBAT;
      scheduleCombatAction(sourceState, nowMs);
      scheduleReviewTimers(sourceState, nowMs);
    }
    if (opponentState?.pvp) {
      opponentState.pvp.phase = PVP_PHASE.COMBAT;
      scheduleCombatAction(opponentState, nowMs);
      scheduleReviewTimers(opponentState, nowMs);
    }

    applyGeneratedPvpLoadout(sourcePlayer, sourceState, {
      api: this.api,
    });
    applyGeneratedPvpLoadout(opponentPlayer, opponentState, {
      api: this.api,
    });

    if (sourceAutonomy) {
      sourceAutonomy.modeEndsAt = nowMs + durationMs;
    }
    if (opponentAutonomy) {
      opponentAutonomy.modeEndsAt = nowMs + durationMs;
    }

    const pvpCooldownUntil =
      nowMs + durationMs + randomInRange(postPvpCooldownMinMs, postPvpCooldownMaxMs);
    if (sourceAutonomy) {
      sourceAutonomy.pvpCooldownUntil = pvpCooldownUntil;
    }
    if (opponentAutonomy) {
      opponentAutonomy.pvpCooldownUntil = pvpCooldownUntil;
    }

    if (typeof scheduleNextDecision === "function") {
      scheduleNextDecision(sourceState, nowMs + durationMs);
      scheduleNextDecision(opponentState, nowMs + durationMs);
    } else {
      if (sourceAutonomy) {
        sourceAutonomy.nextDecisionAt = nowMs + durationMs;
      }
      if (opponentAutonomy) {
        opponentAutonomy.nextDecisionAt = nowMs + durationMs;
      }
    }

    this.api?.log?.("bot_pvp_started", {
      a: sourcePlayer.getUsername?.(),
      b: opponentPlayer.getUsername?.(),
      durationMs,
      aProfileId: sourceState?.pvp?.profileId ?? "standard",
      aHotspotId: sourceState?.pvp?.hotspotId ?? null,
      bProfileId: opponentState?.pvp?.profileId ?? "standard",
      bHotspotId: opponentState?.pvp?.hotspotId ?? null,
    });
    return true;
  }

  stopMode({
    entry,
    nowMs,
    reason,
    postPvpCooldownMinMs = POST_PVP_COOLDOWN_MIN_MS,
    postPvpCooldownMaxMs = POST_PVP_COOLDOWN_MAX_MS,
    startRoaming,
  }) {
    const player = entry?.player;
    const state = entry?.state;
    if (!player || !state) {
      return false;
    }

    if (this.isFullTimePvp(state)) {
      return this.resetSeekingState(player, state, nowMs, reason);
    }

    this.setPhase(state, PVP_PHASE.IDLE);
    if (!state.autonomy) {
      state.autonomy = {
        nextDecisionAt: 0,
        modeEndsAt: 0,
        pvpCooldownUntil: 0,
        manualMode: null,
      };
    }
    state.autonomy.pvpCooldownUntil = Math.max(
      state.autonomy.pvpCooldownUntil ?? 0,
      nowMs + randomInRange(postPvpCooldownMinMs, postPvpCooldownMaxMs)
    );

    if (typeof startRoaming === "function") {
      startRoaming(entry, nowMs, reason);
    } else {
      setModeRoaming(player, state, this.behaviorMode);
    }
    return true;
  }

  isTargetedByActivePvp(targetUsername, entries, ignoreUsername = null) {
    if (!targetUsername || !Array.isArray(entries)) {
      return false;
    }
    for (const entry of entries) {
      const username = entry?.player?.getUsername?.();
      if (!username || (ignoreUsername && username === ignoreUsername)) {
        continue;
      }
      const state = entry?.state;
      if (state?.mode !== this.behaviorMode.PVP) {
        continue;
      }
      if (state?.pvp?.targetUsername === targetUsername) {
        return true;
      }
    }
    return false;
  }

  isPvpCandidate({ sourceEntry, candidateEntry, entries, nowMs, isInCombat }) {
    if (!sourceEntry || !candidateEntry || sourceEntry === candidateEntry) {
      return false;
    }
    const sourcePlayer = sourceEntry.player;
    const candidatePlayer = candidateEntry.player;
    const candidateState = candidateEntry.state;
    if (!sourcePlayer || !candidatePlayer || !candidateState) {
      return false;
    }
    if (!candidatePlayer.isRegistered?.()) {
      return false;
    }
    if ((candidatePlayer.getHitpoints?.() ?? 0) <= 0) {
      return false;
    }
    if (!Wilderness.isIn(candidatePlayer)) {
      return false;
    }
    if (sourcePlayer.getPrivateArea?.() !== candidatePlayer.getPrivateArea?.()) {
      return false;
    }
    if (
      sourcePlayer.getLocation?.().getZ?.() !== candidatePlayer.getLocation?.().getZ?.()
    ) {
      return false;
    }
    if (
      !(
        candidateState.mode === this.behaviorMode.ROAMING ||
        (this.isFullTimePvp(candidateState) &&
          candidateState.mode === this.behaviorMode.PVP &&
          !candidateState?.pvp?.targetUsername)
      ) ||
      candidateState.mode === this.behaviorMode.FOLLOW_BACK ||
      candidateState.mode === this.behaviorMode.RETURN_HOME ||
      (candidateState.mode === this.behaviorMode.PVP && !this.isFullTimePvp(candidateState))
    ) {
      return false;
    }
    const isMultiEngagement =
      AreaManager.inMulti(sourcePlayer) && AreaManager.inMulti(candidatePlayer);
    if (!isMultiEngagement && typeof isInCombat === "function" && isInCombat(candidatePlayer)) {
      return false;
    }
    if (nowMs < (candidateState?.autonomy?.pvpCooldownUntil ?? 0)) {
      return false;
    }

    const sourceUsername = sourcePlayer.getUsername?.();
    const candidateUsername = candidatePlayer.getUsername?.();
    if (
      !isMultiEngagement &&
      this.isTargetedByActivePvp(candidateUsername, entries, sourceUsername)
    ) {
      return false;
    }
    return true;
  }

  resolvePreferredRealPlayerOpponent({ sourceEntry, pvpMaxDistanceTiles, isInCombat }) {
    const sourcePlayer = sourceEntry?.player;
    const sourceState = sourceEntry?.state;
    if (!sourcePlayer || !sourceState) {
      return null;
    }

    const sourceProfile = this.getProfile(sourceState);
    let bestPlayer = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    World.getPlayers().forEach((candidatePlayer) => {
      if (!candidatePlayer || candidatePlayer === sourcePlayer) {
        return;
      }
      if (candidatePlayer.isPlayerBot?.() === true) {
        return;
      }
      if (!World.isPlayerSessionConnected(candidatePlayer)) {
        return;
      }
      if (!candidatePlayer.isRegistered?.()) {
        return;
      }
      if ((candidatePlayer.getHitpoints?.() ?? 0) <= 0) {
        return;
      }
      if (!Wilderness.isIn(candidatePlayer)) {
        return;
      }
      if (sourcePlayer.getPrivateArea?.() !== candidatePlayer.getPrivateArea?.()) {
        return;
      }
      if (
        sourcePlayer.getLocation?.().getZ?.() !== candidatePlayer.getLocation?.().getZ?.()
      ) {
        return;
      }

      const distance = sourcePlayer.getLocation().getDistance(candidatePlayer.getLocation());
      if (distance > pvpMaxDistanceTiles) {
        return;
      }

      const isMultiEngagement =
        AreaManager.inMulti(sourcePlayer) && AreaManager.inMulti(candidatePlayer);
      if (!isMultiEngagement && typeof isInCombat === "function" && isInCombat(candidatePlayer)) {
        return;
      }

      let score = 220 - distance * 5;
      if (distance <= sourceProfile.chaseDistanceTiles) {
        score += 18;
      }
      if (candidatePlayer.getCombat?.().getTarget?.() === sourcePlayer) {
        score += 40;
      }
      if (isMultiEngagement) {
        score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPlayer = candidatePlayer;
      }
    });

    return bestPlayer;
  }

  resolveTargetPlayer(state) {
    const pvp = state?.pvp;
    if (!pvp?.targetUsername) {
      return null;
    }

    const cachedTarget = pvp.targetPlayer;
    if (
      cachedTarget &&
      cachedTarget.isRegistered?.() === true &&
      cachedTarget.getUsername?.() === pvp.targetUsername
    ) {
      return cachedTarget;
    }

    const resolved = World.getPlayerByName(pvp.targetUsername);
    pvp.targetPlayer = resolved ?? null;
    return resolved ?? null;
  }

  isModeStateValid({ player, state, nowMs }) {
    const pvp = state?.pvp;
    if (!player || !state || !pvp) {
      return false;
    }
    if (this.isFullTimePvp(state) && !pvp.targetUsername) {
      this.setPhase(state, PVP_PHASE.SEEKING);
      return Wilderness.isIn(player);
    }
    if (!pvp.targetUsername) {
      return false;
    }

    const opponent = this.resolveTargetPlayer(state);
    if (!opponent || !opponent.isRegistered?.()) {
      return false;
    }
    if (Number.isInteger(nowMs) && nowMs >= (pvp.endsAt ?? 0)) {
      if (!this.isActivelyEngagedWithTarget(player, opponent)) {
        return false;
      }
    }
    if ((player.getHitpoints?.() ?? 0) <= 0 || (opponent.getHitpoints?.() ?? 0) <= 0) {
      return false;
    }
    if (!Wilderness.isIn(player) || !Wilderness.isIn(opponent)) {
      return false;
    }
    if (player.getPrivateArea?.() !== opponent.getPrivateArea?.()) {
      return false;
    }
    const profile = this.getProfile(state);
    if (
      !this.isActivelyEngagedWithTarget(player, opponent) &&
      player.getLocation().getDistance(opponent.getLocation()) >
        Math.max(6, profile.chaseDistanceTiles + 2)
    ) {
      return false;
    }
    return true;
  }

  tryStepOutOfStack(player, state, target, nowMs) {
    const pvp = state?.pvp;
    const playerLoc = player?.getLocation?.();
    const targetLoc = target?.getLocation?.();
    if (!pvp || !playerLoc || !targetLoc || !playerLoc.equals(targetLoc)) {
      return false;
    }
    // Resolve stacks from one side only. If both bots try to sidestep at once they
    // can trade places and oscillate between two tiles. Use a stable ordering so the
    // same participant yields every time for a given pair.
    if ((player.getIndex?.() ?? 0) > (target.getIndex?.() ?? 0)) {
      return false;
    }
    if (player.getForceMovement?.() != null) {
      return false;
    }
    if (nowMs < Number(pvp.nextUnstackCheckAt ?? 0)) {
      return false;
    }
    pvp.nextUnstackCheckAt = nowMs + UNSTACK_CHECK_INTERVAL_MS;
    if (nowMs < Number(pvp.nextUnstackAt ?? 0)) {
      return false;
    }

    const privateArea = player.getPrivateArea?.() ?? null;
    const size = Number(player.getSize?.() ?? 1);
    const candidates = [
      new Location(playerLoc.getX() - 1, playerLoc.getY(), playerLoc.getZ()),
      new Location(playerLoc.getX() + 1, playerLoc.getY(), playerLoc.getZ()),
      new Location(playerLoc.getX(), playerLoc.getY() - 1, playerLoc.getZ()),
      new Location(playerLoc.getX(), playerLoc.getY() + 1, playerLoc.getZ()),
    ];

    let bestTile = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const localPlayers = player.getLocalPlayers?.() ?? [];
    for (const tile of candidates) {
      if (RegionManager.blocked(tile, privateArea)) {
        continue;
      }
      if (!RegionManager.canMovestart(playerLoc, tile, size, size, privateArea)) {
        continue;
      }

      let occupied = false;
      for (const candidate of localPlayers) {
        if (!candidate || candidate === player || candidate === target) {
          continue;
        }
        if (!candidate.isRegistered?.()) {
          continue;
        }
        if (candidate.getPrivateArea?.() !== privateArea) {
          continue;
        }
        const loc = candidate.getLocation?.();
        if (!loc) {
          continue;
        }
        if (
          loc.getX() === tile.getX() &&
          loc.getY() === tile.getY() &&
          loc.getZ() === tile.getZ()
        ) {
          occupied = true;
          break;
        }
      }
      if (occupied) {
        continue;
      }

      const distance = tile.getDistance(targetLoc);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTile = tile;
      }
    }

    if (!bestTile) {
      return false;
    }

    pvp.nextUnstackAt = nowMs + UNSTACK_COOLDOWN_MS;
    player.getMovementQueue?.().reset?.();
    player.getMovementQueue?.().addFirstStep?.(bestTile);
    player.getTimers?.().registers?.(TimerKey.STEPPING_OUT, 2);
    player.setPositionToFaceCoordinates?.(
      targetLoc.getX(),
      targetLoc.getY(),
      targetLoc.getZ()
    );
    return true;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.PVP,
      requireNotInCombat: false,
      requireNotBusy: false,
    });
    if (!resolved) {
      return "failure";
    }

    const { player, state, nowMs } = resolved;

    const jump = this.jumpKilledTargetNode.tick({
      player,
      state,
      nowMs,
      pvpMinMs: PVP_DURATION_DEFAULT_MIN_MS,
      pvpMaxMs: PVP_DURATION_DEFAULT_MAX_MS,
    });
    if (jump?.handled) {
      return jump.status ?? "failure";
    }

    const validation = this.validateEngagementNode.tick({
      player,
      state,
      nowMs,
    });
    if (validation?.handled) {
      return validation.status ?? "failure";
    }

    const target = validation?.target ?? null;
    const defensive = this.defensiveActionNode.tick({
      player,
      state,
      nowMs,
      target,
    });
    if (defensive?.handled) {
      return defensive.status ?? "failure";
    }

    const freeze = this.freezeAndKiteNode.tick({
      player,
      state,
      nowMs,
      target,
    });
    if (freeze?.handled) {
      return freeze.status ?? "failure";
    }

    return this.combatExecutionNode.tick({
      player,
      state,
      nowMs,
      target,
    });
  }

  isValidTarget(player, target) {
    if (!player || !target || target === player) {
      return false;
    }
    if (!target.isRegistered?.()) {
      return false;
    }
    if ((player.getHitpoints?.() ?? 0) <= 0 || (target.getHitpoints?.() ?? 0) <= 0) {
      return false;
    }
    if (player.getPrivateArea?.() !== target.getPrivateArea?.()) {
      return false;
    }
    return true;
  }

  stopPvp(player, state, nowMs, reason) {
    if (this.isFullTimePvp(state)) {
      return this.resetSeekingState(player, state, nowMs, reason);
    }
    this.setPhase(state, reason === "dead" ? PVP_PHASE.DEAD : PVP_PHASE.IDLE);
    resetMovementState(player);
    setModeRoaming(player, state, this.behaviorMode);

    if (state?.autonomy) {
      state.autonomy.modeEndsAt = 0;
      state.autonomy.pvpCooldownUntil = Math.max(
        state.autonomy.pvpCooldownUntil ?? 0,
        nowMs + randomInRange(POST_PVP_COOLDOWN_MIN_MS, POST_PVP_COOLDOWN_MAX_MS)
      );
      state.autonomy.nextDecisionAt =
        nowMs + randomInRange(POST_PVP_DECISION_MIN_MS, POST_PVP_DECISION_MAX_MS);
    }

    this.api?.log?.("pvp_stopped", {
      username: player.getUsername?.(),
      reason,
      profileId: state?.pvp?.profileId ?? "standard",
      hotspotId: state?.pvp?.hotspotId ?? null,
    });
  }
}

const PVP_MODE_DESCRIPTOR = Object.freeze({
  key: "pvp",
  modeProperty: "PVP",
  assignable: true,
  autonomous: Object.freeze({
    strategy: "try_start",
    weight: 0.05,
    params: Object.freeze({
      pvpMinMs: PVP_DURATION_DEFAULT_MIN_MS,
      pvpMaxMs: PVP_DURATION_DEFAULT_MAX_MS,
      pvpMaxDistanceTiles: 16,
      postPvpCooldownMinMs: POST_PVP_COOLDOWN_MIN_MS,
      postPvpCooldownMaxMs: POST_PVP_COOLDOWN_MAX_MS,
    }),
    priority: 10,
  }),
  modeStopParams: Object.freeze({
    postPvpCooldownMinMs: POST_PVP_COOLDOWN_MIN_MS,
    postPvpCooldownMaxMs: POST_PVP_COOLDOWN_MAX_MS,
  }),
  requiredHooks: [
    "behaviorRequirementsMet",
    "tryStartMode",
    "stopMode",
    "isModeStateValid",
    "handleBlocked",
  ],
  create({ botStatesByName, api, behaviorMode }) {
    return new PvpBehavior(botStatesByName, api, {
      behaviorMode,
    });
  },
});

module.exports = {
  PvpBehavior,
  PVP_MODE_DESCRIPTOR,
};
