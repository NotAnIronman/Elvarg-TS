const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { PathFinder } = require("../../src/main/typescript/elvarg/game/model/movement/path/PathFinder");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { Player } = require("../../src/main/typescript/elvarg/game/entity/impl/player/Player");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { BotPlayerSession } = require("../../src/main/typescript/elvarg/net/BotPlayerSession");
const { PluginManager } = require("../../src/main/typescript/elvarg/plugins/PluginManager");
const { PacketConstants } = require("../../src/main/typescript/elvarg/net/packet/PacketConstants");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");
const {
  ActionNode,
  BotController,
  ConditionNode,
  CooldownNode,
  SelectorNode,
  SequenceNode,
} = require("../../src/main/typescript/elvarg/game/bot/BehaviorTree");
const { createTraversalAssist } = require("./lib/TraversalAssist");

const BOT_COUNT = 50;
const BOT_WALK_RADIUS = 6;
const BOT_DECISION_TICKS = 1;
const BOT_BASE_COOLDOWN_MS = 1200;
const BOT_JITTER_MS = 300;
const WILDERNESS_DITCH_OBJECT_ID = ObjectIds.WILDERNESS_DITCH;
const DITCH_ATTEMPT_COOLDOWN_MS = 1200;
const DITCH_TRANSITION_TIMEOUT_MS = 15000;
const DITCH_POST_CROSS_RETRY_DELAY_MS = 0;
const ENDPOINT_LINGER_MS = 500;
const BLOCKED_RETARGET_MIN_DELAY_MS = 120;
const BLOCKED_RETARGET_MAX_DELAY_MS = 320;
const BOT_SPAWN_RADIUS = 14;
const BOT_SPAWN_MIN_DISTANCE = 2;
const BOT_SPAWN_MAX_ATTEMPTS = 80;
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
function createSpawnOffsets(
  count,
  radius,
  minDistance,
  maxAttemptsPerBot = BOT_SPAWN_MAX_ATTEMPTS
) {
  const offsets = [];
  const minDistanceSq = minDistance * minDistance;
  const radiusSq = radius * radius;
  const maxAttempts = Math.max(count * maxAttemptsPerBot, count * 10);

  let attempts = 0;
  while (offsets.length < count && attempts < maxAttempts) {
    attempts++;

    const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const dy = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    if (dx * dx + dy * dy > radiusSq) {
      continue;
    }

    let tooClose = false;
    for (const [ox, oy] of offsets) {
      const deltaX = ox - dx;
      const deltaY = oy - dy;
      if (deltaX * deltaX + deltaY * deltaY < minDistanceSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) {
      continue;
    }

    offsets.push([dx, dy]);
  }

  // Fallback fill guarantees all bots spawn even if density constraints are tight.
  while (offsets.length < count) {
    const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const dy = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    if (dx * dx + dy * dy > radiusSq) {
      continue;
    }
    offsets.push([dx, dy]);
  }

  return offsets;
}

const BOT_SPAWN_OFFSETS = createSpawnOffsets(
  BOT_COUNT,
  BOT_SPAWN_RADIUS,
  BOT_SPAWN_MIN_DISTANCE
);
let traversalAssist = null;

function resetMovementState(player) {
  if (!player) {
    return;
  }
  try {
    TaskManager.cancelTasks(player);
  } catch (_) {
    // Ignore task cancellation issues in plugin flow.
  }
  player.getMovementQueue().walkToReset();
  player.getMovementQueue().reset();
}

function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isAtTarget(player, target) {
  if (!player || !target) {
    return false;
  }
  const loc = player.getLocation();
  return (
    loc.getX() === target.x &&
    loc.getY() === target.y &&
    loc.getZ() === target.z
  );
}

function chooseNextTarget(player, state) {
  if (!player || !state?.home) {
    return null;
  }

  const homeX = state.home.x;
  const homeY = state.home.y;
  const homeZ = state.home.z ?? player.getLocation().getZ();
  const currentX = player.getLocation().getX();
  const currentY = player.getLocation().getY();
  const previousTarget = state.target;
  const radiusSq = BOT_WALK_RADIUS * BOT_WALK_RADIUS;
  const maxAttempts = 24;

  // Keep roaming local to each bot's home tile; ditch crossing remains organic
  // and is only triggered by path-blocked handling when a route is obstructed.
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const dx = randomInRange(-BOT_WALK_RADIUS, BOT_WALK_RADIUS);
    const dy = randomInRange(-BOT_WALK_RADIUS, BOT_WALK_RADIUS);
    if (dx * dx + dy * dy > radiusSq) {
      continue;
    }

    const targetX = homeX + dx;
    const targetY = homeY + dy;
    if (targetX === currentX && targetY === currentY) {
      continue;
    }
    if (
      previousTarget &&
      targetX === previousTarget.x &&
      targetY === previousTarget.y &&
      attempt < maxAttempts - 1
    ) {
      continue;
    }
    return { x: targetX, y: targetY, z: homeZ };
  }

  const fallbackTargets = [
    [homeX + BOT_WALK_RADIUS, homeY],
    [homeX - BOT_WALK_RADIUS, homeY],
    [homeX, homeY + BOT_WALK_RADIUS],
    [homeX, homeY - BOT_WALK_RADIUS],
    [homeX, homeY],
  ];

  for (const [targetX, targetY] of fallbackTargets) {
    if (targetX === currentX && targetY === currentY) {
      continue;
    }
    return { x: targetX, y: targetY, z: homeZ };
  }

  return null;
}

function calculateStrictWalkRoute(player, targetX, targetY) {
  // Bot ditch traversal depends on `path_blocked` events. The default walk route
  // uses basic fallback and can stop near the target instead of reporting blocked.
  PathFinder.calculateRoute(player, 0, targetX, targetY, 0, 0, 0, 0, false);
}

function retargetAfterBlocked(player, state, api, reason, event) {
  if (!player || !state) {
    return false;
  }

  const previousTarget = state.target
    ? { x: state.target.x, y: state.target.y, z: state.target.z }
    : null;

  state.endpointPauseUntil = 0;
  const nextTarget = chooseNextTarget(player, state);
  if (!nextTarget) {
    state.target = null;
    state.nextWalkAt = Date.now() + BLOCKED_RETARGET_MAX_DELAY_MS;
    api.log("path_blocked_retarget_failed", {
      username: player.getUsername(),
      reason,
      previousTarget,
      from: event?.from ?? null,
      to: event?.to ?? null,
    });
    return false;
  }

  state.target = nextTarget;
  const retryInMs = randomInRange(
    BLOCKED_RETARGET_MIN_DELAY_MS,
    BLOCKED_RETARGET_MAX_DELAY_MS
  );
  state.nextWalkAt = Date.now() + retryInMs;
  api.log("path_blocked_retarget", {
    username: player.getUsername(),
    reason,
    previousTarget,
    nextTarget,
    retryInMs,
    from: event?.from ?? null,
    to: event?.to ?? null,
  });
  return true;
}

function randomWalkActionFactory(botStatesByName) {
  return function randomWalkAction(context) {
    const player = context.player;
    if (!player || !player.isRegistered()) {
      return "failure";
    }

    const state = botStatesByName.get(player.getUsername());
    if (!state || state.awaitingDitchTransition) {
      return "failure";
    }
    if (Date.now() < (state.nextWalkAt ?? 0)) {
      return "failure";
    }

    const queue = player.getMovementQueue();
    if (!queue || queue.size() > 0 || player.busy()) {
      return "failure";
    }

    let target = state.target;
    if (!target) {
      target = chooseNextTarget(player, state);
      if (!target) {
        return "failure";
      }
      state.target = target;
    }

    if (!isAtTarget(player, target)) {
      calculateStrictWalkRoute(player, target.x, target.y);
      player.getUpdateFlag().flag(Flag.APPEARANCE);
      return "success";
    }

    if ((state.endpointPauseUntil ?? 0) === 0) {
      state.endpointPauseUntil = Date.now() + ENDPOINT_LINGER_MS;
      return "failure";
    }
    if (Date.now() < state.endpointPauseUntil) {
      return "failure";
    }

    state.endpointPauseUntil = 0;
    const nextTarget = chooseNextTarget(player, state);
    if (!nextTarget) {
      return "failure";
    }
    state.target = nextTarget;
    calculateStrictWalkRoute(player, nextTarget.x, nextTarget.y);
    player.getUpdateFlag().flag(Flag.APPEARANCE);
    return "success";
  };
}

function buildTree(cooldownMs, initialDelayMs, botStatesByName) {
  return new SelectorNode([
    new SequenceNode([
      new ConditionNode((context) => {
        const player = context.player;
        const state = player ? botStatesByName.get(player.getUsername()) : null;
        return (
          !!player &&
          !!state &&
          player.isRegistered() &&
          !player.busy() &&
          !state.awaitingDitchTransition
        );
      }),
      new CooldownNode(
        cooldownMs,
        new ActionNode(randomWalkActionFactory(botStatesByName)),
        initialDelayMs
      ),
    ]),
  ]);
}

function randomizedCooldownMs() {
  return BOT_BASE_COOLDOWN_MS + randomInRange(-BOT_JITTER_MS, BOT_JITTER_MS);
}

function createInitialState(home) {
  return {
    home,
    target: null,
    awaitingDitchTransition: null,
    nextDitchAttemptAt: 0,
    nextWalkAt: 0,
    pendingRetry: null,
    endpointPauseUntil: 0,
  };
}

function createBot(username, spawn) {
  const existing =
    World.getPlayerByName(username) ||
    World.getAddPlayerQueue().find((p) => p && p.getUsername() === username);
  if (existing) {
    return null;
  }

  const session = new BotPlayerSession();
  const bot = new Player(session, spawn.clone());
  bot.setUsername(username);
  bot.setLongUsername(Misc.stringToLong(username));
  bot.setHostAddress("bot");
  bot.setRunning(false);
  bot.setLastKnownRegion(spawn.clone());
  bot.setRegionHeight(spawn.getZ());
  bot.getUpdateFlag().flag(Flag.APPEARANCE);
  World.getAddPlayerQueue().push(bot);
  return bot;
}

function spawnLocationForIndex(base, index) {
  const [dx, dy] = BOT_SPAWN_OFFSETS[index % BOT_SPAWN_OFFSETS.length];
  return base.clone().translate(dx, dy, 0);
}

function findDitchOnRoute(player, from, to) {
  if (!player || !from || !to || !traversalAssist) {
    return null;
  }
  return traversalAssist.findObjectOnRoute(
    player,
    from,
    to,
    WILDERNESS_DITCH_OBJECT_ID
  );
}

function isDitchBetween(fromY, targetY, ditchY) {
  if (fromY === targetY) {
    return false;
  }
  return (fromY < ditchY && targetY > ditchY) || (fromY > ditchY && targetY < ditchY);
}

function requestDitchCross(player, state, ditchObject, api) {
  if (!player || !state || !ditchObject) {
    return false;
  }

  const now = Date.now();
  if (now < state.nextDitchAttemptAt) {
    return false;
  }
  state.nextDitchAttemptAt = now + DITCH_ATTEMPT_COOLDOWN_MS;

  const ditchY = ditchObject.getLocation().getY();
  const startSide = player.getLocation().getY() <= ditchY ? "south" : "north";
  state.awaitingDitchTransition = {
    ditchY,
    startSide,
    sourceX: player.getLocation().getX(),
    sourceY: player.getLocation().getY(),
    sourceZ: player.getLocation().getZ(),
    targetX: state.target?.x ?? player.getLocation().getX(),
    targetY: state.target?.y ?? player.getLocation().getY(),
    targetZ: state.target?.z ?? player.getLocation().getZ(),
    startedAt: now,
  };

  player.getMovementQueue().walkToObject(ditchObject, {
    execute: () => {
      const transition = state.awaitingDitchTransition;
      resetMovementState(player);
      player.setPositionToFace(ditchObject.getLocation());
      const handled = PluginManager.emitObjectInteraction({
        player,
        object: ditchObject,
        objectId: ditchObject.getId(),
        clickType: 1,
        location: {
          x: ditchObject.getLocation().getX(),
          y: ditchObject.getLocation().getY(),
          z: ditchObject.getLocation().getZ(),
        },
        sourceLocation: {
          x: transition?.sourceX ?? player.getLocation().getX(),
          y: transition?.sourceY ?? player.getLocation().getY(),
          z: transition?.sourceZ ?? player.getLocation().getZ(),
        },
        handled: false,
      });

      if (!handled) {
        state.awaitingDitchTransition = null;
      }
    },
  });

  api.log("ditch_cross_requested", {
    username: player.getUsername(),
    objectX: ditchObject.getLocation().getX(),
    objectY: ditchObject.getLocation().getY(),
    objectZ: ditchObject.getLocation().getZ(),
    target: state.target,
  });
  return true;
}

function processDitchTransition(player, state, api) {
  const transition = state.awaitingDitchTransition;
  if (!transition) {
    return;
  }

  const now = Date.now();
  if (now - transition.startedAt > DITCH_TRANSITION_TIMEOUT_MS) {
    state.awaitingDitchTransition = null;
    state.target = {
      x: transition.targetX,
      y: transition.targetY,
      z: transition.targetZ,
    };
    const readyAt = Date.now() + DITCH_POST_CROSS_RETRY_DELAY_MS;
    state.pendingRetry = {
      x: transition.targetX,
      y: transition.targetY,
      z: transition.targetZ,
      readyAt,
    };
    state.nextWalkAt = readyAt;
    state.nextDitchAttemptAt = readyAt;
    resetMovementState(player);
    api.log("ditch_cross_timeout_delay_retry_walk", {
      username: player.getUsername(),
      retryX: transition.targetX,
      retryY: transition.targetY,
      retryZ: transition.targetZ,
      retryInMs: DITCH_POST_CROSS_RETRY_DELAY_MS,
      currentX: player.getLocation().getX(),
      currentY: player.getLocation().getY(),
      currentZ: player.getLocation().getZ(),
    });
    return;
  }

  if (player.getForceMovement() != null) {
    return;
  }

  const currentY = player.getLocation().getY();
  const crossed =
    transition.startSide === "south"
      ? currentY > transition.ditchY
      : currentY < transition.ditchY;

  if (!crossed) {
    return;
  }

  state.awaitingDitchTransition = null;
  state.target = {
    x: transition.targetX,
    y: transition.targetY,
    z: transition.targetZ,
  };
  const readyAt = Date.now() + DITCH_POST_CROSS_RETRY_DELAY_MS;
  state.pendingRetry = {
    x: transition.targetX,
    y: transition.targetY,
    z: transition.targetZ,
    readyAt,
  };
  state.nextWalkAt = readyAt;
  state.nextDitchAttemptAt = readyAt;
  resetMovementState(player);
  api.log("ditch_cross_completed_delay_retry_walk", {
    username: player.getUsername(),
    retryX: transition.targetX,
    retryY: transition.targetY,
    retryZ: transition.targetZ,
    retryInMs: DITCH_POST_CROSS_RETRY_DELAY_MS,
  });
}

function processPendingRetry(player, state, api) {
  const retry = state.pendingRetry;
  if (!retry) {
    return;
  }
  if (Date.now() < retry.readyAt) {
    return;
  }
  if (player.getForceMovement() != null) {
    return;
  }
  if (player.getMovementQueue()?.size?.() > 0) {
    return;
  }

  state.pendingRetry = null;
  state.target = { x: retry.x, y: retry.y, z: retry.z };
  resetMovementState(player);
  calculateStrictWalkRoute(player, retry.x, retry.y);
  player.getUpdateFlag().flag(Flag.APPEARANCE);
  api.log("ditch_post_delay_retry_walk", {
    username: player.getUsername(),
    retryX: retry.x,
    retryY: retry.y,
    retryZ: retry.z,
  });
}

class BotBehaviorTask extends Task {
  constructor(entries, api) {
    super(BOT_DECISION_TICKS);
    this.entries = entries;
    this.api = api;
  }

  execute() {
    const now = Date.now();
    for (const entry of this.entries) {
      try {
        processDitchTransition(entry.player, entry.state, this.api);
        processPendingRetry(entry.player, entry.state, this.api);
        entry.controller.tick(now);
      } catch (err) {
        console.error("[bots] behavior tick failed", err);
      }
    }
  }
}

module.exports = {
  name: "WalkerBots",
  register(api) {
    traversalAssist = createTraversalAssist(api, {
      objectIds: [WILDERNESS_DITCH_OBJECT_ID],
    });
    const spawn = GameConstants.DEFAULT_LOCATION.clone();
    const botStatesByName = new Map();
    const botmeUsernames = new Set();
    const entries = [];
    let spawned = 0;

    for (let i = 1; i <= BOT_COUNT; i++) {
      const username = `WalkerBot${i}`;
      const botSpawn = spawnLocationForIndex(spawn, i - 1);
      const bot = createBot(username, botSpawn);
      if (!bot) {
        continue;
      }

      const state = createInitialState({
        x: botSpawn.getX(),
        y: botSpawn.getY(),
        z: botSpawn.getZ(),
      });
      botStatesByName.set(username, state);

      entries.push({
        player: bot,
        state,
        controller: new BotController(
          bot,
          botSpawn.getX(),
          botSpawn.getY(),
          botSpawn.getZ(),
          buildTree(
            randomizedCooldownMs(),
            randomInRange(0, BOT_BASE_COOLDOWN_MS),
            botStatesByName
          )
        ),
      });
      spawned++;
    }

    function findEntryIndexByPlayer(player) {
      return entries.findIndex((entry) => entry && entry.player === player);
    }

    function removeControllerForPlayer(player) {
      const index = findEntryIndexByPlayer(player);
      if (index === -1) {
        return false;
      }
      entries.splice(index, 1);
      return true;
    }

    function enableControllerForPlayer(player) {
      if (!player || !player.isRegistered()) {
        return { ok: false, reason: "not_registered" };
      }

      const username = player.getUsername();
      if (!username) {
        return { ok: false, reason: "missing_username" };
      }
      if (findEntryIndexByPlayer(player) !== -1) {
        return { ok: false, reason: "already_enabled" };
      }

      const location = player.getLocation();
      const state = createInitialState({
        x: location.getX(),
        y: location.getY(),
        z: location.getZ(),
      });
      botStatesByName.set(username, state);
      botmeUsernames.add(username);
      entries.push({
        player,
        state,
        controller: new BotController(
          player,
          location.getX(),
          location.getY(),
          location.getZ(),
          buildTree(randomizedCooldownMs(), 0, botStatesByName)
        ),
      });
      resetMovementState(player);
      return { ok: true };
    }

    function disableControllerForPlayer(player) {
      if (!player) {
        return false;
      }
      const username = player.getUsername();
      if (username) {
        botStatesByName.delete(username);
        botmeUsernames.delete(username);
      }
      resetMovementState(player);
      return removeControllerForPlayer(player);
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
        const enabled = findEntryIndexByPlayer(player) !== -1;
        player
          .getPacketSender()
          .sendMessage(`botme: ${enabled ? "enabled" : "disabled"}`);
        return true;
      }

      const shouldEnable =
        mode === "on" || mode === "start" || (mode === "toggle" && findEntryIndexByPlayer(player) === -1);
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
          .sendMessage("botme enabled: your character is running WalkerBots behavior.");
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

    api.onPlayerDisconnect(({ player, username }) => {
      if (!player || !username) {
        return;
      }
      const removed = removeControllerForPlayer(player);
      botStatesByName.delete(username);
      if (removed) {
        api.log("botme_auto_disabled_disconnect", { username });
      }
    });

    api.onPacketReceived(({ opcode, player, stage }) => {
      if (!player || stage !== "ESTABLISHED") {
        return;
      }
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
      TaskManager.submit(new BotBehaviorTask(entries, api));
    }

    api.onPlayerPathBlocked((event) => {
      const state = botStatesByName.get(event.username);
      if (!state || state.awaitingDitchTransition) {
        return;
      }
      if (Date.now() < (state.nextWalkAt ?? 0)) {
        return;
      }

      const player = event.entity;
      if (!player || !player.isRegistered()) {
        return;
      }
      if (player.getForceMovement() != null) {
        return;
      }
      if (player.getMovementQueue()?.size?.() > 0) {
        return;
      }

      if (!state.target) {
        const fallbackTarget = chooseNextTarget(player, state);
        if (!fallbackTarget) {
          return;
        }
        state.target = fallbackTarget;
      }

      const ditchObject = findDitchOnRoute(player, event.from, state.target);
      if (!ditchObject) {
        retargetAfterBlocked(player, state, api, "no_ditch_on_route", event);
        return;
      }

      const currentY = player.getLocation().getY();
      const targetY = state.target.y;
      const ditchY = ditchObject.getLocation().getY();
      if (!isDitchBetween(currentY, targetY, ditchY)) {
        retargetAfterBlocked(
          player,
          state,
          api,
          "ditch_not_between_current_and_target",
          event
        );
        return;
      }

      requestDitchCross(player, state, ditchObject, api);
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
    });
  },
};
