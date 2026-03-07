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

const BOT_MODE_BEHAVIOR_OPTIONS = Object.freeze({
  endpointLingerMs: 500,
  botWalkRadius: 10,
  roamingMinMs: 22000,
  roamingMaxMs: 80000,
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
  botResourceIndexRegionRadius: 1,
  botDecisionTicks: 1,
  botBaseCooldownMs: 1200,
  botJitterMs: 300,
  ditchAttemptCooldownMs: 1200,
  ditchTransitionTimeoutMs: 15000,
  ditchPostCrossRetryDelayMs: 0,
  blockedRetargetMinDelayMs: 450,
  blockedRetargetMaxDelayMs: 900,
  // Path-blocked mitigation:
  // - dedupe repeated identical block events
  // - only re-run heavy recovery on meaningful state changes
  // - cap repeated retries with exponential backoff
  pathBlockedDuplicateEventWindowMs: 650,
  pathBlockedMeaningfulRecheckMs: 1500,
  pathBlockedMaxRepeatBeforeBackoff: 4,
  pathBlockedBackoffBaseMs: 400,
  pathBlockedBackoffMaxMs: 8000,
  botSpawnRadius: 14,
  botSpawnMinDistance: 2,
  botSpawnMaxAttempts: 80,
  followBackDurationMs: 3 * 60 * 1000,
  playerAttackFleeChance: 0.5,
  followBlockedRetryMs: 200,
  autoModeDecisionMinMs: 4500,
  autoModeDecisionMaxMs: 14000,
  // Throttle heavy BT work for calm/idle bots:
  // 1 = every bot every cycle, 2 = every second cycle, 3 = every third, etc.
  // Combat/traversal/transient bots still run every cycle.
  modeValidationIntervalMs: 1200,
  idleEntryStride: 3,
  // Bot LOD simulation:
  // Near real players, bots tick every cycle for responsiveness.
  // Further away, bot behavior-tree work is downsampled.
  lodConfig: Object.freeze({
    enabled: true,
    refreshIntervalMs: 900,
    nearDistanceTiles: 32,
    mediumDistanceTiles: 96,
    nearStride: 1,
    mediumStride: 2,
    farStride: 4,
  }),
  wildernessDitchObjectId: ObjectIds.WILDERNESS_DITCH,
  manualControlPacketOpcodes: MANUAL_CONTROL_PACKET_OPCODES,
  logging: Object.freeze({
    logPath: path.join(process.cwd(), "logs", "player-bots.log"),
    runtimeEventLoggingEnabled:
      (process.env.BOT_RUNTIME_EVENT_LOGGING ?? "1") === "1",
    fileLogWritesEnabled:
      (process.env.BOT_FILE_LOG_WRITES_ENABLED ??
        (GameConstants.SERVER_LOG_WRITES_ENABLED ? "1" : "0")) === "1",
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
      fileLogWritesEnabled: BOT_CONFIG.logging.fileLogWritesEnabled,
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
