const { Task } = require("../../../../src/main/typescript/elvarg/game/task/Task");
const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { peekMovementRequest, randomInRange } = require("../navigation/BotNavigation");
const { callModeHook } = require("../hooks/ModeHookContract");
const { clearBotActivePreset, setModePvp } = require("../state/PlayerBotState");
const {
  ATTR_RECRUIT_OWNER_USERNAME,
} = require("../../runtime/BotRecruitConstants");

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
    this.handlePersistentPvpRespawn =
      typeof options.handlePersistentPvpRespawn === "function"
        ? options.handlePersistentPvpRespawn
        : null;
    this.idleEntryStride = Number.isFinite(options.idleEntryStride)
      ? Math.max(1, Math.floor(options.idleEntryStride))
      : 2;
    this.lodConfig = this.resolveLodConfig(options.lodConfig ?? {});
    this._nextLodRefreshAt = 0;
    this._humanObserverBuckets = new Map();
    this._humanObserverCount = 0;
    this._humanObserverRevision = 0;
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
      modeSamples: Object.create(null),
    };
  }

  getModeProfile(window, mode) {
    if (!window) {
      return null;
    }
    const key = mode || "unknown";
    if (!window.modeSamples[key]) {
      window.modeSamples[key] = {
        sampledEntries: 0,
        heavyEntries: 0,
        autonomyMs: 0,
        controllerMs: 0,
        totalEntryMs: 0,
      };
    }
    return window.modeSamples[key];
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
    const topModes = Object.entries(window.modeSamples)
      .map(([mode, stats]) => ({
        mode,
        sampledEntries: stats.sampledEntries,
        heavyEntries: stats.heavyEntries,
        avgEntryMs: avg(stats.totalEntryMs, stats.sampledEntries),
        avgAutonomyMs: avg(stats.autonomyMs, stats.heavyEntries),
        avgControllerMs: avg(stats.controllerMs, stats.heavyEntries),
      }))
      .sort((a, b) => b.avgEntryMs - a.avgEntryMs)
      .slice(0, 6);
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
      topModes,
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
    const parseCacheMs = (value, fallback) =>
      Number.isFinite(value) ? Math.max(100, Math.floor(value)) : fallback;

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
      nearCacheMs: parseCacheMs(rawConfig?.nearCacheMs, 200),
      mediumCacheMs: parseCacheMs(rawConfig?.mediumCacheMs, 450),
      farCacheMs: parseCacheMs(
        rawConfig?.farCacheMs,
        Math.max(600, parseInterval(rawConfig?.refreshIntervalMs, 900))
      ),
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
    this._humanObserverRevision += 1;
    this._nextLodRefreshAt = nowMs + this.lodConfig.refreshIntervalMs;
  }

  getLocationSnapshot(player) {
    const location = player?.getLocation?.();
    if (!location) {
      return null;
    }
    const x = location.getX?.();
    const y = location.getY?.();
    const z = location.getZ?.();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return { location, x, y, z };
  }

  getStrideCacheTtlMs(stride) {
    if (stride <= this.lodConfig.nearStride) {
      return this.lodConfig.nearCacheMs;
    }
    if (stride <= this.lodConfig.mediumStride) {
      return this.lodConfig.mediumCacheMs;
    }
    return this.lodConfig.farCacheMs;
  }

  findNearestHumanObserverDistance(x, y, z, maxDistanceTiles) {
    if (this._humanObserverCount <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const chunkSize = this.lodConfig.chunkSizeTiles;
    const baseChunkX = Math.floor(x / chunkSize);
    const baseChunkY = Math.floor(y / chunkSize);
    const searchDistance = Number.isFinite(maxDistanceTiles)
      ? Math.max(0, maxDistanceTiles)
      : this.lodConfig.mediumDistanceTiles;
    const chunkRadius = Math.max(1, Math.ceil(searchDistance / chunkSize));
    let bestChebyshevDistance = Number.POSITIVE_INFINITY;

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
          if (bestChebyshevDistance <= searchDistance) {
            return bestChebyshevDistance;
          }
        }
      }
    }

    return bestChebyshevDistance;
  }

  resolveEntryStride(entry, nowMs) {
    if (!this.lodConfig.enabled) {
      return this.idleEntryStride;
    }
    this.refreshHumanObservers(nowMs);
    if (!entry?.player || this._humanObserverCount === 0) {
      return this.lodConfig.farStride;
    }
    const interactingWithRealPlayer = this.isInteractingWithRealPlayer(entry.player);
    if (interactingWithRealPlayer) {
      return this.lodConfig.nearStride;
    }

    const locationSnapshot = this.getLocationSnapshot(entry.player);
    if (!locationSnapshot) {
      return this.lodConfig.farStride;
    }

    const state = entry?.state;
    const lodCache = state?.lodStrideCache;
    if (
      lodCache &&
      lodCache.revision === this._humanObserverRevision &&
      lodCache.expiresAt > nowMs
    ) {
      return lodCache.stride;
    }

    const bestChebyshevDistance = this.findNearestHumanObserverDistance(
      locationSnapshot.x,
      locationSnapshot.y,
      locationSnapshot.z,
      this.lodConfig.mediumDistanceTiles
    );

    let stride = this.lodConfig.farStride;
    if (bestChebyshevDistance <= this.lodConfig.mediumDistanceTiles) {
      stride = this.lodConfig.mediumStride;
    }
    if (bestChebyshevDistance <= this.lodConfig.nearDistanceTiles) {
      stride = this.lodConfig.nearStride;
    }

    if (state) {
      state.lodStrideCache = {
        stride,
        revision: this._humanObserverRevision,
        expiresAt: nowMs + this.getStrideCacheTtlMs(stride),
      };
    }
    return stride;
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
    if (player.getAttribute?.(ATTR_RECRUIT_OWNER_USERNAME)) {
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
    const blockedBackoffUntil = Number(state.pathBlockedTracker?.backoffUntil ?? 0);
    let shard = Number.isFinite(state.processingShard)
      ? state.processingShard
      : Number.NaN;
    if (!Number.isFinite(shard) || shard < 0 || shard >= stride) {
      shard = Math.floor(Math.random() * stride);
      state.processingShard = shard;
    }
    if (
      blockedBackoffUntil > nowMs &&
      !this.transientModes.has(state.mode) &&
      state.mode !== this.behaviorMode?.PVP
    ) {
      const backoffStride = Math.max(4, stride * 2);
      return (this._cycleCounter + shard) % backoffStride === 0;
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
    return false;
  }

  isPersistentPvpBot(state) {
    return (
      state?.autonomy?.wildernessRoamerPvp === true ||
      state?.autonomy?.persistentPvpLoadout === true
    );
  }

  isWildernessRoamerPvpBot(state) {
    return state?.autonomy?.wildernessRoamerPvp === true;
  }

  clearDeadCombatLinks(entry) {
    const player = entry?.player;
    const state = entry?.state;
    if (!player || !state) {
      return false;
    }
    const combat = player.getCombat?.();
    const target = combat?.getTarget?.();
    const attacker = combat?.getAttacker?.();
    const following = player.getCombatFollowing?.();
    const staleTarget =
      (target && (!target.isRegistered?.() || (target.getHitpoints?.() ?? 0) <= 0)) ||
      (attacker && (!attacker.isRegistered?.() || (attacker.getHitpoints?.() ?? 0) <= 0)) ||
      (following && (!following.isRegistered?.() || (following.getHitpoints?.() ?? 0) <= 0));
    if (!staleTarget) {
      return false;
    }
    combat?.reset?.();
    combat?.setUnderAttack?.(null);
    player.setFollowing?.(null);
    player.setCombatFollowing?.(null);
    player.setMobileInteraction?.(null);
    player.setPositionToFace?.(null);
    player.getMovementQueue?.().reset?.();
    if (state?.pvp) {
      state.pvp.targetUsername = null;
      state.pvp.targetPlayer = null;
      state.pvp.currentTargetScore = 0;
      state.pvp.targetLockUntil = 0;
    }
    return true;
  }

  tryAdoptCombatAttacker(entry, nowMs) {
    const player = entry?.player;
    const state = entry?.state;
    if (!player || !state || !this.isPersistentPvpBot(state)) {
      return false;
    }
    const combat = player.getCombat?.();
    const attacker = combat?.getAttacker?.();
    if (!attacker || attacker === player) {
      return false;
    }
    if (!attacker.isRegistered?.() || (attacker.getHitpoints?.() ?? 0) <= 0) {
      return false;
    }
    const privateArea = player.getPrivateArea?.();
    if (attacker.getPrivateArea?.() !== privateArea) {
      return false;
    }

    const currentTarget = combat?.getTarget?.();
    const alreadyEngaged =
      currentTarget === attacker ||
      player.getCombatFollowing?.() === attacker ||
      state?.pvp?.targetPlayer === attacker ||
      state?.pvp?.targetUsername === attacker.getUsername?.();
    if (alreadyEngaged) {
      return false;
    }

    if (state.mode !== this.behaviorMode.PVP) {
      setModePvp(
        player,
        state,
        attacker,
        nowMs,
        30000,
        this.behaviorMode,
        { allowInCombatTransition: true }
      );
    } else if (state?.pvp) {
      state.pvp.targetUsername = attacker.getUsername?.() ?? state.pvp.targetUsername;
      state.pvp.targetPlayer = attacker;
      state.pvp.endsAt = Math.max(Number(state.pvp.endsAt ?? 0), nowMs + 30000);
      state.pvp.nextActionAt = nowMs;
      state.pvp.phase = "combat";
    }

    player.getMovementQueue?.().reset?.();
    combat?.attack?.(attacker);
    this.api?.log?.("persistent_pvp_adopt_attacker", {
      bot: player.getUsername?.() ?? null,
      attacker: attacker.getUsername?.() ?? null,
      attackerIsPlayerBot: attacker.isPlayerBot?.() === true,
    });
    return true;
  }

  hasNearbyRealPlayerOpportunity(player, state, nowMs) {
    if (!player || !this.isPersistentPvpBot(state)) {
      return false;
    }
    if (state?.mode !== this.behaviorMode.ROAMING) {
      return false;
    }
    this.refreshHumanObservers(nowMs);
    if (this._humanObserverCount === 0) {
      return false;
    }
    const locationSnapshot = this.getLocationSnapshot(player);
    if (!locationSnapshot || player.getPrivateArea?.() != null) {
      return false;
    }
    return (
      this.findNearestHumanObserverDistance(
        locationSnapshot.x,
        locationSnapshot.y,
        locationSnapshot.z,
        3
      ) <= 3
    );
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
    if (this.isFullTimePvpBot(entry?.state)) {
      const pvpDefinition = this.getAutonomousModeDefinition(this.behaviorMode.PVP);
      if (pvpDefinition) {
        return this.startAutonomousMode(
          entry,
          {
            ...pvpDefinition,
            reason: reason === "fallback_roaming" ? "fallback_pvp" : reason,
          },
          nowMs
        );
      }
      return false;
    }
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
          this.isFullTimePvpBot(state) ? this.behaviorMode.PVP : this.behaviorMode.ROAMING,
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
      if (this.isPersistentPvpBot(state) && this.handlePersistentPvpRespawn) {
        this.handlePersistentPvpRespawn(entry, nowMs);
      }
      // Clear any active preset after respawn, not during the death animation.
      clearBotActivePreset(player, state);
      state.deathResetApplied = false;
      this.scheduleNextDecision(state, nowMs);
    }

    const recruitOwnerUsername = player.getAttribute?.(ATTR_RECRUIT_OWNER_USERNAME);
    if (recruitOwnerUsername) {
      const autonomy = this.ensureAutonomyState(state);
      autonomy.manualMode = this.behaviorMode.FOLLOW_BACK;
      autonomy.nextDecisionAt = Number.MAX_SAFE_INTEGER;
      autonomy.modeEndsAt = Number.MAX_SAFE_INTEGER;
      if (!state.followTargetUsername) {
        state.followTargetUsername = recruitOwnerUsername;
      }
      const combat = player.getCombat?.();
      const inCombatWithLiveTarget = !!(
        combat?.getTarget?.() ||
        combat?.getAttacker?.() ||
        player.getCombatFollowing?.()
      );
      if (
        state.mode === this.behaviorMode.PVP &&
        !inCombatWithLiveTarget
      ) {
        this.activateModeWithHandler(
          entry,
          this.behaviorMode.FOLLOW_BACK,
          "recruit_resume_follow"
        );
      }
      if (
        state.mode !== this.behaviorMode.FOLLOW_BACK &&
        state.mode !== this.behaviorMode.PVP
      ) {
        this.activateModeWithHandler(
          entry,
          this.behaviorMode.FOLLOW_BACK,
          "recruit_lock"
        );
      }
      return;
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

    if (this.tryAdoptCombatAttacker(entry, nowMs)) {
      this.ensureDecisionScheduled(state, nowMs);
      return;
    }

    if (this.isInCombat(player)) {
      this.ensureDecisionScheduled(state, nowMs);
      return;
    }

    if (nowMs < (autonomy.nextDecisionAt ?? 0)) {
      if (this.hasNearbyRealPlayerOpportunity(player, state, nowMs)) {
        autonomy.nextDecisionAt = 0;
      } else {
        return;
      }
    }
    if (nowMs < (autonomy.modeEndsAt ?? 0)) {
      return;
    }
    if (this.shouldDelayModeDecisionWhileMoving(player, state)) {
      autonomy.nextDecisionAt = nowMs + MOVING_MODE_DECISION_DELAY_MS;
      return;
    }

    const forcePvpOnly = this.isFullTimePvpBot(state);
    const allowedAutonomousModes = Array.isArray(autonomy.allowedAutonomousModes)
      ? new Set(autonomy.allowedAutonomousModes.filter((mode) => typeof mode === "string"))
      : null;
    const candidates = [];
    for (const definition of this.autonomousModes) {
      const mode = definition?.mode;
      const weight = Number(definition?.weight ?? 0);
      if (!mode || weight <= 0) {
        continue;
      }
      if (allowedAutonomousModes && !allowedAutonomousModes.has(mode)) {
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

    if (this.isWildernessRoamerPvpBot(state)) {
      const pvpCandidate = candidates.find(
        (definition) => definition?.mode === this.behaviorMode.PVP
      );
      if (pvpCandidate && this.startAutonomousMode(entry, pvpCandidate, nowMs)) {
        return;
      }
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
      const modeProfile =
        sampleEntry && this._profileWindow
          ? this.getModeProfile(this._profileWindow, entry?.state?.mode)
          : null;
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
        this.clearDeadCombatLinks(entry);
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.sampledEntries += 1;
          if (modeProfile) {
            modeProfile.sampledEntries += 1;
          }
        }

        const combat = player.getCombat?.();
        const attacker = combat?.getAttacker?.();
        const target = combat?.getTarget?.();
        const hasPendingTraversal =
          state.awaitingDitchTransition != null ||
          state.roaming?.pendingRetry != null;
        const needsNpcAggro =
          !!this.npcAggroPolicyHandler &&
          (attacker?.isNpc?.() === true || target?.isNpc?.() === true);

        let shouldProcessHeavy = true;
        let traversalStartNs = 0n;
        let npcAggroStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          traversalStartNs = process.hrtime.bigint();
          npcAggroStartNs = process.hrtime.bigint();
        }

        if (!hasPendingTraversal && !needsNpcAggro) {
          let heavyGateStartNs = 0n;
          if (sampleEntry && this._profileWindow) {
            heavyGateStartNs = process.hrtime.bigint();
          }
          shouldProcessHeavy = this.shouldProcessEntryHeavy(entry, now);
          if (sampleEntry && this._profileWindow) {
            this._profileWindow.heavyGateMs += this.elapsedMs(heavyGateStartNs);
          }
          if (!shouldProcessHeavy) {
            continue;
          }
        }

        // Traversal processing is only needed while an actual transition/retry
        // is queued; avoid the call overhead on every idle bot tick.
        if (hasPendingTraversal && state.awaitingDitchTransition != null) {
          this.traversalService.processTransition(player, state, now);
        }
        if (hasPendingTraversal && state.roaming?.pendingRetry != null) {
          this.traversalService.processPendingRetry(player, state, now);
        }
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.traversalMs += this.elapsedMs(traversalStartNs);
        }

        // Only run NPC aggro policy when NPC combat context exists.
        if (needsNpcAggro) {
          this.npcAggroPolicyHandler.handlePlayerProcess({
            player,
            nowMs: now,
          });
        }
        if (sampleEntry && this._profileWindow) {
          this._profileWindow.npcAggroMs += this.elapsedMs(npcAggroStartNs);
        }

        if (sampleEntry && this._profileWindow) {
          this._profileWindow.heavyEntries += 1;
          if (modeProfile) {
            modeProfile.heavyEntries += 1;
          }
        }
        let autonomyStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          autonomyStartNs = process.hrtime.bigint();
        }
        this.processAutonomousMode(entry, now);
        if (sampleEntry && this._profileWindow) {
          const autonomyMs = this.elapsedMs(autonomyStartNs);
          this._profileWindow.autonomyMs += autonomyMs;
          if (modeProfile) {
            modeProfile.autonomyMs += autonomyMs;
          }
        }
        let controllerStartNs = 0n;
        if (sampleEntry && this._profileWindow) {
          controllerStartNs = process.hrtime.bigint();
        }
        entry.controller.tick(now);
        if (sampleEntry && this._profileWindow) {
          const controllerMs = this.elapsedMs(controllerStartNs);
          this._profileWindow.controllerMs += controllerMs;
          if (modeProfile) {
            modeProfile.controllerMs += controllerMs;
          }
        }
      } catch (err) {
        console.error("[bots] behavior tick failed", err);
      } finally {
        if (sampleEntry && this._profileWindow) {
          const totalEntryMs = this.elapsedMs(entryStartNs);
          this._profileWindow.totalEntryMs += totalEntryMs;
          if (modeProfile) {
            modeProfile.totalEntryMs += totalEntryMs;
          }
        }
      }
    }
    this.flushTaskProfileIfDue(now);
  }
}

module.exports = {
  BotBehaviorTask,
};
