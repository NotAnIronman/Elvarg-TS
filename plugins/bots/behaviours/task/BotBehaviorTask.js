const { Task } = require("../../../../src/main/typescript/elvarg/game/task/Task");
const { randomInRange } = require("../navigation/BotNavigation");
const { callModeHook } = require("../hooks/ModeHookContract");

class BotBehaviorTask extends Task {
  constructor(entries, traversalService, decisionTicks, options = {}) {
    super(decisionTicks);
    this.entries = entries;
    this.traversalService = traversalService;
    this.api = options.api ?? null;
    this.behaviorMode = options.behaviorMode ?? null;
    this.modeHandlers = options.modeHandlers ?? {};
    this.autonomy = {
      decisionDelayMinMs: options.decisionDelayMinMs ?? 4500,
      decisionDelayMaxMs: options.decisionDelayMaxMs ?? 14000,
    };
    this.autonomousModes = Array.isArray(options.autonomousModes)
      ? options.autonomousModes
      : [];
    this.modeStopParamsByMode = options.modeStopParamsByMode ?? {};
    this.transientModes = new Set(options.transientModes ?? []);
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

  behaviorRequirementsMet(mode, player, state, nowMs = Date.now()) {
    return (
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "behaviorRequirementsMet",
        payload: { player, state, nowMs },
        fallback: true,
        api: this.api,
        errorEvent: "bot_behavior_requirements_error",
      }) === true
    );
  }

  activateModeWithHandler(entry, mode, reason = "mode_switch") {
    return (
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "activateMode",
        payload: {
          player: entry.player,
          state: entry.state,
          nowMs: Date.now(),
          reason,
        },
        fallback: false,
        api: this.api,
        errorEvent: "bot_mode_activation_error",
      }) === true
    );
  }

  startModeWithHandler(entry, mode, nowMs, minMs, maxMs, reason = "auto_switch") {
    const activeForMs = randomInRange(minMs, maxMs);
    const started =
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "startMode",
        payload: {
          player: entry.player,
          state: entry.state,
          nowMs,
          activeForMs,
          reason,
        },
        fallback: false,
        api: this.api,
        errorEvent: "bot_mode_start_error",
      }) === true;
    if (!started) {
      return false;
    }
    const autonomy = this.ensureAutonomyState(entry.state);
    autonomy.modeEndsAt = nowMs + activeForMs;
    this.scheduleNextDecision(entry.state, nowMs);
    return true;
  }

  isModeStateValid(mode, entry, nowMs) {
    return (
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "isModeStateValid",
        payload: {
          player: entry?.player,
          state: entry?.state,
          nowMs,
        },
        fallback: true,
        api: this.api,
        errorEvent: "bot_mode_state_validation_error",
      }) === true
    );
  }

  stopModeWithHandler(entry, mode, nowMs, reason, params = {}) {
    return (
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "stopMode",
        payload: {
          entry,
          nowMs,
          reason,
          ...params,
        },
        fallback: false,
        api: this.api,
        errorEvent: "bot_mode_stop_error",
      }) === true
    );
  }

  tryStartModeWithHandler(entry, mode, nowMs, params = {}) {
    return (
      callModeHook({
        modeHandlers: this.modeHandlers,
        mode,
        hookName: "tryStartMode",
        payload: {
          entry,
          entries: this.entries,
          nowMs,
          ...params,
        },
        fallback: false,
        api: this.api,
        errorEvent: "bot_mode_try_start_error",
      }) === true
    );
  }

  getAutonomousModeDefinition(mode) {
    if (!mode || !Array.isArray(this.autonomousModes)) {
      return null;
    }
    return this.autonomousModes.find((definition) => definition?.mode === mode) ?? null;
  }

  selectWeightedMode(definitions) {
    if (!Array.isArray(definitions) || definitions.length === 0) {
      return null;
    }
    const totalWeight = definitions.reduce((sum, definition) => {
      const weight = Number(definition?.weight ?? 0);
      return weight > 0 ? sum + weight : sum;
    }, 0);
    if (totalWeight <= 0) {
      return null;
    }

    let roll = Math.random() * totalWeight;
    for (const definition of definitions) {
      const weight = Number(definition?.weight ?? 0);
      if (weight <= 0) {
        continue;
      }
      roll -= weight;
      if (roll <= 0) {
        return definition;
      }
    }
    return definitions[definitions.length - 1] ?? null;
  }

  startAutonomousMode(entry, definition, nowMs) {
    const mode = definition?.mode;
    if (!mode) {
      return false;
    }
    const strategy = definition?.strategy ?? "start";
    if (strategy === "try_start") {
      return this.tryStartModeWithHandler(
        entry,
        mode,
        nowMs,
        definition?.params ?? {}
      );
    }
    const minMs = Number(definition?.minMs ?? 0);
    const maxMs = Number(definition?.maxMs ?? minMs);
    const safeMinMs = Number.isFinite(minMs) && minMs > 0 ? minMs : 1;
    const safeMaxMs = Number.isFinite(maxMs) && maxMs >= safeMinMs ? maxMs : safeMinMs;
    return this.startModeWithHandler(
      entry,
      mode,
      nowMs,
      safeMinMs,
      safeMaxMs,
      definition?.reason ?? "auto_switch"
    );
  }

  startRoamingFallback(entry, nowMs, reason = "fallback_roaming") {
    const roamingDefinition = this.getAutonomousModeDefinition(this.behaviorMode.ROAMING);
    if (!roamingDefinition) {
      return false;
    }
    return this.startAutonomousMode(
      entry,
      {
        ...roamingDefinition,
        reason,
      },
      nowMs
    );
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
        this.activateModeWithHandler(
          entry,
          this.behaviorMode.ROAMING,
          "post_death_reset"
        );
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
      const isTransient = this.transientModes.has(state.mode);
      if (isTransient) {
        return;
      }

      if (state.mode !== manualMode) {
        const switched = this.activateModeWithHandler(
          entry,
          manualMode,
          "manual_override_resume"
        );
        if (switched) {
          this.api?.log?.("bot_mode_switch", {
            username: player.getUsername?.(),
            mode: manualMode,
            reason: "manual_override_resume",
            activeForMs: -1,
          });
        } else {
          autonomy.manualMode = null;
          autonomy.modeEndsAt = 0;
          autonomy.nextDecisionAt = 0;
          this.api?.log?.("bot_manual_mode_invalid", {
            username: player.getUsername?.(),
            mode: manualMode,
          });
          return;
        }
      }

      autonomy.nextDecisionAt = Number.MAX_SAFE_INTEGER;
      autonomy.modeEndsAt = Number.MAX_SAFE_INTEGER;
      return;
    }

    if (this.transientModes.has(state.mode)) {
      this.scheduleNextDecision(state, nowMs);
      return;
    }

    if (!this.isModeStateValid(state.mode, entry, nowMs)) {
      const stopParamsSource = this.modeStopParamsByMode[state.mode];
      const stopParams =
        typeof stopParamsSource === "function"
          ? stopParamsSource({ entry, player, state, nowMs })
          : stopParamsSource ?? {};
      if (
        !this.stopModeWithHandler(
          entry,
          state.mode,
          nowMs,
          "mode_state_invalid",
          stopParams
        )
      ) {
        this.startRoamingFallback(entry, nowMs, "mode_state_invalid");
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

    const candidates = [];
    for (const definition of this.autonomousModes) {
      const mode = definition?.mode;
      const weight = Number(definition?.weight ?? 0);
      if (!mode || weight <= 0) {
        continue;
      }
      if (!this.behaviorRequirementsMet(mode, player, state, nowMs)) {
        continue;
      }
      candidates.push(definition);
    }

    const selectedMode = this.selectWeightedMode(candidates);
    if (!selectedMode) {
      this.scheduleNextDecision(state, nowMs);
      return;
    }
    if (this.startAutonomousMode(entry, selectedMode, nowMs)) {
      return;
    }

    for (const fallbackMode of candidates) {
      if (fallbackMode === selectedMode) {
        continue;
      }
      if (this.startAutonomousMode(entry, fallbackMode, nowMs)) {
        return;
      }
    }

    this.startRoamingFallback(entry, nowMs, "auto_switch_fallback");
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
