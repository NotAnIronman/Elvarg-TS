const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Wilderness } = require("../../../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { randomInRange } = require("../navigation/BotNavigation");
const { applyRandomGlobalPreset } = require("../../../interface/Presets.plugin");
const {
  handlePlayerAttackReaction,
} = require("../policies/PlayerAttackReactionPolicy");
const {
  resetMovementState,
  setModePvp,
  setModeRoaming,
} = require("../state/PlayerBotState");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");

const RETRY_ACTION_MIN_MS = 550;
const RETRY_ACTION_MAX_MS = 1800;
const PVP_DURATION_DEFAULT_MIN_MS = 18000;
const PVP_DURATION_DEFAULT_MAX_MS = 50000;
const POST_PVP_DECISION_MIN_MS = 3500;
const POST_PVP_DECISION_MAX_MS = 9000;
const POST_PVP_COOLDOWN_MIN_MS = 35000;
const POST_PVP_COOLDOWN_MAX_MS = 110000;

const PVP_PHASE = Object.freeze({
  IDLE: "idle",
  SEEKING: "seeking",
  COMBAT: "combat",
  DEAD: "dead",
});

class PvpBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
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
      } ends=${msRemainingLabel(state.pvp.endsAt, nowMs)}`
    );
  }

  getModeLogContext(state) {
    return {
      phase: state?.pvp?.phase ?? PVP_PHASE.IDLE,
      targetUsername: state?.pvp?.targetUsername ?? null,
    };
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

  applyPvPPreset(player) {
    if (!player || player.isPlayerBot?.() !== true) {
      return false;
    }
    if (typeof applyRandomGlobalPreset !== "function") {
      return false;
    }
    const preset = applyRandomGlobalPreset(player);
    if (!preset) {
      this.api?.log?.("bot_pvp_preset_failed", {
        username: player.getUsername?.(),
      });
      return false;
    }
    this.api?.log?.("bot_pvp_preset_loaded", {
      username: player.getUsername?.(),
      preset: preset.getName?.() ?? "unknown",
    });
    return true;
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
    if (sourceState.mode !== this.behaviorMode.ROAMING) {
      return false;
    }
    if (!Wilderness.isIn(sourcePlayer)) {
      this.setPhase(sourceState, PVP_PHASE.IDLE);
      return false;
    }

    const sourceAutonomy = sourceState?.autonomy ?? null;
    if (nowMs < (sourceAutonomy?.pvpCooldownUntil ?? 0)) {
      return false;
    }
    this.setPhase(sourceState, PVP_PHASE.SEEKING);

    const isInCombatCheck =
      typeof isInCombat === "function"
        ? isInCombat
        : (candidate) => this.isInCombat(candidate);

    const opponentEntry = this.pickPvpOpponent({
      sourceEntry: entry,
      entries,
      nowMs,
      pvpMaxDistanceTiles,
      isInCombat: isInCombatCheck,
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
      if (typeof startRoaming === "function") {
        startRoaming(entry, nowMs, "pvp_pair_failed");
      } else {
        setModeRoaming(sourcePlayer, sourceState, this.behaviorMode);
      }
      return false;
    }

    if (sourceState?.pvp) {
      sourceState.pvp.phase = PVP_PHASE.COMBAT;
      sourceState.pvp.nextActionAt = nowMs + randomInRange(350, 1400);
    }
    if (opponentState?.pvp) {
      opponentState.pvp.phase = PVP_PHASE.COMBAT;
      opponentState.pvp.nextActionAt = nowMs + randomInRange(450, 1650);
    }

    this.applyPvPPreset(sourcePlayer);
    this.applyPvPPreset(opponentPlayer);

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
      candidateState.mode !== this.behaviorMode.ROAMING ||
      candidateState.mode === this.behaviorMode.FOLLOW_BACK ||
      candidateState.mode === this.behaviorMode.RETURN_HOME ||
      candidateState.mode === this.behaviorMode.PVP
    ) {
      return false;
    }
    if (typeof isInCombat === "function" && isInCombat(candidatePlayer)) {
      return false;
    }
    if (nowMs < (candidateState?.autonomy?.pvpCooldownUntil ?? 0)) {
      return false;
    }

    const sourceUsername = sourcePlayer.getUsername?.();
    const candidateUsername = candidatePlayer.getUsername?.();
    if (this.isTargetedByActivePvp(candidateUsername, entries, sourceUsername)) {
      return false;
    }
    return true;
  }

  pickPvpOpponent({ sourceEntry, entries, nowMs, pvpMaxDistanceTiles, isInCombat }) {
    const sourcePlayer = sourceEntry?.player;
    const sourceState = sourceEntry?.state;
    if (!sourcePlayer || !sourceState || !Array.isArray(entries)) {
      return null;
    }

    const candidates = [];
    for (const other of entries) {
      if (
        !this.isPvpCandidate({
          sourceEntry,
          candidateEntry: other,
          entries,
          nowMs,
          isInCombat,
        })
      ) {
        continue;
      }
      const distance = sourcePlayer
        .getLocation()
        .getDistance(other.player.getLocation());
      if (distance > pvpMaxDistanceTiles) {
        continue;
      }
      candidates.push({ entry: other, distance });
    }

    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const nearestPool = candidates.slice(0, Math.min(3, candidates.length));
    return nearestPool[randomInRange(0, nearestPool.length - 1)].entry;
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
    const pvp = state.pvp;
    if (!pvp?.targetUsername) {
      this.setPhase(state, PVP_PHASE.SEEKING);
      this.stopPvp(player, state, nowMs, "missing_target");
      return "success";
    }

    if ((player.getHitpoints?.() ?? 0) <= 0) {
      this.setPhase(state, PVP_PHASE.DEAD);
      this.stopPvp(player, state, nowMs, "dead");
      return "success";
    }

    const target = this.resolveTargetPlayer(state);
    if (!this.isValidTarget(player, target)) {
      this.setPhase(state, PVP_PHASE.SEEKING);
      this.stopPvp(player, state, nowMs, "invalid_target");
      return "success";
    }

    if (nowMs >= (pvp.endsAt ?? 0)) {
      if (this.isActivelyEngagedWithTarget(player, target)) {
        pvp.endsAt = nowMs + randomInRange(8000, 15000);
      } else {
        this.setPhase(state, PVP_PHASE.IDLE);
        this.stopPvp(player, state, nowMs, "expired");
        return "success";
      }
    }

    const targetCombat = target.getCombat?.();
    const targetTarget = targetCombat?.getTarget?.();
    if (targetTarget && targetTarget !== player) {
      this.setPhase(state, PVP_PHASE.SEEKING);
      this.stopPvp(player, state, nowMs, "target_in_other_combat");
      return "success";
    }

    if (player.getForceMovement() != null) {
      this.setPhase(state, PVP_PHASE.COMBAT);
      return "running";
    }

    if (player.getFollowing?.() !== target) {
      player.setFollowing?.(target);
    }
    if (player.getInteractingMobile?.() !== target) {
      player.setMobileInteraction?.(target);
    }

    if (nowMs < (pvp.nextActionAt ?? 0)) {
      this.setPhase(state, PVP_PHASE.COMBAT);
      return "running";
    }

    const combat = player.getCombat?.();
    if (!combat) {
      return "failure";
    }

    const currentTarget = combat.getTarget?.();
    if (currentTarget && currentTarget !== target) {
      combat.reset?.();
    }

    if (combat.getTarget?.() !== target) {
      player.getMovementQueue?.().reset?.();
      player.setFollowing?.(target);
      player.setMobileInteraction?.(target);
      player.setPositionToFace?.(target.getLocation());
      combat.attack(target);
    }

    this.setPhase(state, PVP_PHASE.COMBAT);
    pvp.nextActionAt = nowMs + randomInRange(RETRY_ACTION_MIN_MS, RETRY_ACTION_MAX_MS);
    return "running";
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
