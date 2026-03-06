function createBotRegistry(options) {
  const {
    botApi,
    botCount,
    botBaseCooldownMs,
    spawn,
    spawnOffsets,
    behaviorMode,
    createBotPlayer,
    spawnLocationForIndex,
    createInitialState,
    applyForcedModeForDiagnosis: applyForcedModeForDiagnosisFn,
    createController,
    ensureBehaviorTaskStarted,
    emitPlayerLogin,
    worldGetPlayerByName,
    formatText,
    resetMovementState,
    clearFollowState,
    randomInRange,
    botStatesByName: providedBotStatesByName,
    botmeUsernames: providedBotmeUsernames,
    playerBotUsernames: providedPlayerBotUsernames,
    entries: providedEntries,
    entriesByUsername: providedEntriesByUsername,
  } = options;
  const applyForcedModeForDiagnosis =
    typeof applyForcedModeForDiagnosisFn === "function"
      ? applyForcedModeForDiagnosisFn
      : () => {};

  const botStatesByName = providedBotStatesByName ?? new Map();
  const botmeUsernames = providedBotmeUsernames ?? new Set();
  const playerBotUsernames = providedPlayerBotUsernames ?? new Set();
  const entries = providedEntries ?? [];
  const entriesByUsername = providedEntriesByUsername ?? new Map();
  let spawned = 0;

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

  function hasControllerForUsername(username) {
    return !!username && entriesByUsername.has(username);
  }

  function hasControllerForPlayer(player) {
    const username = player?.getUsername?.();
    return hasControllerForUsername(username);
  }

  function resolveControlledPlayer(usernameInput) {
    if (!usernameInput) {
      return null;
    }

    const candidates = [usernameInput, formatText(usernameInput)];
    for (const candidate of candidates) {
      const direct = worldGetPlayerByName(candidate);
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

  function spawnConfiguredBots() {
    for (let i = 1; i <= botCount; i++) {
      const username = `PlayerBot${i}`;
      const botSpawn = spawnLocationForIndex(spawn, spawnOffsets, i - 1);
      const bot = createBotPlayer(username, botSpawn);
      if (!bot) {
        continue;
      }
      bot.setPlayerBot?.(true);

      const state = createInitialState(
        {
          x: botSpawn.getX(),
          y: botSpawn.getY(),
          z: botSpawn.getZ(),
        },
        behaviorMode
      );
      applyForcedModeForDiagnosis(bot, state);
      botStatesByName.set(username, state);
      playerBotUsernames.add(username);

      addEntry(username, {
        player: bot,
        state,
        controller: createController(
          bot,
          botSpawn,
          randomInRange(0, botBaseCooldownMs)
        ),
      });
      emitPlayerLogin({
        player: bot,
        username,
      });
      spawned++;
    }

    botApi.log("spawn_complete", { spawned, configured: botCount });
    ensureBehaviorTaskStarted();
  }

  function scheduleInitialSpawn() {
    // Defer spawn until all plugins (including persistence provider) have registered.
    setTimeout(() => spawnConfiguredBots(), 0);
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
    const state = createInitialState(
      {
        x: location.getX(),
        y: location.getY(),
        z: location.getZ(),
      },
      behaviorMode
    );
    applyForcedModeForDiagnosis(player, state);
    botStatesByName.set(username, state);
    botmeUsernames.add(username);
    player.setPlayerBot?.(true);
    addEntry(username, {
      player,
      state,
      controller: createController(player, location, 0),
    });
    resetMovementState(player);
    ensureBehaviorTaskStarted();
    return { ok: true };
  }

  function disableControllerForPlayer(player) {
    if (!player) {
      return false;
    }
    player.setPlayerBot?.(false);
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

  function handleDisconnect(player, usernameInput) {
    const username = usernameInput ?? player?.getUsername?.();
    const removed = removeEntryByUsername(username);
    botStatesByName.delete(username);
    botmeUsernames.delete(username);
    playerBotUsernames.delete(username);
    return removed;
  }

  return {
    botStatesByName,
    botmeUsernames,
    playerBotUsernames,
    entries,
    entriesByUsername,
    getSpawnedCount: () => spawned,
    hasControllerForUsername,
    hasControllerForPlayer,
    resolveControlledPlayer,
    spawnConfiguredBots,
    scheduleInitialSpawn,
    enableControllerForPlayer,
    disableControllerForPlayer,
    handleDisconnect,
  };
}

module.exports = {
  createBotRegistry,
};
