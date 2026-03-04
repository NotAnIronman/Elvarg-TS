const fs = require("fs");
const path = require("path");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { PluginManager } = require("../../src/main/typescript/elvarg/plugins/PluginManager");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { BotController } = require("../../src/main/typescript/elvarg/game/bot/BehaviorTree");
const { createTraversalAssist } = require("./lib/TraversalAssist");
const {
  randomInRange,
} = require("./behaviours/navigation/BotNavigation");
const {
  createSpawnOffsets,
  spawnLocationForIndex,
} = require("./behaviours/spawn/BotSpawnLayout");
const { createBotPlayer } = require("./behaviours/spawn/BotPlayerFactory");
const {
  clearFollowState,
  createInitialState,
  resetMovementState,
  setModeMining,
} = require("./behaviours/state/PlayerBotState");
const {
  PlayerBotBehaviorTreeFactory,
} = require("./behaviours/branches/PlayerBotBehaviorTreeFactory");
const { RoamingBehavior } = require("./behaviours/modes/RoamingBehavior");
const { WoodcuttingBehavior } = require("./behaviours/modes/WoodcuttingBehavior");
const { MiningBehavior } = require("./behaviours/modes/MiningBehavior");
const { BankRunBehavior } = require("./behaviours/modes/BankRunBehavior");
const { FiremakingBehavior } = require("./behaviours/modes/FiremakingBehavior");
const { SparringBehavior } = require("./behaviours/modes/SparringBehavior");
const { BotBehaviorTask } = require("./behaviours/task/BotBehaviorTask");
const { DitchTraversalService } = require("./behaviours/traversal/DitchTraversalService");
const { PathBlockedHandler } = require("./behaviours/traversal/PathBlockedHandler");
const { FollowBackTrigger } = require("./behaviours/handlers/FollowBackTrigger");
const {
  validateModeHandlerContracts,
} = require("./behaviours/hooks/ModeHookContract");
const { createBotRegistry } = require("./runtime/BotRegistry");
const { registerBotCommands } = require("./runtime/registerBotCommands");
const { registerBotEvents } = require("./runtime/registerBotEvents");

const BOT_COUNT = 60;
const BOT_WALK_RADIUS = 6;
const BOT_DECISION_TICKS = 1;
const BOT_BASE_COOLDOWN_MS = 1200;
const BOT_JITTER_MS = 300;
const FORCE_ALL_BOTS_MODE_FOR_DIAG = null;
const DITCH_ATTEMPT_COOLDOWN_MS = 1200;
const DITCH_TRANSITION_TIMEOUT_MS = 15000;
const DITCH_POST_CROSS_RETRY_DELAY_MS = 0;
const ENDPOINT_LINGER_MS = 500;
const BLOCKED_RETARGET_MIN_DELAY_MS = 450;
const BLOCKED_RETARGET_MAX_DELAY_MS = 900;
const BOT_SPAWN_RADIUS = 14;
const BOT_SPAWN_MIN_DISTANCE = 2;
const BOT_SPAWN_MAX_ATTEMPTS = 80;
const BOT_HOME_RADIUS = BOT_WALK_RADIUS;
const FOLLOW_BACK_DURATION_MS = 3 * 60 * 1000;
const FOLLOW_REPATH_INTERVAL_MS = 500;
const FOLLOW_BLOCKED_RETRY_MS = 200;
const AUTO_MODE_DECISION_MIN_MS = 4500;
const AUTO_MODE_DECISION_MAX_MS = 14000;
const AUTO_MODE_ROAMING_MIN_MS = 22000;
const AUTO_MODE_ROAMING_MAX_MS = 80000;
const AUTO_MODE_WOODCUTTING_MIN_MS = 30000;
const AUTO_MODE_WOODCUTTING_MAX_MS = 105000;
const AUTO_MODE_MINING_MIN_MS = 30000;
const AUTO_MODE_MINING_MAX_MS = 105000;
const AUTO_MODE_FIREMAKING_MIN_MS = 22000;
const AUTO_MODE_FIREMAKING_MAX_MS = 70000;
const AUTO_MODE_SPARRING_MIN_MS = 18000;
const AUTO_MODE_SPARRING_MAX_MS = 50000;
const AUTO_MODE_POST_SPARRING_COOLDOWN_MIN_MS = 35000;
const AUTO_MODE_POST_SPARRING_COOLDOWN_MAX_MS = 110000;
const AUTO_MODE_SPARRING_MAX_DISTANCE_TILES = 16;
const AUTO_MODE_ROAM_WEIGHT = 0.4;
const AUTO_MODE_WOODCUTTING_WEIGHT = 0.3;
const AUTO_MODE_MINING_WEIGHT = 0.15;
const AUTO_MODE_FIREMAKING_WEIGHT = 0.15;
const AUTO_MODE_SPARRING_WEIGHT = 0.15;
const BOT_BEHAVIOR_MODE = Object.freeze({
  ROAMING: "roaming",
  WOODCUTTING: "woodcutting",
  MINING: "mining",
  FIREMAKING: "firemaking",
  BANK_RUN: "bank_run",
  SPARRING: "sparring",
  FOLLOW_BACK: "follow_back",
  RETURN_HOME: "return_home",
});
const ASSIGNABLE_BEHAVIORS = Object.freeze({
  roaming: BOT_BEHAVIOR_MODE.ROAMING,
  woodcutting: BOT_BEHAVIOR_MODE.WOODCUTTING,
  mining: BOT_BEHAVIOR_MODE.MINING,
  firemaking: BOT_BEHAVIOR_MODE.FIREMAKING,
});
const REQUIRED_MODE_HOOKS_BY_MODE = Object.freeze({
  [BOT_BEHAVIOR_MODE.ROAMING]: ["activateMode", "startMode"],
  [BOT_BEHAVIOR_MODE.WOODCUTTING]: [
    "activateMode",
    "startMode",
    "onBankRunResume",
    "getTraversalTarget",
    "setTraversalTarget",
    "handleBlocked",
  ],
  [BOT_BEHAVIOR_MODE.MINING]: [
    "activateMode",
    "startMode",
    "onBankRunResume",
    "getTraversalTarget",
    "setTraversalTarget",
    "handleBlocked",
  ],
  [BOT_BEHAVIOR_MODE.BANK_RUN]: [
    "getTraversalTarget",
    "setTraversalTarget",
    "handleBlocked",
    "onPostTraversalRetryScheduled",
    "getModeLogContext",
  ],
  [BOT_BEHAVIOR_MODE.FIREMAKING]: [
    "registerEvents",
    "behaviorRequirementsMet",
    "activateMode",
    "startMode",
    "onBankRunResume",
    "handleBlocked",
    "getTraversalTarget",
    "setTraversalTarget",
  ],
  [BOT_BEHAVIOR_MODE.SPARRING]: [
    "behaviorRequirementsMet",
    "tryStartMode",
    "stopMode",
    "isModeStateValid",
    "handleBlocked",
  ],
});

const WILDERNESS_DITCH_OBJECT_ID = ObjectIds.WILDERNESS_DITCH;
const PLAYER_BOTS_LOG_PATH = path.join(process.cwd(), "logs", "player-bots.log");
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
const AUTONOMOUS_MODE_DEFINITIONS = Object.freeze([
  {
    mode: BOT_BEHAVIOR_MODE.SPARRING,
    strategy: "try_start",
    weight: AUTO_MODE_SPARRING_WEIGHT,
    params: {
      sparringMinMs: AUTO_MODE_SPARRING_MIN_MS,
      sparringMaxMs: AUTO_MODE_SPARRING_MAX_MS,
      sparringMaxDistanceTiles: AUTO_MODE_SPARRING_MAX_DISTANCE_TILES,
      postSparringCooldownMinMs: AUTO_MODE_POST_SPARRING_COOLDOWN_MIN_MS,
      postSparringCooldownMaxMs: AUTO_MODE_POST_SPARRING_COOLDOWN_MAX_MS,
    },
  },
  {
    mode: BOT_BEHAVIOR_MODE.FIREMAKING,
    strategy: "start",
    weight: AUTO_MODE_FIREMAKING_WEIGHT,
    minMs: AUTO_MODE_FIREMAKING_MIN_MS,
    maxMs: AUTO_MODE_FIREMAKING_MAX_MS,
  },
  {
    mode: BOT_BEHAVIOR_MODE.WOODCUTTING,
    strategy: "start",
    weight: AUTO_MODE_WOODCUTTING_WEIGHT,
    minMs: AUTO_MODE_WOODCUTTING_MIN_MS,
    maxMs: AUTO_MODE_WOODCUTTING_MAX_MS,
  },
  {
    mode: BOT_BEHAVIOR_MODE.MINING,
    strategy: "start",
    weight: AUTO_MODE_MINING_WEIGHT,
    minMs: AUTO_MODE_MINING_MIN_MS,
    maxMs: AUTO_MODE_MINING_MAX_MS,
  },
  {
    mode: BOT_BEHAVIOR_MODE.ROAMING,
    strategy: "start",
    weight: AUTO_MODE_ROAM_WEIGHT,
    minMs: AUTO_MODE_ROAMING_MIN_MS,
    maxMs: AUTO_MODE_ROAMING_MAX_MS,
  },
]);

function randomizedCooldownMs() {
  return BOT_BASE_COOLDOWN_MS + randomInRange(-BOT_JITTER_MS, BOT_JITTER_MS);
}

function applyForcedModeForDiagnosis(player, state) {
  if (FORCE_ALL_BOTS_MODE_FOR_DIAG !== "mining") {
    return;
  }
  setModeMining(player, state, BOT_BEHAVIOR_MODE);
  if (!state.autonomy) {
    state.autonomy = {};
  }
  state.autonomy.manualMode = BOT_BEHAVIOR_MODE.MINING;
  state.autonomy.modeEndsAt = Number.MAX_SAFE_INTEGER;
  state.autonomy.nextDecisionAt = Number.MAX_SAFE_INTEGER;
}

class FlashHintArrowTask extends Task {
  constructor(player, target, flashes = 6) {
    super(2);
    this.player = player;
    this.target = target;
    this.flashes = flashes;
    this.step = 0;
  }

  sendHint(show) {
    if (!this.player?.isRegistered?.()) {
      return;
    }
    if (show) {
      this.player.getPacketSender().sendEntityHint(this.target);
    } else {
      this.player.getPacketSender().sendEntityHintRemoval(true);
    }
  }

  execute() {
    if (!this.target?.isRegistered?.()) {
      this.player.getPacketSender().sendEntityHintRemoval(true);
      this.stop();
      return;
    }

    this.sendHint(this.step % 2 === 0);
    this.step++;
    if (this.step >= this.flashes * 2) {
      this.player.getPacketSender().sendEntityHintRemoval(true);
      this.stop();
    }
  }
}

module.exports = {
  name: "PlayerBots",
  dependsOn: ["ReplaceMapRegions"],
  register(api) {
    const writeBotLog = (message, extra) => {
      try {
        const timestamp = new Date().toISOString();
        const suffix =
          extra && Object.keys(extra).length > 0
            ? ` ${JSON.stringify(extra)}`
            : "";
        fs.appendFileSync(PLAYER_BOTS_LOG_PATH, `[${timestamp}] ${message}${suffix}\n`);
      } catch (_) {
        // Keep bot behavior running even if file logging fails.
      }
    };

    const botApi = Object.create(api);
    botApi.log = (message, extra) => {
      api.log(message, extra);
      writeBotLog(message, extra);
    };

    try {
      fs.mkdirSync(path.dirname(PLAYER_BOTS_LOG_PATH), { recursive: true });
      fs.writeFileSync(PLAYER_BOTS_LOG_PATH, "");
      writeBotLog("log_reset");
    } catch (err) {
      api.log("bot_log_init_failed", {
        path: PLAYER_BOTS_LOG_PATH,
        error: String(err?.message ?? err),
      });
    }

    const spawn = GameConstants.DEFAULT_LOCATION.clone();
    const botStatesByName = new Map();
    const botmeUsernames = new Set();
    const playerBotUsernames = new Set();
    const entries = [];
    const entriesByUsername = new Map();
    const modeHandlers = {};

    const roamingBehavior = new RoamingBehavior(botStatesByName, {
      api: botApi,
      behaviorMode: BOT_BEHAVIOR_MODE,
      endpointLingerMs: ENDPOINT_LINGER_MS,
      botWalkRadius: BOT_WALK_RADIUS,
      roamingMinMs: AUTO_MODE_ROAMING_MIN_MS,
      roamingMaxMs: AUTO_MODE_ROAMING_MAX_MS,
    });
    const woodcuttingBehavior = new WoodcuttingBehavior(botStatesByName, botApi, {
      behaviorMode: BOT_BEHAVIOR_MODE,
      botWalkRadius: BOT_WALK_RADIUS,
    });
    const miningBehavior = new MiningBehavior(botStatesByName, botApi, {
      behaviorMode: BOT_BEHAVIOR_MODE,
      botWalkRadius: BOT_WALK_RADIUS,
    });
    const bankRunBehavior = new BankRunBehavior(botStatesByName, botApi, {
      behaviorMode: BOT_BEHAVIOR_MODE,
      modeHandlers,
    });
    const firemakingBehavior = new FiremakingBehavior(botStatesByName, botApi, {
      behaviorMode: BOT_BEHAVIOR_MODE,
    });
    const sparringBehavior = new SparringBehavior(botStatesByName, botApi, {
      behaviorMode: BOT_BEHAVIOR_MODE,
    });
    modeHandlers[BOT_BEHAVIOR_MODE.ROAMING] = roamingBehavior;
    modeHandlers[BOT_BEHAVIOR_MODE.WOODCUTTING] = woodcuttingBehavior;
    modeHandlers[BOT_BEHAVIOR_MODE.MINING] = miningBehavior;
    modeHandlers[BOT_BEHAVIOR_MODE.BANK_RUN] = bankRunBehavior;
    modeHandlers[BOT_BEHAVIOR_MODE.FIREMAKING] = firemakingBehavior;
    modeHandlers[BOT_BEHAVIOR_MODE.SPARRING] = sparringBehavior;

    validateModeHandlerContracts(
      modeHandlers,
      REQUIRED_MODE_HOOKS_BY_MODE,
      botApi,
      "player_bots_mode_handlers"
    );

    const traversalAssist = createTraversalAssist(botApi, {
      objectIds: [WILDERNESS_DITCH_OBJECT_ID],
    });
    const traversalService = new DitchTraversalService({
      api: botApi,
      traversalAssist,
      objectId: WILDERNESS_DITCH_OBJECT_ID,
      emitObjectInteraction: (interaction) =>
        PluginManager.emitObjectInteraction(interaction),
      options: {
        behaviorMode: BOT_BEHAVIOR_MODE,
        modeHandlers,
        ditchAttemptCooldownMs: DITCH_ATTEMPT_COOLDOWN_MS,
        ditchPostCrossRetryDelayMs: DITCH_POST_CROSS_RETRY_DELAY_MS,
        ditchTransitionTimeoutMs: DITCH_TRANSITION_TIMEOUT_MS,
      },
    });

    const treeFactory = new PlayerBotBehaviorTreeFactory(botStatesByName, botApi, {
      behaviorMode: BOT_BEHAVIOR_MODE,
      endpointLingerMs: ENDPOINT_LINGER_MS,
      followRepathIntervalMs: FOLLOW_REPATH_INTERVAL_MS,
      botHomeRadius: BOT_HOME_RADIUS,
      blockedRetargetMinDelayMs: BLOCKED_RETARGET_MIN_DELAY_MS,
      botWalkRadius: BOT_WALK_RADIUS,
      roamingMinMs: AUTO_MODE_ROAMING_MIN_MS,
      roamingMaxMs: AUTO_MODE_ROAMING_MAX_MS,
      modeBehaviors: {
        roaming: roamingBehavior,
        woodcutting: woodcuttingBehavior,
        mining: miningBehavior,
        bankRun: bankRunBehavior,
        firemaking: firemakingBehavior,
        sparring: sparringBehavior,
      },
    });

    const pathBlockedHandler = new PathBlockedHandler({
      botStatesByName,
      traversalService,
      api: botApi,
      modeHandlers,
      options: {
        behaviorMode: BOT_BEHAVIOR_MODE,
        followBlockedRetryMs: FOLLOW_BLOCKED_RETRY_MS,
        blockedRetargetMinDelayMs: BLOCKED_RETARGET_MIN_DELAY_MS,
        blockedRetargetMaxDelayMs: BLOCKED_RETARGET_MAX_DELAY_MS,
        botWalkRadius: BOT_WALK_RADIUS,
      },
    });

    const spawnOffsets = createSpawnOffsets(
      BOT_COUNT,
      BOT_SPAWN_RADIUS,
      BOT_SPAWN_MIN_DISTANCE,
      BOT_SPAWN_MAX_ATTEMPTS
    );

    let runtime = null;
    let behaviorTaskStarted = false;

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
        new BotBehaviorTask(runtime.entries, traversalService, BOT_DECISION_TICKS, {
          api: botApi,
          behaviorMode: BOT_BEHAVIOR_MODE,
          modeHandlers,
          decisionDelayMinMs: AUTO_MODE_DECISION_MIN_MS,
          decisionDelayMaxMs: AUTO_MODE_DECISION_MAX_MS,
          autonomousModes: AUTONOMOUS_MODE_DEFINITIONS,
          transientModes: [
            BOT_BEHAVIOR_MODE.FOLLOW_BACK,
            BOT_BEHAVIOR_MODE.RETURN_HOME,
            BOT_BEHAVIOR_MODE.BANK_RUN,
          ],
          modeStopParamsByMode: {
            [BOT_BEHAVIOR_MODE.SPARRING]: {
              postSparringCooldownMinMs: AUTO_MODE_POST_SPARRING_COOLDOWN_MIN_MS,
              postSparringCooldownMaxMs: AUTO_MODE_POST_SPARRING_COOLDOWN_MAX_MS,
            },
          },
        })
      );
      behaviorTaskStarted = true;
    };

    runtime = createBotRegistry({
      botApi,
      botCount: BOT_COUNT,
      botBaseCooldownMs: BOT_BASE_COOLDOWN_MS,
      spawn,
      spawnOffsets,
      behaviorMode: BOT_BEHAVIOR_MODE,
      createBotPlayer,
      spawnLocationForIndex,
      createInitialState,
      applyForcedModeForDiagnosis,
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

    const followBackTrigger = new FollowBackTrigger({
      botStatesByName: runtime.botStatesByName,
      playerBotUsernames: runtime.playerBotUsernames,
      api: botApi,
      options: {
        behaviorMode: BOT_BEHAVIOR_MODE,
        followBackDurationMs: FOLLOW_BACK_DURATION_MS,
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
          behaviorMode: BOT_BEHAVIOR_MODE,
        });
      } catch (err) {
        botApi.log("bot_mode_register_events_error", {
          mode,
          error: String(err?.message ?? err),
        });
      }
    }

    runtime.scheduleInitialSpawn();

    registerBotCommands({
      api,
      botApi,
      hasAdminRights: (player) => PlayerRights.hasAdminRights(player),
      runtime,
      behaviorMode: BOT_BEHAVIOR_MODE,
      assignableBehaviors: ASSIGNABLE_BEHAVIORS,
      modeHandlers,
      resetMovementState,
      taskManager: TaskManager,
      flashHintArrowTaskFactory: (player, target) =>
        new FlashHintArrowTask(player, target),
    });

    registerBotEvents({
      api,
      botApi,
      runtime,
      playerPersistence: GameConstants.PLAYER_PERSISTENCE,
      manualControlPacketOpcodes: MANUAL_CONTROL_PACKET_OPCODES,
      followBackTrigger,
      pathBlockedHandler,
    });

    botApi.log("registered", {
      spawned: runtime.getSpawnedCount(),
      totalConfigured: BOT_COUNT,
      forcedModeForDiag: FORCE_ALL_BOTS_MODE_FOR_DIAG,
      walkRadius: BOT_WALK_RADIUS,
      decisionTicks: BOT_DECISION_TICKS,
      baseCooldownMs: BOT_BASE_COOLDOWN_MS,
      jitterMs: BOT_JITTER_MS,
      ditchObjectId: WILDERNESS_DITCH_OBJECT_ID,
      roamRadius: BOT_WALK_RADIUS,
      followBackDurationMs: FOLLOW_BACK_DURATION_MS,
      autoMode: {
        decisionMinMs: AUTO_MODE_DECISION_MIN_MS,
        decisionMaxMs: AUTO_MODE_DECISION_MAX_MS,
        roamingWeight: AUTO_MODE_ROAM_WEIGHT,
        woodcuttingWeight: AUTO_MODE_WOODCUTTING_WEIGHT,
        miningWeight: AUTO_MODE_MINING_WEIGHT,
        firemakingWeight: AUTO_MODE_FIREMAKING_WEIGHT,
        sparringWeight: AUTO_MODE_SPARRING_WEIGHT,
      },
      homeRadius: BOT_HOME_RADIUS,
    });
  },
};
