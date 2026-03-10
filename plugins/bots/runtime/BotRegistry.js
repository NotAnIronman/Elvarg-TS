const { getWildernessHotspot } = require("../behaviours/pvp/PvpAssignment");
const {
  getEnabledWildernessHotspots,
  createHotspotAnchorLocation,
} = require("../behaviours/pvp/WildernessHotspotRegistry");
const {
  listWildernessRoamingBounds,
} = require("../behaviours/spawn/WildernessRoamingBounds");

function createBotRegistry(options) {
  const {
    botApi,
    botCount,
    fullTimePvpBotCount = 0,
    wildernessRoamerBotCount = 0,
    botBaseCooldownMs,
    spawn,
    spawnOffsets,
    behaviorMode,
    createBotPlayer,
    spawnLocationForIndex,
    createInitialState,
    buildAssignedPvpMetadata: buildAssignedPvpMetadataFn,
    buildRoamingPvpMetadata: buildRoamingPvpMetadataFn,
    assignPvpMetadata: assignPvpMetadataFn,
    applyInitialPvpLoadout: applyInitialPvpLoadoutFn,
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
  const assignPvpMetadata =
    typeof assignPvpMetadataFn === "function" ? assignPvpMetadataFn : () => {};
  const buildAssignedPvpMetadata =
    typeof buildAssignedPvpMetadataFn === "function"
      ? buildAssignedPvpMetadataFn
      : () => null;
  const buildRoamingPvpMetadata =
    typeof buildRoamingPvpMetadataFn === "function"
      ? buildRoamingPvpMetadataFn
      : () => null;
  const applyInitialPvpLoadout =
    typeof applyInitialPvpLoadoutFn === "function" ? applyInitialPvpLoadoutFn : () => {};

  const botStatesByName = providedBotStatesByName ?? new Map();
  const botmeUsernames = providedBotmeUsernames ?? new Set();
  const playerBotUsernames = providedPlayerBotUsernames ?? new Set();
  const entries = providedEntries ?? [];
  const entriesByUsername = providedEntriesByUsername ?? new Map();
  let spawned = 0;
  let fullTimePvpAssigned = 0;
  let wildernessRoamersAssigned = 0;
  const hotspotSpawnCounts = new Map();

  function buildFullTimePvpHotspotPlan(totalCount) {
    const hotspots = getEnabledWildernessHotspots().filter(
      (hotspot) => Number(hotspot?.targetBots ?? 0) > 0
    );
    if (totalCount <= 0 || hotspots.length === 0) {
      return [];
    }
    const totalTargetBots = hotspots.reduce(
      (sum, hotspot) => sum + Math.max(0, Number(hotspot.targetBots ?? 0)),
      0
    );
    if (totalTargetBots <= 0) {
      return hotspots.map((hotspot) => hotspot.id).slice(0, totalCount);
    }

    const plan = [];
    const allocations = hotspots.map((hotspot) => {
      const rawShare = (totalCount * Number(hotspot.targetBots ?? 0)) / totalTargetBots;
      const baseCount = Math.floor(rawShare);
      return {
        hotspotId: hotspot.id,
        count: baseCount,
        remainder: rawShare - baseCount,
      };
    });

    let allocated = allocations.reduce((sum, entry) => sum + entry.count, 0);
    allocations
      .slice()
      .sort((a, b) => {
        if (b.remainder !== a.remainder) {
          return b.remainder - a.remainder;
        }
        return a.hotspotId.localeCompare(b.hotspotId);
      })
      .forEach((entry) => {
        if (allocated >= totalCount) {
          return;
        }
        const target = allocations.find((candidate) => candidate.hotspotId === entry.hotspotId);
        if (!target) {
          return;
        }
        target.count += 1;
        allocated += 1;
      });

    allocations
      .sort((a, b) => a.hotspotId.localeCompare(b.hotspotId))
      .forEach((entry) => {
        for (let i = 0; i < entry.count; i++) {
          plan.push(entry.hotspotId);
        }
      });

    return plan.slice(0, totalCount);
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
    const hotspotCounts = new Map();
    const fullTimePvpHotspotPlan = buildFullTimePvpHotspotPlan(fullTimePvpBotCount);
    for (let i = 1; i <= botCount; i++) {
      const username = `PlayerBot${i}`;
      const isFullTimePvp = i <= fullTimePvpBotCount;
      const forcedHotspotId = isFullTimePvp ? fullTimePvpHotspotPlan[i - 1] ?? null : null;
      const pvpMetadata = buildAssignedPvpMetadata({
        isFullTimePvp,
        forcedHotspotId,
      });
      const hotspotSpawnIndex = isFullTimePvp && pvpMetadata?.hotspotId
        ? reserveHotspotSpawnIndex(pvpMetadata.hotspotId)
        : -1;
      const hotspotAnchor = isFullTimePvp && pvpMetadata?.hotspotId
        ? createHotspotSpawn(pvpMetadata.hotspotId, hotspotSpawnIndex)
        : null;
      const botSpawn = hotspotAnchor ?? spawnLocationForIndex(spawn, spawnOffsets, i - 1);
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
      const spawnTimingJitterMs = resolveSpawnTimingJitterMs(username);
      if (state?.autonomy) {
        state.autonomy.nextDecisionAt = spawnTimingJitterMs;
      }
      if (state?.roaming) {
        state.roaming.nextWalkAt = spawnTimingJitterMs;
      }
      if (isFullTimePvp) {
        if (!state.autonomy) {
          state.autonomy = {};
        }
        state.autonomy.fullTimePvp = true;
        state.autonomy.pvpCooldownUntil = 0;
        state.autonomy.modeEndsAt = 0;
        state.autonomy.nextDecisionAt = spawnTimingJitterMs;
        fullTimePvpAssigned++;
      }
      assignPvpMetadata(state, { isFullTimePvp, metadata: pvpMetadata });
      if (isFullTimePvp && pvpMetadata?.hotspotId) {
        hotspotCounts.set(
          pvpMetadata.hotspotId,
          (hotspotCounts.get(pvpMetadata.hotspotId) ?? 0) + 1
        );
      }
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
      if (isFullTimePvp) {
        applyInitialPvpLoadout(bot, state);
      }
      emitPlayerLogin({
        player: bot,
        username,
      });
      spawned++;
    }

    const wildernessBounds = listWildernessRoamingBounds();
    for (let i = 1; i <= wildernessRoamerBotCount; i++) {
      const username = `WildernessBot${i}`;
      const assignedBounds = wildernessBounds[(i - 1) % wildernessBounds.length] ?? null;
      const botSpawn =
        createWildernessRoamerSpawn(spawn, assignedBounds, i - 1) ??
        spawnLocationForIndex(spawn, spawnOffsets, botCount + i - 1);
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
      const spawnTimingJitterMs = resolveSpawnTimingJitterMs(username);
      if (!state.autonomy) {
        state.autonomy = {};
      }
      state.autonomy.allowedAutonomousModes = [behaviorMode.ROAMING, behaviorMode.PVP];
      state.autonomy.wildernessRoamerPvp = true;
      state.autonomy.persistentPvpLoadout = true;
      state.autonomy.nextDecisionAt = spawnTimingJitterMs;
      if (!state.roaming) {
        state.roaming = {};
      }
      state.roaming.nextWalkAt = spawnTimingJitterMs;
      if (assignedBounds) {
        state.roaming.roamBounds = {
          id: assignedBounds.id ?? null,
          minX: assignedBounds.minX,
          maxX: assignedBounds.maxX,
          minY: assignedBounds.minY,
          maxY: assignedBounds.maxY,
          z: assignedBounds.z ?? botSpawn.getZ(),
        };
      }
      const pvpMetadata = buildRoamingPvpMetadata({
        excludeF2p: true,
      });
      assignPvpMetadata(state, {
        isFullTimePvp: false,
        metadata: pvpMetadata,
      });
      applyInitialPvpLoadout(bot, state);
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
      wildernessRoamersAssigned++;
    }

    botApi.log("spawn_complete", {
      spawned,
      configured: botCount + wildernessRoamerBotCount,
      fullTimePvpAssigned,
      wildernessRoamersAssigned,
      hotspotCounts: Object.fromEntries(hotspotCounts.entries()),
    });
    ensureBehaviorTaskStarted();
  }

  function scheduleInitialSpawn() {
    // Defer spawn until all plugins (including persistence provider) have registered.
    setTimeout(() => spawnConfiguredBots(), 0);
  }

  function resolveSpawnTimingJitterMs(username) {
    const text = typeof username === "string" ? username : "";
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % 5000;
  }

  function reserveHotspotSpawnIndex(hotspotId) {
    const nextIndex = hotspotSpawnCounts.get(hotspotId) ?? 0;
    hotspotSpawnCounts.set(hotspotId, nextIndex + 1);
    return nextIndex;
  }

  function createHotspotSpawn(hotspotId, index) {
    const hotspot = getWildernessHotspot(hotspotId);
    const anchor = createHotspotAnchorLocation(hotspot);
    if (!anchor) {
      return null;
    }
    const area = hotspot?.area;
    if (!area) {
      return anchor;
    }
    const minX = Math.floor(area.minX);
    const maxX = Math.floor(area.maxX);
    const minY = Math.floor(area.minY);
    const maxY = Math.floor(area.maxY);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0) {
      return anchor;
    }
    const seedBase =
      Math.imul(index + 1, 1103515245) ^
      Math.imul(hotspotId.length + 17, 12345) ^
      Math.imul(minX + maxY, 2654435761);
    const offsetX = Math.abs(seedBase) % width;
    const offsetY = Math.abs(Math.imul(seedBase ^ 0x9e3779b9, 48271)) % height;
    return anchor.clone().setX(minX + offsetX).setY(minY + offsetY);
  }

  function createWildernessRoamerSpawn(baseSpawn, bounds, index) {
    if (!baseSpawn || !bounds) {
      return null;
    }
    const minX = Math.floor(bounds.minX);
    const maxX = Math.floor(bounds.maxX);
    const minY = Math.floor(bounds.minY);
    const maxY = Math.floor(bounds.maxY);
    const z = Math.floor(bounds.z ?? 0);
    if (maxX < minX || maxY < minY) {
      return null;
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const seedBase =
      Math.imul(index + 1, 1103515245) ^
      Math.imul((bounds.id?.length ?? 7) + 37, 12345) ^
      Math.imul(minX + maxY + z, 2654435761);
    const offsetX = Math.abs(seedBase) % width;
    const offsetY = Math.abs(Math.imul(seedBase ^ 0x9e3779b9, 48271)) % height;
    return baseSpawn.clone().setX(minX + offsetX).setY(minY + offsetY).setZ(z);
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
    assignPvpMetadata(state, {
      isFullTimePvp: false,
    });
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
