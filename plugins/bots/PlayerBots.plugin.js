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
const { randomInRange } = require("./behaviours/navigation/BotNavigation");
const { createSpawnOffsets, spawnLocationForIndex } = require("./behaviours/spawn/BotSpawnLayout");
const { createBotPlayer } = require("./behaviours/spawn/BotPlayerFactory");
const {
  clearFollowState,
  createInitialState,
  resetMovementState,
  setModeRoaming,
  setModeWoodcutting,
} = require("./behaviours/state/PlayerBotState");
const {
  PlayerBotBehaviorTreeFactory,
} = require("./behaviours/branches/PlayerBotBehaviorTreeFactory");
const { BotBehaviorTask } = require("./behaviours/task/BotBehaviorTask");
const { DitchTraversalService } = require("./behaviours/traversal/DitchTraversalService");
const { PathBlockedHandler } = require("./behaviours/traversal/PathBlockedHandler");
const { FollowBackTrigger } = require("./behaviours/handlers/FollowBackTrigger");

const BOT_COUNT = 5;
const BOT_WALK_RADIUS = 6;
const BOT_DECISION_TICKS = 1;
const BOT_BASE_COOLDOWN_MS = 1200;
const BOT_JITTER_MS = 300;
const DITCH_ATTEMPT_COOLDOWN_MS = 1200;
const DITCH_TRANSITION_TIMEOUT_MS = 15000;
const DITCH_POST_CROSS_RETRY_DELAY_MS = 0;
const ENDPOINT_LINGER_MS = 500;
const BLOCKED_RETARGET_MIN_DELAY_MS = 120;
const BLOCKED_RETARGET_MAX_DELAY_MS = 320;
const BOT_SPAWN_RADIUS = 14;
const BOT_SPAWN_MIN_DISTANCE = 2;
const BOT_SPAWN_MAX_ATTEMPTS = 80;
const BOT_HOME_RADIUS = BOT_WALK_RADIUS;
const FOLLOW_BACK_DURATION_MS = 3 * 60 * 1000;
const FOLLOW_REPATH_INTERVAL_MS = 500;
const FOLLOW_BLOCKED_RETRY_MS = 200;
const BOT_BEHAVIOR_MODE = Object.freeze({
  ROAMING: "roaming",
  WOODCUTTING: "woodcutting",
  FOLLOW_BACK: "follow_back",
  RETURN_HOME: "return_home",
});
const ASSIGNABLE_BEHAVIORS = Object.freeze({
  roaming: BOT_BEHAVIOR_MODE.ROAMING,
  woodcutting: BOT_BEHAVIOR_MODE.WOODCUTTING,
});

const WILDERNESS_DITCH_OBJECT_ID = ObjectIds.WILDERNESS_DITCH;
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

function randomizedCooldownMs() {
  return BOT_BASE_COOLDOWN_MS + randomInRange(-BOT_JITTER_MS, BOT_JITTER_MS);
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
  register(api) {
    const traversalAssist = createTraversalAssist(api, {
      objectIds: [WILDERNESS_DITCH_OBJECT_ID],
    });
    const traversalService = new DitchTraversalService({
      api,
      traversalAssist,
      objectId: WILDERNESS_DITCH_OBJECT_ID,
      emitObjectInteraction: (interaction) =>
        PluginManager.emitObjectInteraction(interaction),
      options: {
        behaviorMode: BOT_BEHAVIOR_MODE,
        ditchAttemptCooldownMs: DITCH_ATTEMPT_COOLDOWN_MS,
        ditchPostCrossRetryDelayMs: DITCH_POST_CROSS_RETRY_DELAY_MS,
        ditchTransitionTimeoutMs: DITCH_TRANSITION_TIMEOUT_MS,
      },
    });

    const spawn = GameConstants.DEFAULT_LOCATION.clone();
    const botStatesByName = new Map();
    const botmeUsernames = new Set();
    const playerBotUsernames = new Set();
    const entries = [];
    const entriesByUsername = new Map();
    const treeFactory = new PlayerBotBehaviorTreeFactory(botStatesByName, api, {
      behaviorMode: BOT_BEHAVIOR_MODE,
      endpointLingerMs: ENDPOINT_LINGER_MS,
      followRepathIntervalMs: FOLLOW_REPATH_INTERVAL_MS,
      botHomeRadius: BOT_HOME_RADIUS,
      blockedRetargetMinDelayMs: BLOCKED_RETARGET_MIN_DELAY_MS,
      botWalkRadius: BOT_WALK_RADIUS,
    });
    const pathBlockedHandler = new PathBlockedHandler({
      botStatesByName,
      traversalService,
      api,
      options: {
        behaviorMode: BOT_BEHAVIOR_MODE,
        followBlockedRetryMs: FOLLOW_BLOCKED_RETRY_MS,
        blockedRetargetMinDelayMs: BLOCKED_RETARGET_MIN_DELAY_MS,
        blockedRetargetMaxDelayMs: BLOCKED_RETARGET_MAX_DELAY_MS,
        botWalkRadius: BOT_WALK_RADIUS,
      },
    });
    const followBackTrigger = new FollowBackTrigger({
      botStatesByName,
      playerBotUsernames,
      api,
      options: {
        behaviorMode: BOT_BEHAVIOR_MODE,
        followBackDurationMs: FOLLOW_BACK_DURATION_MS,
      },
    });
    const spawnOffsets = createSpawnOffsets(
      BOT_COUNT,
      BOT_SPAWN_RADIUS,
      BOT_SPAWN_MIN_DISTANCE,
      BOT_SPAWN_MAX_ATTEMPTS
    );

    let spawned = 0;

    const createController = (player, location, initialDelayMs) =>
      new BotController(
        player,
        location.getX(),
        location.getY(),
        location.getZ(),
        treeFactory.create(randomizedCooldownMs(), initialDelayMs)
      );

    function hasControllerForUsername(username) {
      return !!username && entriesByUsername.has(username);
    }

    function addEntry(username, entry) {
      entry.entryIndex = entries.length;
      entry.entryUsername = username;
      entries.push(entry);
      entriesByUsername.set(username, entry);
    }

    function removeEntryByUsername(username) {
      if (!username) {
        return false;
      }

      const entry = entriesByUsername.get(username);
      if (!entry) {
        return false;
      }
      const index = entry.entryIndex;
      const lastIndex = entries.length - 1;
      const lastEntry = entries[lastIndex];
      entries.pop();

      if (index < lastIndex) {
        entries[index] = lastEntry;
        lastEntry.entryIndex = index;
      }

      entriesByUsername.delete(username);
      return true;
    }

    function hasControllerForPlayer(player) {
      const username = player?.getUsername?.();
      return hasControllerForUsername(username);
    }

    function resolveControlledPlayer(usernameInput) {
      if (!usernameInput) {
        return null;
      }

      const candidates = [usernameInput, Misc.formatText(usernameInput)];
      for (const candidate of candidates) {
        const direct = World.getPlayerByName(candidate);
        if (direct?.isRegistered?.() && hasControllerForPlayer(direct)) {
          return direct;
        }
      }

      const targetLower = usernameInput.trim().toLowerCase();
      for (const entry of entries) {
        const entryPlayer = entry?.player;
        const entryUsername = entryPlayer?.getUsername?.();
        if (!entryUsername) {
          continue;
        }
        if (entryUsername.toLowerCase() !== targetLower) {
          continue;
        }
        if (entryPlayer.isRegistered?.()) {
          return entryPlayer;
        }
      }

      return null;
    }

    for (let i = 1; i <= BOT_COUNT; i++) {
      const username = `PlayerBot${i}`;
      const botSpawn = spawnLocationForIndex(spawn, spawnOffsets, i - 1);
      const bot = createBotPlayer(username, botSpawn);
      if (!bot) {
        continue;
      }

      const state = createInitialState({
        x: botSpawn.getX(),
        y: botSpawn.getY(),
        z: botSpawn.getZ(),
      }, BOT_BEHAVIOR_MODE);
      botStatesByName.set(username, state);
      playerBotUsernames.add(username);

      addEntry(username, {
        player: bot,
        state,
        controller: createController(
          bot,
          botSpawn,
          randomInRange(0, BOT_BASE_COOLDOWN_MS)
        ),
      });
      spawned++;
    }

    function enableControllerForPlayer(player) {
      if (!player || !player.isRegistered()) {
        return { ok: false, reason: "not_registered" };
      }

      const username = player.getUsername();
      if (!username) {
        return { ok: false, reason: "missing_username" };
      }
      if (hasControllerForUsername(username)) {
        return { ok: false, reason: "already_enabled" };
      }

      const location = player.getLocation();
      const state = createInitialState({
        x: location.getX(),
        y: location.getY(),
        z: location.getZ(),
      }, BOT_BEHAVIOR_MODE);
      botStatesByName.set(username, state);
      botmeUsernames.add(username);
      addEntry(username, {
        player,
        state,
        controller: createController(player, location, 0),
      });
      resetMovementState(player);
      return { ok: true };
    }

    function disableControllerForPlayer(player) {
      if (!player) {
        return false;
      }
      const username = player.getUsername();
      const state = username ? botStatesByName.get(username) : null;
      clearFollowState(player, state);
      if (username) {
        botStatesByName.delete(username);
        botmeUsernames.delete(username);
      }
      resetMovementState(player);
      return removeEntryByUsername(username);
    }

    api.registerCommand("botme", ({ player, parts }) => {
      if (!PlayerRights.hasAdminRights(player)) {
        player
          .getPacketSender()
          .sendMessage("You do not have permission to use this command.");
        return true;
      }

      const mode = (parts[1] ?? "toggle").toLowerCase();
      if (mode === "status") {
        const enabled = hasControllerForPlayer(player);
        player
          .getPacketSender()
          .sendMessage(`botme: ${enabled ? "enabled" : "disabled"}`);
        return true;
      }

      const shouldEnable =
        mode === "on" ||
        mode === "start" ||
        (mode === "toggle" && !hasControllerForPlayer(player));

      if (shouldEnable) {
        const enabled = enableControllerForPlayer(player);
        if (!enabled.ok) {
          const reason =
            enabled.reason === "already_enabled"
              ? "already enabled"
              : enabled.reason === "not_registered"
              ? "player is not active"
              : "unable to enable";
          player.getPacketSender().sendMessage(`botme: ${reason}.`);
          return true;
        }
        player
          .getPacketSender()
          .sendMessage(
            "botme enabled: your character is running PlayerBots behavior."
          );
        api.log("botme_enabled", { username: player.getUsername() });
        return true;
      }

      if (mode === "off" || mode === "stop" || mode === "toggle") {
        const disabled = disableControllerForPlayer(player);
        if (!disabled) {
          player.getPacketSender().sendMessage("botme: already disabled.");
          return true;
        }
        player
          .getPacketSender()
          .sendMessage("botme disabled: your character is no longer bot-driven.");
        api.log("botme_disabled", { username: player.getUsername() });
        return true;
      }

      player
        .getPacketSender()
        .sendMessage("Usage: ::botme [on|off|toggle|status]");
      return true;
    });

    api.registerCommand("bh", ({ player, parts }) => {
      if (!PlayerRights.hasAdminRights(player)) {
        player
          .getPacketSender()
          .sendMessage("You do not have permission to use this command.");
        return true;
      }

      const usernameArg = parts[1];
      const behaviorArg = parts[2]?.toLowerCase();
      if (!usernameArg || !behaviorArg) {
        player
          .getPacketSender()
          .sendMessage("Usage: ::bh <username> <roaming|woodcutting>");
        return true;
      }

      const normalizedBehavior = ASSIGNABLE_BEHAVIORS[behaviorArg];
      if (!normalizedBehavior) {
        player
          .getPacketSender()
          .sendMessage("Unknown behaviour. Supported: roaming, woodcutting");
        return true;
      }

      const target = resolveControlledPlayer(usernameArg);
      if (!target || !target.isRegistered()) {
        player
          .getPacketSender()
          .sendMessage(`bh: player not found: ${usernameArg}`);
        return true;
      }

      const targetUsername = target.getUsername?.();
      if (!targetUsername || !hasControllerForUsername(targetUsername)) {
        player
          .getPacketSender()
          .sendMessage(`bh: target is not bot-controlled: ${usernameArg}`);
        return true;
      }

      const state = botStatesByName.get(targetUsername);
      if (!state) {
        player
          .getPacketSender()
          .sendMessage(`bh: missing state for: ${targetUsername}`);
        return true;
      }

      if (normalizedBehavior === BOT_BEHAVIOR_MODE.ROAMING) {
        setModeRoaming(target, state, BOT_BEHAVIOR_MODE);
      } else if (normalizedBehavior === BOT_BEHAVIOR_MODE.WOODCUTTING) {
        setModeWoodcutting(target, state, BOT_BEHAVIOR_MODE);
      }
      resetMovementState(target);
      TaskManager.submit(new FlashHintArrowTask(player, target));

      player
        .getPacketSender()
        .sendMessage(`bh: ${targetUsername} -> ${normalizedBehavior}`);
      api.log("bot_behavior_assigned", {
        assignedBy: player.getUsername(),
        target: targetUsername,
        behavior: normalizedBehavior,
      });
      return true;
    });

    api.onPlayerDisconnect(({ username }) => {
      const removed = removeEntryByUsername(username);
      botStatesByName.delete(username);
      botmeUsernames.delete(username);
      playerBotUsernames.delete(username);
      if (removed) {
        api.log("botme_auto_disabled_disconnect", { username });
      }
    });

    api.onEstablishedPacket((event) => {
      const nowMs = Date.now();
      followBackTrigger.handleEstablishedPacket(event, nowMs);

      const { opcode, player } = event;
      if (!MANUAL_CONTROL_PACKET_OPCODES.has(opcode)) {
        return;
      }

      const username = player.getUsername?.();
      if (!username || !botmeUsernames.has(username)) {
        return;
      }

      const disabled = disableControllerForPlayer(player);
      if (!disabled) {
        return;
      }
      player
        .getPacketSender()
        .sendMessage("botme auto-disabled due to manual input.");
      api.log("botme_auto_disabled_manual_input", { username, opcode });
    });

    if (entries.length > 0) {
      TaskManager.submit(
        new BotBehaviorTask(entries, traversalService, BOT_DECISION_TICKS)
      );
    }

    api.onPlayerPathBlocked((event) => {
      pathBlockedHandler.handle(event, Date.now());
    });

    api.log("registered", {
      spawned,
      totalConfigured: BOT_COUNT,
      walkRadius: BOT_WALK_RADIUS,
      decisionTicks: BOT_DECISION_TICKS,
      baseCooldownMs: BOT_BASE_COOLDOWN_MS,
      jitterMs: BOT_JITTER_MS,
      ditchObjectId: WILDERNESS_DITCH_OBJECT_ID,
      roamRadius: BOT_WALK_RADIUS,
      followBackDurationMs: FOLLOW_BACK_DURATION_MS,
      homeRadius: BOT_HOME_RADIUS,
    });
  },
};
