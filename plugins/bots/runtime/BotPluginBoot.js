const { GameConstants } = require("../../../src/main/typescript/elvarg/game/GameConstants");
const { PluginManager } = require("../../../src/main/typescript/elvarg/plugins/PluginManager");
const { TaskManager } = require("../../../src/main/typescript/elvarg/game/task/TaskManager");
const { World } = require("../../../src/main/typescript/elvarg/game/World");
const { Misc } = require("../../../src/main/typescript/elvarg/util/Misc");
const { BotController } = require("../../../src/main/typescript/elvarg/game/bot/BehaviorTree");
const { createTraversalAssist } = require("../lib/TraversalAssist");
const { randomInRange, peekMovementRequest } = require("../behaviours/navigation/BotNavigation");
const {
  createSpawnOffsets,
  spawnLocationForIndex,
} = require("../behaviours/spawn/BotSpawnLayout");
const { createBotPlayer } = require("../behaviours/spawn/BotPlayerFactory");
const {
  clearFollowState,
  createInitialState,
  resetMovementState,
} = require("../behaviours/state/PlayerBotState");
const {
  PlayerBotBehaviorTreeFactory,
} = require("../behaviours/branches/PlayerBotBehaviorTreeFactory");
const { BotBehaviorTask } = require("../behaviours/task/BotBehaviorTask");
const { DitchTraversalService } = require("../behaviours/traversal/DitchTraversalService");
const { PathBlockedHandler } = require("../behaviours/traversal/PathBlockedHandler");
const { FollowBackTrigger } = require("../behaviours/handlers/FollowBackTrigger");
const { CombatReactionTrigger } = require("../behaviours/handlers/CombatReactionTrigger");
const { NpcAggroPolicyHandler } = require("../behaviours/handlers/NpcAggroPolicyHandler");
const {
  validateModeHandlerContracts,
  callModeHook,
} = require("../behaviours/hooks/ModeHookContract");
const {
  createModeHandlers,
  buildModeRegistries,
} = require("../behaviours/factory/BotModeFactory");
const { FollowBackModeHandler } = require("../behaviours/modes/FollowBackModeHandler");
const { ReturnHomeModeHandler } = require("../behaviours/modes/ReturnHomeModeHandler");
const { createBotRegistry } = require("./BotRegistry");
const { BotStatusReporter } = require("./BotStatusReporter");
const { FlashHintArrowTask } = require("./FlashHintArrowTask");

function collectTrackedObjectIdsFromModes({ modeHandlers, api }) {
  const objectIds = new Set();
  for (const mode of Object.keys(modeHandlers ?? {})) {
    const ids = callModeHook({
      modeHandlers,
      mode,
      hookName: "collectTrackedObjectIds",
      payload: {},
      fallback: [],
      api,
      errorEvent: "bot_mode_collect_tracked_object_ids_error",
    });
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const objectId of ids) {
      if (Number.isFinite(objectId)) {
        objectIds.add(objectId);
      }
    }
  }
  return objectIds;
}

function bootPlayerBotsRuntime(options = {}) {
  const api = options.api;
  const botApi = options.botApi ?? api;
  const config = options.config ?? {};
  const behaviorMode = config.behaviorMode;
  const recentBotLogsByUsername = options.recentBotLogsByUsername ?? new Map();
  const runtimeEventLoggingEnabled = config.logging?.runtimeEventLoggingEnabled === true;
  const statusRecentLogLines = Number.isFinite(config.status?.recentLogLines)
    ? Math.max(1, Math.floor(config.status.recentLogLines))
    : 8;

  const spawn = GameConstants.DEFAULT_LOCATION.clone();
  const botStatesByName = new Map();
  const botmeUsernames = new Set();
  const playerBotUsernames = new Set();
  const entries = [];
  const entriesByUsername = new Map();
  const modeHandlers = {};
  const traversalAssist = createTraversalAssist(botApi, {
    objectIds: [config.wildernessDitchObjectId],
  });

  const { requiredHooksByMode } = createModeHandlers({
    botStatesByName,
    api: botApi,
    behaviorMode,
    modeHandlers,
    objectSearch: traversalAssist,
    options: config.modeBehaviorOptions ?? {},
  });
  modeHandlers[behaviorMode.FOLLOW_BACK] = new FollowBackModeHandler({
    behaviorMode,
    followBlockedRetryMs: config.followBlockedRetryMs,
  });
  modeHandlers[behaviorMode.RETURN_HOME] = new ReturnHomeModeHandler();

  const modeRegistries = buildModeRegistries(behaviorMode);
  validateModeHandlerContracts(
    modeHandlers,
    requiredHooksByMode,
    botApi,
    "player_bots_mode_handlers"
  );

  const trackedTraversalObjectIds = new Set([config.wildernessDitchObjectId]);
  for (const objectId of collectTrackedObjectIdsFromModes({
    modeHandlers,
    api: botApi,
  })) {
    trackedTraversalObjectIds.add(objectId);
  }
  traversalAssist.trackObjectIds([...trackedTraversalObjectIds]);
  traversalAssist.preloadRegionsAround(
    spawn.getX(),
    spawn.getY(),
    config.botResourceIndexRegionRadius
  );
  traversalAssist.rebuildTrackedIndexFromLoadedMapObjects();

  const traversalService = new DitchTraversalService({
    api: botApi,
    traversalAssist,
    objectId: config.wildernessDitchObjectId,
    emitObjectInteraction: (interaction) =>
      PluginManager.emitObjectInteraction(interaction),
    options: {
      behaviorMode,
      modeHandlers,
      ditchAttemptCooldownMs: config.ditchAttemptCooldownMs,
      ditchPostCrossRetryDelayMs: config.ditchPostCrossRetryDelayMs,
      ditchTransitionTimeoutMs: config.ditchTransitionTimeoutMs,
    },
  });

  const treeFactory = new PlayerBotBehaviorTreeFactory(botStatesByName, botApi, {
    behaviorMode,
    ...(config.treeOptions ?? {}),
    modeHandlers,
  });

  const pathBlockedHandler = new PathBlockedHandler({
    botStatesByName,
    traversalService,
    api: botApi,
    modeHandlers,
    options: {
      blockedRetargetMinDelayMs: config.blockedRetargetMinDelayMs,
      blockedRetargetMaxDelayMs: config.blockedRetargetMaxDelayMs,
      duplicateEventWindowMs: config.pathBlockedDuplicateEventWindowMs,
      meaningfulRecheckMs: config.pathBlockedMeaningfulRecheckMs,
      maxRepeatBeforeBackoff: config.pathBlockedMaxRepeatBeforeBackoff,
      backoffBaseMs: config.pathBlockedBackoffBaseMs,
      backoffMaxMs: config.pathBlockedBackoffMaxMs,
    },
  });
  const npcAggroPolicyHandler = new NpcAggroPolicyHandler({
    botStatesByName,
    modeHandlers,
    api: botApi,
  });

  const spawnOffsets = createSpawnOffsets(
    config.botCount,
    config.botSpawnRadius,
    config.botSpawnMinDistance,
    config.botSpawnMaxAttempts
  );

  let runtime = null;
  let behaviorTaskStarted = false;
  const randomizedCooldownMs = () =>
    config.botBaseCooldownMs + randomInRange(-config.botJitterMs, config.botJitterMs);
  const createController = (player, location, initialDelayMs) =>
    new BotController(
      player,
      location.getX(),
      location.getY(),
      location.getZ(),
      treeFactory.create(randomizedCooldownMs(), initialDelayMs)
    );

  const ensureBehaviorTaskStarted = () => {
    if (behaviorTaskStarted || !runtime || runtime.entries.length === 0) {
      return;
    }
    TaskManager.submit(
      new BotBehaviorTask(runtime.entries, traversalService, config.botDecisionTicks, {
        api: botApi,
        behaviorMode,
        modeHandlers,
        decisionDelayMinMs: config.autoModeDecisionMinMs,
        decisionDelayMaxMs: config.autoModeDecisionMaxMs,
        autonomousModes: modeRegistries.autonomousModes,
        transientModes: [
          behaviorMode.FOLLOW_BACK,
          behaviorMode.RETURN_HOME,
          behaviorMode.BANK_RUN,
        ],
        modeStopParamsByMode: modeRegistries.modeStopParamsByMode,
        npcAggroPolicyHandler,
        modeValidationIntervalMs: config.modeValidationIntervalMs,
        idleEntryStride: config.idleEntryStride,
        lodConfig: config.lodConfig,
      })
    );
    behaviorTaskStarted = true;
  };

  runtime = createBotRegistry({
    botApi,
    botCount: config.botCount,
    fullTimePvpBotCount: config.fullTimePvpBotCount,
    botBaseCooldownMs: config.botBaseCooldownMs,
    spawn,
    spawnOffsets,
    behaviorMode,
    createBotPlayer,
    spawnLocationForIndex,
    createInitialState,
    createController,
    ensureBehaviorTaskStarted,
    emitPlayerLogin: (event) => PluginManager.emitPlayerLogin(event),
    worldGetPlayerByName: (name) => World.getPlayerByName(name),
    formatText: (value) => Misc.formatText(value),
    resetMovementState,
    clearFollowState,
    randomInRange,
    botStatesByName,
    botmeUsernames,
    playerBotUsernames,
    entries,
    entriesByUsername,
  });

  const botStatusReporter = new BotStatusReporter({
    api: botApi,
    botStatesByName,
    recentBotLogsByUsername,
    runtimeEventLoggingEnabled,
    recentLogLines: statusRecentLogLines,
    diagnoseLogPath: config.status?.diagnoseLogPath,
    peekMovementRequest,
  });

  const followBackTrigger = new FollowBackTrigger({
    botStatesByName: runtime.botStatesByName,
    playerBotUsernames: runtime.playerBotUsernames,
    modeHandlers,
    api: botApi,
    options: {
      behaviorMode,
      botStatusReporter,
    },
  });
  const combatReactionTrigger = new CombatReactionTrigger({
    botStatesByName: runtime.botStatesByName,
    playerBotUsernames: runtime.playerBotUsernames,
    modeHandlers,
    api: botApi,
    options: {
      behaviorMode,
      followBackDurationMs: config.followBackDurationMs,
      playerRunAwayChance: config.playerAttackFleeChance,
    },
  });

  for (const [mode, handler] of Object.entries(modeHandlers)) {
    if (typeof handler?.registerEvents !== "function") {
      continue;
    }
    try {
      handler.registerEvents({
        api,
        botApi,
        runtime,
        behaviorMode,
      });
    } catch (err) {
      botApi.log("bot_mode_register_events_error", {
        mode,
        error: String(err?.message ?? err),
      });
    }
  }

  runtime.scheduleInitialSpawn();

  return {
    runtime,
    modeHandlers,
    modeRegistries,
    pathBlockedHandler,
    npcAggroPolicyHandler,
    followBackTrigger,
    combatReactionTrigger,
    botStatusReporter,
    flashHintArrowTaskFactory: (player, target) =>
      new FlashHintArrowTask(player, target),
  };
}

module.exports = {
  bootPlayerBotsRuntime,
};
