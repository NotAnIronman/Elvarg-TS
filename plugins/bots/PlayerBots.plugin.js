const path = require("path");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const { resetMovementState } = require("./behaviours/state/PlayerBotState");
const { registerBotCommands } = require("./runtime/registerBotCommands");
const { registerBotEvents } = require("./runtime/registerBotEvents");
const { createBotPluginLogging } = require("./runtime/BotPluginLogging");
const { bootPlayerBotsRuntime } = require("./runtime/BotPluginBoot");
const {
  registerBotStatusInteractions,
} = require("./runtime/registerBotStatusInteractions");

const BOT_BEHAVIOR_MODE = Object.freeze({
  ROAMING: "roaming",
  WOODCUTTING: "woodcutting",
  MINING: "mining",
  SMELTING: "smelting",
  FIREMAKING: "firemaking",
  BANK_RUN: "bank_run",
  PVP: "pvp",
  // Backward-compat alias for in-flight references.
  SPARRING: "pvp",
  FOLLOW_BACK: "follow_back",
  RETURN_HOME: "return_home",
});
const MANUAL_CONTROL_PACKET_OPCODES = new Set([
  PacketConstants.COMMAND_MOVEMENT_OPCODE,
  PacketConstants.GAME_MOVEMENT_OPCODE,
  PacketConstants.MINIMAP_MOVEMENT_OPCODE,
  PacketConstants.OBJECT_FIRST_CLICK_OPCODE,
  PacketConstants.OBJECT_SECOND_CLICK_OPCODE,
  PacketConstants.OBJECT_THIRD_CLICK_OPCODE,
  PacketConstants.OBJECT_FOURTH_CLICK_OPCODE,
  PacketConstants.OBJECT_FIFTH_CLICK_OPCODE,
]);

function parseEnvInt(name, fallback, min = 0) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.floor(value));
}

const BOT_MODE_BEHAVIOR_OPTIONS = Object.freeze({
  endpointLingerMs: 500,
  botWalkRadius: 10,
  roamingMinMs: 22000,
  roamingMaxMs: 80000,
  wildernessDitchObjectId: ObjectIds.WILDERNESS_DITCH,
  roamingDitchCrossMaxDistanceY: 12,
  roamingDitchProbeRadius: 30,
});

const BOT_TREE_OPTIONS = Object.freeze({
  followRepathIntervalMs: 500,
  botEatLowHpRatio: 0.45,
  botEatHealMin: 12,
  botEatHealMax: 18,
  botEatMaxCharges: 16,
  botHomeRadius: 10,
  blockedRetargetMinDelayMs: 450,
});

const BOT_CONFIG = Object.freeze({
  behaviorMode: BOT_BEHAVIOR_MODE,
  botCount: 130,
  fullTimePvpBotCount: 65,
  botWalkRadius: 10,
  objectIndexCachePath: path.join(
    process.cwd(),
    "plugins",
    "bots",
    "data",
    "object-index.json"
  ),
  // Run bot behavior decisions every 2 game ticks to reduce BT pressure.
  botDecisionTicks: 2,
  botBaseCooldownMs: 1200,
  botJitterMs: 300,
  ditchAttemptCooldownMs: 1200,
  roamingDitchCrossMaxDistanceY: 12,
  ditchTransitionTimeoutMs: 15000,
  ditchPostCrossRetryDelayMs: 0,
  blockedRetargetMinDelayMs: 450,
  blockedRetargetMaxDelayMs: 900,
  // Path-blocked mitigation:
  // - dedupe repeated identical block events
  // - only re-run heavy recovery on meaningful state changes
  // - cap repeated retries with exponential backoff
  pathBlockedDuplicateEventWindowMs: 1200,
  // Minimum time between path-blocked recovery attempts per bot.
  pathBlockedHandleMinIntervalMs: 750,
  pathBlockedMeaningfulRecheckMs: 3500,
  pathBlockedMaxRepeatBeforeBackoff: 2,
  pathBlockedBackoffBaseMs: 600,
  pathBlockedBackoffMaxMs: 8000,
  pathBlockedIgnoredModes: [BOT_BEHAVIOR_MODE.PVP],
  npcAggroBlockedModes: [
    BOT_BEHAVIOR_MODE.WOODCUTTING,
    BOT_BEHAVIOR_MODE.MINING,
    BOT_BEHAVIOR_MODE.SMELTING,
    BOT_BEHAVIOR_MODE.FIREMAKING,
    BOT_BEHAVIOR_MODE.BANK_RUN,
  ],
  taskProfiler: Object.freeze({
    // Hot-path profiler is useful for diagnostics but expensive at scale.
    // Keep disabled by default and enable explicitly when needed.
    enabled: (process.env.BOT_TASK_PROFILER_ENABLED ?? "0") === "1",
    intervalMs: parseEnvInt("BOT_TASK_PROFILER_INTERVAL_MS", 10000, 1000),
    sampleStride: parseEnvInt("BOT_TASK_PROFILER_SAMPLE_STRIDE", 4, 1),
  }),
  botSpawnRadius: 14,
  botSpawnMinDistance: 2,
  botSpawnMaxAttempts: 80,
  followBackDurationMs: 3 * 60 * 1000,
  playerAttackFleeChance: 0.5,
  followBlockedRetryMs: 200,
  autoModeDecisionMinMs: 7000,
  autoModeDecisionMaxMs: 22000,
  // Throttle heavy BT work for calm/idle bots:
  // 1 = every bot every cycle, 2 = every second cycle, 3 = every third, etc.
  // Combat/traversal/transient bots still run every cycle.
  modeValidationIntervalMs: 2500,
  idleEntryStride: 4,
  // Bot LOD simulation:
  // Near real players, bots tick every cycle for responsiveness.
  // Further away, bot behavior-tree work is downsampled.
  lodConfig: Object.freeze({
    enabled: true,
    refreshIntervalMs: 900,
    nearDistanceTiles: 32,
    mediumDistanceTiles: 96,
    nearStride: 2,
    mediumStride: 4,
    farStride: 8,
  }),
  wildernessDitchObjectId: ObjectIds.WILDERNESS_DITCH,
  manualControlPacketOpcodes: MANUAL_CONTROL_PACKET_OPCODES,
  logging: Object.freeze({
    logPath: path.join(process.cwd(), "logs", "player-bots.log"),
    runtimeEventLoggingEnabled:
      (process.env.BOT_RUNTIME_EVENT_LOGGING ?? "0") === "1",
    // Mirroring high-frequency bot runtime logs into the core server logger is
    // expensive because server.log uses synchronous disk writes.
    mirrorToServerLogger: (process.env.BOT_MIRROR_CORE_LOGGING ?? "0") === "1",
    mirrorErrorsToServerLogger:
      (process.env.BOT_MIRROR_ERRORS_TO_CORE_LOGGING ?? "1") === "1",
    fileLogWritesEnabled:
      (process.env.BOT_FILE_LOG_WRITES_ENABLED ??
        (GameConstants.SERVER_LOG_WRITES_ENABLED ? "1" : "0")) === "1",
    telemetryEnabled:
      (process.env.BOT_RUNTIME_TELEMETRY_ENABLED ?? "1") === "1",
    telemetryLogPath: path.join(process.cwd(), "logs", "bot-runtime-telemetry.log"),
    telemetryIntervalMs: parseEnvInt(
      "BOT_RUNTIME_TELEMETRY_INTERVAL_MS",
      10000,
      1000
    ),
    recentLogLimit: 24,
  }),
  status: Object.freeze({
    interactionSlot: 1,
    optionLabel: "Status",
    recentLogLines: 8,
    diagnoseLogPath: path.join(process.cwd(), "logs", "diagnose-stuck-bot.log"),
  }),
  modeBehaviorOptions: BOT_MODE_BEHAVIOR_OPTIONS,
  treeOptions: BOT_TREE_OPTIONS,
});

module.exports = {
  name: "PlayerBots",
  dependsOn: ["ReplaceMapRegions"],
  register(api) {
    const { botApi, recentBotLogsByUsername } = createBotPluginLogging({
      api,
      logPath: BOT_CONFIG.logging.logPath,
      runtimeEventLoggingEnabled: BOT_CONFIG.logging.runtimeEventLoggingEnabled,
      mirrorToServerLogger: BOT_CONFIG.logging.mirrorToServerLogger,
      mirrorErrorsToServerLogger: BOT_CONFIG.logging.mirrorErrorsToServerLogger,
      fileLogWritesEnabled: BOT_CONFIG.logging.fileLogWritesEnabled,
      telemetryEnabled: BOT_CONFIG.logging.telemetryEnabled,
      telemetryLogPath: BOT_CONFIG.logging.telemetryLogPath,
      telemetryIntervalMs: BOT_CONFIG.logging.telemetryIntervalMs,
      recentLogLimit: BOT_CONFIG.logging.recentLogLimit,
    });

    const boot = bootPlayerBotsRuntime({
      api,
      botApi,
      recentBotLogsByUsername,
      config: BOT_CONFIG,
    });

    registerBotStatusInteractions({
      api,
      botStatusReporter: boot.botStatusReporter,
      statusOptionLabel: BOT_CONFIG.status.optionLabel,
      statusInteractionSlot: BOT_CONFIG.status.interactionSlot,
    });

    registerBotCommands({
      api,
      botApi,
      hasAdminRights: (player) => PlayerRights.hasAdminRights(player),
      runtime: boot.runtime,
      behaviorMode: BOT_CONFIG.behaviorMode,
      assignableBehaviors: boot.modeRegistries.assignableBehaviors,
      modeHandlers: boot.modeHandlers,
      resetMovementState,
      taskManager: TaskManager,
      flashHintArrowTaskFactory: boot.flashHintArrowTaskFactory,
    });

    registerBotEvents({
      api,
      botApi,
      runtime: boot.runtime,
      playerPersistence: GameConstants.PLAYER_PERSISTENCE,
      manualControlPacketOpcodes: BOT_CONFIG.manualControlPacketOpcodes,
      followBackTrigger: boot.followBackTrigger,
      combatReactionTrigger: boot.combatReactionTrigger,
      pathBlockedHandler: boot.pathBlockedHandler,
      npcAggroPolicyHandler: boot.npcAggroPolicyHandler,
    });

    botApi.log("registered", {
      spawned: boot.runtime.getSpawnedCount(),
      totalConfigured: BOT_CONFIG.botCount,
      fullTimePvpBotCount: BOT_CONFIG.fullTimePvpBotCount,
      walkRadius: BOT_CONFIG.botWalkRadius,
      decisionTicks: BOT_CONFIG.botDecisionTicks,
      baseCooldownMs: BOT_CONFIG.botBaseCooldownMs,
      jitterMs: BOT_CONFIG.botJitterMs,
      ditchObjectId: BOT_CONFIG.wildernessDitchObjectId,
      roamingDitchCrossMaxDistanceY: BOT_CONFIG.roamingDitchCrossMaxDistanceY,
      roamRadius: BOT_CONFIG.botWalkRadius,
      followBackDurationMs: BOT_CONFIG.followBackDurationMs,
      autoMode: {
        decisionMinMs: BOT_CONFIG.autoModeDecisionMinMs,
        decisionMaxMs: BOT_CONFIG.autoModeDecisionMaxMs,
        modes: boot.modeRegistries.autonomousModes.map((definition) => ({
          mode: definition.mode,
          strategy: definition.strategy,
          weight: definition.weight,
          minMs: definition.minMs,
          maxMs: definition.maxMs,
          hasParams: definition.params != null,
        })),
      },
      homeRadius: BOT_CONFIG.treeOptions.botHomeRadius,
    });
  },
};
