const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { Wilderness } = require("../../../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { randomInRange } = require("../navigation/BotNavigation");
const {
  resetMovementState,
  setModeRoaming,
  setModeSparring,
} = require("../state/PlayerBotState");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");

const RETRY_ACTION_MIN_MS = 550;
const RETRY_ACTION_MAX_MS = 1800;
const SPARRING_DURATION_DEFAULT_MIN_MS = 18000;
const SPARRING_DURATION_DEFAULT_MAX_MS = 50000;
const POST_SPARRING_DECISION_MIN_MS = 3500;
const POST_SPARRING_DECISION_MAX_MS = 9000;
const POST_SPARRING_COOLDOWN_MIN_MS = 35000;
const POST_SPARRING_COOLDOWN_MAX_MS = 110000;

class SparringBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
  }

  handleBlocked() {
    // Sparring movement/combat loop handles its own recovery.
    return true;
  }

  getModeLogContext(state) {
    return {
      targetUsername: state?.sparring?.targetUsername ?? null,
    };
  }

  behaviorRequirementsMet({ player, state, nowMs }) {
    if (!player || !state) {
      return false;
    }
    if (!Wilderness.isIn(player)) {
      return false;
    }
    const pvpCooldownUntil = Number(state?.autonomy?.pvpCooldownUntil ?? 0);
    if (Number.isInteger(nowMs) && nowMs < pvpCooldownUntil) {
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

  tryStartMode({
    entry,
    entries,
    nowMs,
    sparringMinMs = SPARRING_DURATION_DEFAULT_MIN_MS,
    sparringMaxMs = SPARRING_DURATION_DEFAULT_MAX_MS,
    sparringMaxDistanceTiles = 16,
    postSparringCooldownMinMs = POST_SPARRING_COOLDOWN_MIN_MS,
    postSparringCooldownMaxMs = POST_SPARRING_COOLDOWN_MAX_MS,
    scheduleNextDecision,
    startRoaming,
    isInCombat,
  }) {
    const sourcePlayer = entry?.player;
    const sourceState = entry?.state;
    if (!sourcePlayer || !sourceState) {
      return false;
    }
    if (!Wilderness.isIn(sourcePlayer)) {
      return false;
    }
    const sourceAutonomy = sourceState?.autonomy ?? null;
    if (nowMs < (sourceAutonomy?.pvpCooldownUntil ?? 0)) {
      return false;
    }

    const isInCombatCheck =
      typeof isInCombat === "function"
        ? isInCombat
        : (candidate) => this.isInCombat(candidate);

    const opponentEntry = this.pickSparringOpponent({
      sourceEntry: entry,
      entries,
      nowMs,
      sparringMaxDistanceTiles,
      isInCombat: isInCombatCheck,
    });
    if (!opponentEntry) {
      return false;
    }

    const opponentPlayer = opponentEntry.player;
    const opponentState = opponentEntry.state;
    const opponentAutonomy = opponentState?.autonomy ?? null;
    const durationMs = randomInRange(sparringMinMs, sparringMaxMs);

    if (
      !setModeSparring(
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
      !setModeSparring(
        opponentPlayer,
        opponentState,
        sourcePlayer,
        nowMs,
        durationMs,
        this.behaviorMode
      )
    ) {
      if (typeof startRoaming === "function") {
        startRoaming(entry, nowMs, "sparring_pair_failed");
      } else {
        setModeRoaming(sourcePlayer, sourceState, this.behaviorMode);
      }
      return false;
    }

    if (sourceState?.sparring) {
      sourceState.sparring.nextActionAt = nowMs + randomInRange(350, 1400);
    }
    if (opponentState?.sparring) {
      opponentState.sparring.nextActionAt = nowMs + randomInRange(450, 1650);
    }

    if (sourceAutonomy) {
      sourceAutonomy.modeEndsAt = nowMs + durationMs;
    }
    if (opponentAutonomy) {
      opponentAutonomy.modeEndsAt = nowMs + durationMs;
    }

    const pvpCooldownUntil =
      nowMs +
      durationMs +
      randomInRange(postSparringCooldownMinMs, postSparringCooldownMaxMs);
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

    this.api?.log?.("bot_sparring_started", {
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
    postSparringCooldownMinMs = POST_SPARRING_COOLDOWN_MIN_MS,
    postSparringCooldownMaxMs = POST_SPARRING_COOLDOWN_MAX_MS,
    startRoaming,
  }) {
    const player = entry?.player;
    const state = entry?.state;
    if (!player || !state) {
      return false;
    }

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
      nowMs + randomInRange(postSparringCooldownMinMs, postSparringCooldownMaxMs)
    );

    if (typeof startRoaming === "function") {
      startRoaming(entry, nowMs, reason);
    } else {
      setModeRoaming(player, state, this.behaviorMode);
    }
    return true;
  }

  isTargetedByActiveSparring(targetUsername, entries, ignoreUsername = null) {
    if (!targetUsername || !Array.isArray(entries)) {
      return false;
    }
    for (const entry of entries) {
      const username = entry?.player?.getUsername?.();
      if (!username || (ignoreUsername && username === ignoreUsername)) {
        continue;
      }
      const state = entry?.state;
      if (state?.mode !== this.behaviorMode.SPARRING) {
        continue;
      }
      if (state?.sparring?.targetUsername === targetUsername) {
        return true;
      }
    }
    return false;
  }

  isSparringCandidate({
    sourceEntry,
    candidateEntry,
    entries,
    nowMs,
    isInCombat,
  }) {
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
      candidateState.mode === this.behaviorMode.FOLLOW_BACK ||
      candidateState.mode === this.behaviorMode.RETURN_HOME ||
      candidateState.mode === this.behaviorMode.SPARRING
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
    if (this.isTargetedByActiveSparring(candidateUsername, entries, sourceUsername)) {
      return false;
    }
    return true;
  }

  pickSparringOpponent({
    sourceEntry,
    entries,
    nowMs,
    sparringMaxDistanceTiles,
    isInCombat,
  }) {
    const sourcePlayer = sourceEntry?.player;
    const sourceState = sourceEntry?.state;
    if (!sourcePlayer || !sourceState || !Array.isArray(entries)) {
      return null;
    }
    const candidates = [];
    for (const other of entries) {
      if (
        !this.isSparringCandidate({
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
      if (distance > sparringMaxDistanceTiles) {
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

  isModeStateValid({ player, state, nowMs }) {
    const sparring = state?.sparring;
    if (!player || !state || !sparring) {
      return false;
    }
    if (!sparring.targetUsername) {
      return false;
    }
    if (Number.isInteger(nowMs) && nowMs >= (sparring.endsAt ?? 0)) {
      return false;
    }
    const opponent = World.getPlayerByName(sparring.targetUsername);
    if (!opponent || !opponent.isRegistered?.()) {
      return false;
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
      requiredMode: this.behaviorMode.SPARRING,
      requireNotBusy: false,
      requireNotInCombat: false,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    const sparring = state.sparring;
    if (!sparring?.targetUsername) {
      this.stopSparring(player, state, nowMs, "missing_target");
      return "success";
    }

    if (nowMs >= (sparring.endsAt ?? 0)) {
      this.stopSparring(player, state, nowMs, "expired");
      return "success";
    }

    const target = World.getPlayerByName(sparring.targetUsername);
    if (!this.isValidTarget(player, target)) {
      this.stopSparring(player, state, nowMs, "invalid_target");
      return "success";
    }

    const targetCombat = target.getCombat?.();
    const targetTarget = targetCombat?.getTarget?.();
    if (targetTarget && targetTarget !== player) {
      // Keep sparring one-on-one only.
      this.stopSparring(player, state, nowMs, "target_in_other_combat");
      return "success";
    }

    if (player.getForceMovement() != null) {
      return "running";
    }

    // Keep PvP interaction state sticky while sparring so bots continue
    // facing/following correctly even if another flow temporarily clears it.
    if (player.getFollowing?.() !== target) {
      player.setFollowing?.(target);
    }
    if (player.getInteractingMobile?.() !== target) {
      player.setMobileInteraction?.(target);
    }

    if (nowMs < (sparring.nextActionAt ?? 0)) {
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

    sparring.nextActionAt = nowMs + randomInRange(RETRY_ACTION_MIN_MS, RETRY_ACTION_MAX_MS);
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

  stopSparring(player, state, nowMs, reason) {
    resetMovementState(player);
    setModeRoaming(player, state, this.behaviorMode);
    if (state?.autonomy) {
      state.autonomy.modeEndsAt = 0;
      state.autonomy.pvpCooldownUntil = Math.max(
        state.autonomy.pvpCooldownUntil ?? 0,
        nowMs + randomInRange(POST_SPARRING_COOLDOWN_MIN_MS, POST_SPARRING_COOLDOWN_MAX_MS)
      );
      state.autonomy.nextDecisionAt =
        nowMs + randomInRange(POST_SPARRING_DECISION_MIN_MS, POST_SPARRING_DECISION_MAX_MS);
    }
    this.api?.log?.("sparring_stopped", {
      username: player.getUsername?.(),
      reason,
    });
  }
}

const SPARRING_MODE_DESCRIPTOR = Object.freeze({
  key: "sparring",
  modeProperty: "SPARRING",
  requiredHooks: [
    "behaviorRequirementsMet",
    "tryStartMode",
    "stopMode",
    "isModeStateValid",
    "handleBlocked",
  ],
  create({ botStatesByName, api, behaviorMode }) {
    return new SparringBehavior(botStatesByName, api, {
      behaviorMode,
    });
  },
});

module.exports = {
  SparringBehavior,
  SPARRING_MODE_DESCRIPTOR,
};
