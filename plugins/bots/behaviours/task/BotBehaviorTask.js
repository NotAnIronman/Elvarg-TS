const { Task } = require("../../../../src/main/typescript/elvarg/game/task/Task");
const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { peekMovementRequest, randomInRange } = require("../navigation/BotNavigation");
const { callModeHook } = require("../hooks/ModeHookContract");
const { clearBotActivePreset } = require("../state/PlayerBotState");

const NS_PER_MS = 1_000_000n;
const MOVING_MODE_DECISION_DELAY_MS = 1500;

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
    this.npcAggroPolicyHandler = options.npcAggroPolicyHandler ?? null;
    this.modeValidationIntervalMs = Number.isFinite(options.modeValidationIntervalMs)
      ? Math.max(0, Math.floor(options.modeValidationIntervalMs))
      : 1200;
    this.idleEntryStride = Number.isFinite(options.idleEntryStride)
      ? Math.max(1, Math.floor(options.idleEntryStride))
      : 2;
    this.lodConfig = this.resolveLodConfig(options.lodConfig ?? {});
    this._nextLodRefreshAt = 0;
    this._humanObserverBuckets = new Map();
    this._humanObserverCount = 0;
    this._cycleCounter = 0;
    this.taskProfiler = this.resolveTaskProfiler(options.taskProfiler ?? {});
    this._profileWindow = this.createProfileWindow(Date.now());
  }

  resolveTaskProfiler(rawConfig) {
    const enabled = rawConfig?.enabled === true;
    const intervalMs = Number.isFinite(rawConfig?.intervalMs)
      ? Math.max(1000, Math.floor(rawConfig.intervalMs))
      : 10000;
    const sampleStride = Number.isFinite(rawConfig?.sampleStride)
      ? Math.max(1, Math.floor(rawConfig.sampleStride))
      : 2;
    return {
      enabled,
      intervalMs,
      sampleStride,
    };
  }

  createProfileWindow(nowMs) {
    return {
      startedAt: nowMs,
      sampledEntries: 0,
      heavyEntries: 0,
      traversalMs: 0,
      npcAggroMs: 0,
      heavyGateMs: 0,
      autonomyMs: 0,
      controllerMs: 0,
      totalEntryMs: 0,
    };
  }

  shouldSampleEntry(index) {
    if (!this.taskProfiler.enabled) {
      return false;
    }
    return (this._cycleCounter + index) % this.taskProfiler.sampleStride === 0;
  }

  elapsedMs(startNs, endNs = process.hrtime.bigint()) {
    return Number(endNs - startNs) / Number(NS_PER_MS);
  }

  flushTaskProfileIfDue(nowMs) {
    if (!this.taskProfiler.enabled || !this._profileWindow) {
      return;
    }
    if (nowMs - this._profileWindow.startedAt < this.taskProfiler.intervalMs) {
      return;
    }
    const window = this._profileWindow;
    this._profileWindow = this.createProfileWindow(nowMs);
    if (window.sampledEntries <= 0) {
      return;
    }
    const sampledEntries = window.sampledEntries;
    const heavyEntries = window.heavyEntries;
    const avg = (total, count) => (count > 0 ? Number((total / count).toFixed(4)) : 0);
    this.api?.log?.("bot_task_profile_snapshot", {
      windowMs: nowMs - window.startedAt,
      sampledEntries,
      heavyEntries,
      sampleStride: this.taskProfiler.sampleStride,
      avgEntryMs: avg(window.totalEntryMs, sampledEntries),
      avgTraversalMs: avg(window.traversalMs, sampledEntries),
      avgNpcAggroMs: avg(window.npcAggroMs, sampledEntries),
      avgHeavyGateMs: avg(window.heavyGateMs, sampledEntries),
      avgAutonomyMs: avg(window.autonomyMs, heavyEntries),
      avgControllerMs: avg(window.controllerMs, heavyEntries),
    });
  }

  resolveLodConfig(rawConfig) {
    const parseStride = (value, fallback) =>
      Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
    const parseDistance = (value, fallback) =>
      Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
    const parseInterval = (value, fallback) =>
      Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
    const parseChunkSize = (value, fallback) =>
      Number.isFinite(value) ? Math.max(8, Math.floor(value)) : fallback;

    const enabled = rawConfig?.enabled !== false;
    const nearDistanceTiles = parseDistance(rawConfig?.nearDistanceTiles, 32);
    const mediumDistanceTiles = Math.max(
      nearDistanceTiles,
      parseDistance(rawConfig?.mediumDistanceTiles, 96)
    );

    return {
      enabled,
      refreshIntervalMs: parseInterval(rawConfig?.refreshIntervalMs, 900),
      nearDistanceTiles,
      mediumDistanceTiles,
      chunkSizeTiles: parseChunkSize(rawConfig?.chunkSizeTiles, 32),
      nearStride: parseStride(rawConfig?.nearStride, 1),
      mediumStride: parseStride(rawConfig?.mediumStride, 2),
      farStride: parseStride(rawConfig?.farStride, this.idleEntryStride),
    };
  }

  getHumanObserverBucketKey(x, y, z) {
    const chunkSize = this.lodConfig.chunkSizeTiles;
    return `${z}:${Math.floor(x / chunkSize)}:${Math.floor(y / chunkSize)}`;
  }

  resolveModeActiveDuration(definition) {
    const minMs = Number(definition?.minMs ?? 0);
    const maxMs = Number(definition?.maxMs ?? minMs);
    const safeMinMs = Number.isFinite(minMs) && minMs > 0 ? minMs : 1;
    const safeMaxMs = Number.isFinite(maxMs) && maxMs >= safeMinMs ? maxMs : safeMinMs;
    return randomInRange(safeMinMs, safeMaxMs);
  }

  refreshHumanObservers(nowMs) {
    if (!this.lodConfig.enabled) {
      this._humanObserverBuckets.clear();
      this._humanObserverCount = 0;
      this._nextLodRefreshAt = nowMs + this.lodConfig.refreshIntervalMs;
      return;
    }
    if (nowMs < this._nextLodRefreshAt) {
      return;
    }

    const buckets = new Map();
    let observerCount = 0;
    World.getPlayers().forEach((candidate) => {
      if (!candidate || candidate.isPlayerBot?.() === true) {
        return;
      }
      if (!World.isPlayerSessionConnected(candidate)) {
        return;
      }
      const location = candidate.getLocation?.();
      if (!location) {
        return;
      }
      const observer = {
        x: location.getX?.(),
        y: location.getY?.(),
        z: location.getZ?.(),
      };
      const key = this.getHumanObserverBucketKey(observer.x, observer.y, observer.z);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(observer);
      } else {
        buckets.set(key, [observer]);
      }
      observerCount += 1;
    });

    this._humanObserverBuckets = buckets;
    this._humanObserverCount = observerCount;
    this._nextLodRefreshAt = nowMs + this.lodConfig.refreshIntervalMs;
  }

  resolveEntryStride(entry, nowMs) {
    if (!this.lodConfig.enabled) {
      return this.idleEntryStride;
    }
    this.refreshHumanObservers(nowMs);
    if (!entry?.player || this._humanObserverCount === 0) {
      return this.lodConfig.farStride;
    }
    if (this.isInteractingWithRealPlayer(entry.player)) {
      return this.lodConfig.nearStride;
    }

    const location = entry.player.getLocation?.();
    if (!location) {
      return this.lodConfig.farStride;
    }
    const x = location.getX?.();
    const y = location.getY?.();
    const z = location.getZ?.();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return this.lodConfig.farStride;
    }

    let bestChebyshevDistance = Number.POSITIVE_INFINITY;
    const chunkSize = this.lodConfig.chunkSizeTiles;
    const baseChunkX = Math.floor(x / chunkSize);
    const baseChunkY = Math.floor(y / chunkSize);
    const chunkRadius = Math.max(
      1,
      Math.ceil(this.lodConfig.mediumDistanceTiles / chunkSize)
    );
    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dy = -chunkRadius; dy <= chunkRadius; dy++) {
        const bucket = this._humanObserverBuckets.get(
          `${z}:${baseChunkX + dx}:${baseChunkY + dy}`
        );
        if (!bucket || bucket.length === 0) {
          continue;
        }
        for (const observer of bucket) {
          const distance = Math.max(
            Math.abs(observer.x - x),
            Math.abs(observer.y - y)
          );
          if (distance < bestChebyshevDistance) {
            bestChebyshevDistance = distance;
          }
          if (bestChebyshevDistance <= this.lodConfig.nearDistanceTiles) {
            return this.lodConfig.nearStride;
          }
        }
      }
    }

    if (bestChebyshevDistance <= this.lodConfig.mediumDistanceTiles) {
      return this.lodConfig.mediumStride;
    }
    return this.lodConfig.farStride;
  }

  isInteractingWithRealPlayer(player) {
    if (!player || player.isPlayerBot?.() !== true) {
      return false;
    }
    const combat = player.getCombat?.();
    const related = [
      player.getInteractingMobile?.(),
      player.getFollowing?.(),
      player.getCombatFollowing?.(),
      combat?.getTarget?.(),
      combat?.getAttacker?.(),
    ];
    for (const entity of related) {
      if (!entity || entity.isPlayer?.() !== true) {
        continue;
      }
      const other = entity.getAsPlayer?.();
      if (other && other.isPlayerBot?.() !== true && World.isPlayerSessionConnected(other)) {
        return true;
      }
    }
    return false;
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

  isTraversingBarrier(player, state) {
    if (!player || !state) {
      return false;
    }
    return (
      state.awaitingDitchTransition != null ||
      state.roaming?.pendingRetry != null ||
      player.getForceMovement?.() != null
    );
  }

  shouldDelayModeDecisionWhileMoving(player, state) {
    if (!player || !state || this.transientModes.has(state.mode)) {
      return false;
    }
    if (state.mode === this.behaviorMode?.PVP) {
      return false;
    }
    const queueSize = Number(player.getMovementQueue?.()?.size?.() ?? 0);
    if (queueSize > 0) {
      return true;
    }
    return peekMovementRequest(player) != null;
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

  ensureDecisionScheduled(state, nowMs) {
    const autonomy = this.ensureAutonomyState(state);
    if (!autonomy) {
      return;
    }
    if (!Number.isFinite(autonomy.nextDecisionAt) || autonomy.nextDecisionAt <= nowMs) {
      this.scheduleNextDecision(state, nowMs);
    }
  }

  shouldProcessEntryHeavy(entry, nowMs) {
    // Temporal sharding for performance: calm/idle bots skip heavy BT/autonomy
    // work on some cycles. Urgent bots (combat, traversal, transient, pvp) are
    // always processed every cycle for responsiveness.
    const stride = this.resolveEntryStride(entry, nowMs);
    if (stride <= 1) {
      return true;
    }
    const player = entry?.player;
    const state = entry?.state;
    if (!player || !state) {
      return true;
    }
    if (this.isInCombat(player)) {
      return true;
    }
    if (state.awaitingDitchTransition != null || state.roaming?.pendingRetry != null) {
      return true;
    }
    if (player.getForceMovement?.() != null) {
      return true;
    }
    let shard = Number.isFinite(state.processingShard)
      ? state.processingShard
      : Number.NaN;
    if (!Number.isFinite(shard) || shard < 0 || shard >= stride) {
      shard = Math.floor(Math.random() * stride);
      state.processingShard = shard;
    }
    if (state.mode === this.behaviorMode?.BANK_RUN) {
      const queueSize = Number(player.getMovementQueue?.()?.size?.() ?? 0);
      const nextActionAt = Number(state.bankRun?.nextActionAt ?? 0);
      // Bank runs can spend long periods walking to/from booths; we can
      // downsample BT work while movement is already in progress.
      if (queueSize > 0 && nowMs < nextActionAt) {
        const bankRunStride = Math.max(2, stride);
        return (this._cycleCounter + shard) % bankRunStride === 0;
      }
    }
    const queueSize = Number(player.getMovementQueue?.()?.size?.() ?? 0);
    if (
      queueSize > 0 &&
      !this.transientModes.has(state.mode) &&
      state.mode !== this.behaviorMode?.PVP
    ) {
      const movingStride = Math.max(2, stride);
      return (this._cycleCounter + shard) % movingStride === 0;
    }
    if (this.transientModes.has(state.mode)) {
      return true;
    }
    if (state.mode === this.behaviorMode?.PVP) {
      const pvpNextActionAt = Number(state.pvp?.nextActionAt ?? 0);
      if (this.isInCombat(player) || nowMs >= pvpNextActionAt) {
        return true;
      }
      const pvpStride = Math.max(2, stride);
      return (this._cycleCounter + shard) % pvpStride === 0;
    }
    return (this._cycleCounter + shard) % stride === 0;
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
    const safeMinMs = Number.isFinite(minMs) && minMs > 0 ? minMs : 1;
    const safeMaxMs = Number.isFinite(maxMs) && maxMs >= safeMinMs ? maxMs : safeMinMs;
    const activeForMs = randomInRange(safeMinMs, safeMaxMs);
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

  isFullTimePvpBot(state) {
    return state?.autonomy?.fullTimePvp === true;
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
    if (entry?.state?.mode === mode) {
      const autonomy = this.ensureAutonomyState(entry.state);
      if (autonomy) {
        const activeForMs = this.resolveModeActiveDuration(definition);
        autonomy.modeEndsAt = nowMs + activeForMs;
        this.scheduleNextDecision(entry.state, nowMs);
      }
      return true;
    }
    return this.startModeWithHandler(
      entry,
      mode,
      nowMs,
      Number(definition?.minMs ?? 1),
      Number(definition?.maxMs ?? definition?.minMs ?? 1),
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

    // Ensure bot-specific temporary modes (follow-back/pvp/return-home)
    // are cleared after death so the bot resumes normal autonomous behavior.
    if (deadOrDying) {
      if (!state.deathResetApplied) {
        this.activateModeWithHandler(
          entry,
          this.behaviorMode.ROAMING,
          "post_death_reset"
        );
        state.virtualFoodChargesRemaining = null;
        state.nextNoFoodLogAt = 0;
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
      // Clear any active preset after respawn, not during the death animation.
      clearBotActivePreset(player);
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

      if (autonomy.nextDecisionAt !== Number.MAX_SAFE_INTEGER) {
        autonomy.nextDecisionAt = Number.MAX_SAFE_INTEGER;
      }
      if (autonomy.modeEndsAt !== Number.MAX_SAFE_INTEGER) {
        autonomy.modeEndsAt = Number.MAX_SAFE_INTEGER;
      }
      return;
    }

    if (this.transientModes.has(state.mode)) {
      this.ensureDecisionScheduled(state, nowMs);
      return;
    }

    if (this.isTraversingBarrier(player, state)) {
      return;
    }

    const modeValidationDueAt = Number(autonomy.nextModeValidationAt ?? 0);
    // Mode-state validation can be expensive (hook fan-out per bot), so we
    // rate-limit it instead of running every cycle for every bot.
    if (modeValidationDueAt <= nowMs) {
      autonomy.nextModeValidationAt = nowMs + this.modeValidationIntervalMs;
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
    }

    if (this.isInCombat(player)) {
      this.ensureDecisionScheduled(state, nowMs);
      return;
    }

    if (nowMs < (autonomy.nextDecisionAt ?? 0)) {
      return;
    }
    if (nowMs < (autonomy.modeEndsAt ?? 0)) {
      return;
    }
    if (this.shouldDelayModeDecisionWhileMoving(player, state)) {
      autonomy.nextDecisionAt = nowMs + MOVING_MODE_DECISION_DELAY_MS;
      return;
    }

    const forcePvpOnly = this.isFullTimePvpBot(state);
    const candidates = [];
    for (const definition of this.autonomousModes) {
      const mode = definition?.mode;
      const weight = Number(definition?.weight ?? 0);
      if (!mode || weight <= 0) {
        continue;
      }
      if (forcePvpOnly && mode !== this.behaviorMode.PVP) {
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
    this._cycleCounter = (this._cycleCounter + 1) & 0x7fffffff;
    for (let index = 0; index < this.entries.length; index++) {
      const entry = this.entries[index];
      const sampleEntry = this.shouldSampleEntry(index);
      let entryStartNs = 0n;
      if (sampleEntry && this._profileWindow) {
        entryStartNs = process.hrtime.bigint();
      }
      try {
        const state = entry?.state;
        const player = entry?.player;
        if (!player || !state) {
          continue;
        }
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.sampledEntries += 1;
        }

        // Traversal processing is only needed while an actual transition/retry
        // is queued; avoid the call overhead on every idle bot tick.
        let traversalStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          traversalStartNs = process.hrtime.bigint();
        }
        if (state.awaitingDitchTransition != null) {
          this.traversalService.processTransition(player, state, now);
        }
        if (state.roaming?.pendingRetry != null) {
          this.traversalService.processPendingRetry(player, state, now);
        }
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.traversalMs += this.elapsedMs(traversalStartNs);
        }

        // Only run NPC aggro policy when NPC combat context exists.
        let npcAggroStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          npcAggroStartNs = process.hrtime.bigint();
        }
        if (this.npcAggroPolicyHandler) {
          const combat = player.getCombat?.();
          const attacker = combat?.getAttacker?.();
          const target = combat?.getTarget?.();
          if (attacker?.isNpc?.() === true || target?.isNpc?.() === true) {
            this.npcAggroPolicyHandler.handlePlayerProcess({
              player,
              nowMs: now,
            });
          }
        }
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.npcAggroMs += this.elapsedMs(npcAggroStartNs);
        }

        let heavyGateStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          heavyGateStartNs = process.hrtime.bigint();
        }
        const shouldProcessHeavy = this.shouldProcessEntryHeavy(entry, now);
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.heavyGateMs += this.elapsedMs(heavyGateStartNs);
        }
        if (!shouldProcessHeavy) {
          continue;
        }
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.heavyEntries += 1;
        }
        let autonomyStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          autonomyStartNs = process.hrtime.bigint();
        }
        this.processAutonomousMode(entry, now);
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.autonomyMs += this.elapsedMs(autonomyStartNs);
        }
        let controllerStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          controllerStartNs = process.hrtime.bigint();
        }
        entry.controller.tick(now);
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.controllerMs += this.elapsedMs(controllerStartNs);
        }
      } catch (err) {
        console.error("[bots] behavior tick failed", err);
      } finally {
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.totalEntryMs += this.elapsedMs(entryStartNs);
        }
      }
    }
    this.flushTaskProfileIfDue(now);
  }
}

module.exports = {
  BotBehaviorTask,
};
