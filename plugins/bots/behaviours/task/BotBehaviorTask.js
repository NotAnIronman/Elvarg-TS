const { Task } = require("../../../../src/main/typescript/elvarg/game/task/Task");
const { Wilderness } = require("../../../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { randomInRange } = require("../navigation/BotNavigation");
const {
  setModeRoaming,
  setModeSparring,
  setModeMining,
  setModeWoodcutting,
} = require("../state/PlayerBotState");

class BotBehaviorTask extends Task {
  constructor(entries, traversalService, decisionTicks, options = {}) {
    super(decisionTicks);
    this.entries = entries;
    this.traversalService = traversalService;
    this.api = options.api ?? null;
    this.behaviorMode = options.behaviorMode ?? null;
    this.autonomy = {
      roamWeight: options.roamWeight ?? 0.55,
      woodcuttingWeight: options.woodcuttingWeight ?? 0.3,
      miningWeight: options.miningWeight ?? 0.15,
      sparringWeight: options.sparringWeight ?? 0.15,
      decisionDelayMinMs: options.decisionDelayMinMs ?? 4500,
      decisionDelayMaxMs: options.decisionDelayMaxMs ?? 14000,
      roamingMinMs: options.roamingMinMs ?? 22000,
      roamingMaxMs: options.roamingMaxMs ?? 80000,
      woodcuttingMinMs: options.woodcuttingMinMs ?? 30000,
      woodcuttingMaxMs: options.woodcuttingMaxMs ?? 105000,
      miningMinMs: options.miningMinMs ?? 30000,
      miningMaxMs: options.miningMaxMs ?? 105000,
      sparringMinMs: options.sparringMinMs ?? 18000,
      sparringMaxMs: options.sparringMaxMs ?? 50000,
      sparringMaxDistanceTiles: options.sparringMaxDistanceTiles ?? 16,
      postSparringCooldownMinMs: options.postSparringCooldownMinMs ?? 35000,
      postSparringCooldownMaxMs: options.postSparringCooldownMaxMs ?? 110000,
    };
  }

  ensureAutonomyState(state) {
    if (!state) {
      return null;
    }
    if (!state.autonomy) {
      state.autonomy = {
        nextDecisionAt: 0,
        modeEndsAt: 0,
        pvpCooldownUntil: 0,
        manualMode: null,
      };
    }
    if (!Object.prototype.hasOwnProperty.call(state.autonomy, "manualMode")) {
      state.autonomy.manualMode = null;
    }
    return state.autonomy;
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

  scheduleNextDecision(state, nowMs) {
    const autonomy = this.ensureAutonomyState(state);
    if (!autonomy) {
      return;
    }
    autonomy.nextDecisionAt =
      nowMs +
      randomInRange(this.autonomy.decisionDelayMinMs, this.autonomy.decisionDelayMaxMs);
  }

  startRoaming(entry, nowMs, reason = "auto_switch") {
    const { player, state } = entry;
    setModeRoaming(player, state, this.behaviorMode);
    const autonomy = this.ensureAutonomyState(state);
    autonomy.modeEndsAt =
      nowMs + randomInRange(this.autonomy.roamingMinMs, this.autonomy.roamingMaxMs);
    this.scheduleNextDecision(state, nowMs);
    this.api?.log?.("bot_mode_switch", {
      username: player.getUsername?.(),
      mode: this.behaviorMode.ROAMING,
      reason,
      activeForMs: autonomy.modeEndsAt - nowMs,
    });
  }

  startWoodcutting(entry, nowMs, reason = "auto_switch") {
    const { player, state } = entry;
    setModeWoodcutting(player, state, this.behaviorMode);
    const autonomy = this.ensureAutonomyState(state);
    autonomy.modeEndsAt =
      nowMs +
      randomInRange(this.autonomy.woodcuttingMinMs, this.autonomy.woodcuttingMaxMs);
    this.scheduleNextDecision(state, nowMs);
    this.api?.log?.("bot_mode_switch", {
      username: player.getUsername?.(),
      mode: this.behaviorMode.WOODCUTTING,
      reason,
      activeForMs: autonomy.modeEndsAt - nowMs,
    });
  }

  startMining(entry, nowMs, reason = "auto_switch") {
    const { player, state } = entry;
    setModeMining(player, state, this.behaviorMode);
    const autonomy = this.ensureAutonomyState(state);
    autonomy.modeEndsAt =
      nowMs + randomInRange(this.autonomy.miningMinMs, this.autonomy.miningMaxMs);
    this.scheduleNextDecision(state, nowMs);
    this.api?.log?.("bot_mode_switch", {
      username: player.getUsername?.(),
      mode: this.behaviorMode.MINING,
      reason,
      activeForMs: autonomy.modeEndsAt - nowMs,
    });
  }

  stopSparring(entry, nowMs, reason) {
    const autonomy = this.ensureAutonomyState(entry.state);
    autonomy.pvpCooldownUntil = Math.max(
      autonomy.pvpCooldownUntil,
      nowMs +
        randomInRange(
          this.autonomy.postSparringCooldownMinMs,
          this.autonomy.postSparringCooldownMaxMs
        )
    );
    this.startRoaming(entry, nowMs, reason);
  }

  isTargetedByActiveSparring(targetUsername, ignoreUsername = null) {
    if (!targetUsername) {
      return false;
    }
    for (const entry of this.entries) {
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

  isSparringCandidate(sourceEntry, candidateEntry, nowMs) {
    if (!sourceEntry || !candidateEntry || sourceEntry === candidateEntry) {
      return false;
    }
    const sourcePlayer = sourceEntry.player;
    const sourceState = sourceEntry.state;
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
    if (this.isInCombat(candidatePlayer)) {
      return false;
    }

    const candidateAutonomy = this.ensureAutonomyState(candidateState);
    if (nowMs < (candidateAutonomy.pvpCooldownUntil ?? 0)) {
      return false;
    }

    const sourceUsername = sourcePlayer.getUsername?.();
    const candidateUsername = candidatePlayer.getUsername?.();
    if (this.isTargetedByActiveSparring(candidateUsername, sourceUsername)) {
      return false;
    }

    return true;
  }

  pickSparringOpponent(entry, nowMs) {
    const sourcePlayer = entry?.player;
    const sourceState = entry?.state;
    if (!sourcePlayer || !sourceState) {
      return null;
    }
    const candidates = [];
    for (const other of this.entries) {
      if (!this.isSparringCandidate(entry, other, nowMs)) {
        continue;
      }
      const distance = sourcePlayer
        .getLocation()
        .getDistance(other.player.getLocation());
      if (distance > this.autonomy.sparringMaxDistanceTiles) {
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

  tryStartSparring(entry, nowMs) {
    const sourcePlayer = entry?.player;
    const sourceState = entry?.state;
    if (!sourcePlayer || !sourceState) {
      return false;
    }
    if (!Wilderness.isIn(sourcePlayer)) {
      return false;
    }
    const sourceAutonomy = this.ensureAutonomyState(sourceState);
    if (nowMs < (sourceAutonomy.pvpCooldownUntil ?? 0)) {
      return false;
    }

    const opponentEntry = this.pickSparringOpponent(entry, nowMs);
    if (!opponentEntry) {
      return false;
    }

    const opponentPlayer = opponentEntry.player;
    const opponentState = opponentEntry.state;
    const opponentAutonomy = this.ensureAutonomyState(opponentState);
    const durationMs = randomInRange(
      this.autonomy.sparringMinMs,
      this.autonomy.sparringMaxMs
    );

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
      this.startRoaming(entry, nowMs, "sparring_pair_failed");
      return false;
    }

    if (sourceState?.sparring) {
      sourceState.sparring.nextActionAt = nowMs + randomInRange(350, 1400);
    }
    if (opponentState?.sparring) {
      opponentState.sparring.nextActionAt = nowMs + randomInRange(450, 1650);
    }

    sourceAutonomy.modeEndsAt = nowMs + durationMs;
    opponentAutonomy.modeEndsAt = nowMs + durationMs;

    const pvpCooldownUntil =
      nowMs +
      durationMs +
      randomInRange(
        this.autonomy.postSparringCooldownMinMs,
        this.autonomy.postSparringCooldownMaxMs
      );
    sourceAutonomy.pvpCooldownUntil = pvpCooldownUntil;
    opponentAutonomy.pvpCooldownUntil = pvpCooldownUntil;
    this.scheduleNextDecision(sourceState, nowMs + durationMs);
    this.scheduleNextDecision(opponentState, nowMs + durationMs);

    this.api?.log?.("bot_sparring_started", {
      a: sourcePlayer.getUsername?.(),
      b: opponentPlayer.getUsername?.(),
      durationMs,
    });
    return true;
  }

  validateSparring(entry, nowMs) {
    const player = entry?.player;
    const state = entry?.state;
    const sparring = state?.sparring;
    if (!player || !state || !sparring) {
      return false;
    }
    if (!sparring.targetUsername) {
      return false;
    }
    if (nowMs >= (sparring.endsAt ?? 0)) {
      return false;
    }
    const opponentEntry = this.entries.find(
      (other) => other?.player?.getUsername?.() === sparring.targetUsername
    );
    const opponent = opponentEntry?.player;
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

  processAutonomousMode(entry, nowMs) {
    if (!this.behaviorMode || !entry?.state || !entry?.player) {
      return;
    }
    const player = entry.player;
    const state = entry.state;
    const autonomy = this.ensureAutonomyState(state);
    const deadOrDying =
      (player.getHitpoints?.() ?? 0) <= 0 ||
      player.isDyingReturn?.() === true;

    // Ensure bot-specific temporary modes (follow-back/sparring/return-home)
    // are cleared after death so the bot resumes normal autonomous behavior.
    if (deadOrDying) {
      if (!state.deathResetApplied) {
        setModeRoaming(player, state, this.behaviorMode);
        autonomy.modeEndsAt = 0;
        autonomy.nextDecisionAt = 0;
        state.deathResetApplied = true;
        this.api?.log?.("bot_post_death_reset", {
          username: player.getUsername?.(),
        });
      }
      return;
    }

    if (state.deathResetApplied) {
      state.deathResetApplied = false;
      this.scheduleNextDecision(state, nowMs);
    }

    const manualMode = autonomy.manualMode ?? null;
    if (manualMode) {
      const isTransient =
        state.mode === this.behaviorMode.FOLLOW_BACK ||
        state.mode === this.behaviorMode.RETURN_HOME ||
        state.mode === this.behaviorMode.BANK_RUN;
      if (isTransient) {
        return;
      }

      if (state.mode !== manualMode) {
        if (manualMode === this.behaviorMode.ROAMING) {
          setModeRoaming(player, state, this.behaviorMode);
        } else if (manualMode === this.behaviorMode.WOODCUTTING) {
          setModeWoodcutting(player, state, this.behaviorMode);
        } else if (manualMode === this.behaviorMode.MINING) {
          setModeMining(player, state, this.behaviorMode);
        }
        this.api?.log?.("bot_mode_switch", {
          username: player.getUsername?.(),
          mode: manualMode,
          reason: "manual_override_resume",
          activeForMs: -1,
        });
      }

      autonomy.nextDecisionAt = Number.MAX_SAFE_INTEGER;
      autonomy.modeEndsAt = Number.MAX_SAFE_INTEGER;
      return;
    }

    if (
      state.mode === this.behaviorMode.FOLLOW_BACK ||
      state.mode === this.behaviorMode.RETURN_HOME ||
      state.mode === this.behaviorMode.BANK_RUN
    ) {
      this.scheduleNextDecision(state, nowMs);
      return;
    }

    if (state.mode === this.behaviorMode.SPARRING) {
      if (!this.validateSparring(entry, nowMs)) {
        this.stopSparring(entry, nowMs, "sparring_invalid");
      }
      return;
    }

    if (this.isInCombat(player)) {
      this.scheduleNextDecision(state, nowMs);
      return;
    }

    if (nowMs < (autonomy.nextDecisionAt ?? 0)) {
      return;
    }
    if (nowMs < (autonomy.modeEndsAt ?? 0)) {
      return;
    }

    const roll = Math.random();
    const canAttemptSparring = Wilderness.isIn(player);
    const totalWeight = Math.max(
      this.autonomy.roamWeight +
        this.autonomy.woodcuttingWeight +
        this.autonomy.miningWeight +
        (canAttemptSparring ? this.autonomy.sparringWeight : 0),
      0.0001
    );
    const sparringWeight = canAttemptSparring ? this.autonomy.sparringWeight : 0;
    const sparringThreshold = sparringWeight / totalWeight;
    const woodcuttingThreshold =
      sparringThreshold + this.autonomy.woodcuttingWeight / totalWeight;
    const miningThreshold =
      woodcuttingThreshold + this.autonomy.miningWeight / totalWeight;

    if (roll < sparringThreshold && this.tryStartSparring(entry, nowMs)) {
      return;
    }
    if (roll < woodcuttingThreshold) {
      this.startWoodcutting(entry, nowMs);
      return;
    }
    if (roll < miningThreshold) {
      this.startMining(entry, nowMs);
      return;
    }
    this.startRoaming(entry, nowMs);
  }

  execute() {
    const now = Date.now();
    for (const entry of this.entries) {
      try {
        this.traversalService.processTransition(entry.player, entry.state, now);
        this.traversalService.processPendingRetry(entry.player, entry.state, now);
        this.processAutonomousMode(entry, now);
        entry.controller.tick(now);
      } catch (err) {
        console.error("[bots] behavior tick failed", err);
      }
    }
  }
}

module.exports = {
  BotBehaviorTask,
};
