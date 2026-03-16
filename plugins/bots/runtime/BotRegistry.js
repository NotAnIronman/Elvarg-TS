const { Location } = require("../../../src/main/typescript/elvarg/game/model/Location");
const { RegionManager } = require("../../../src/main/typescript/elvarg/game/collision/RegionManager");
const {
  getEnabledWildernessHotspots,
  getWildernessHotspot,
  createHotspotAnchorLocation,
} = require("../behaviours/pvp/WildernessHotspotRegistry");
const {
  listWildernessRoamingBounds,
} = require("../behaviours/spawn/WildernessRoamingBounds");
const {
  ATTR_BOT_PVP_PROFILE_ID,
} = require("./BotRecruitConstants");
const {
  ATTR_SKIP_PERSISTENCE,
} = require("./BotPersistenceConstants");

const WILDERNESS_SPAWN_TILE_PROBE_LIMIT = 256;
const BOT_STARTUP_BATCH_SIZE = 24;
const BOT_STARTUP_BATCH_DELAY_MS = 40;

function createBotRegistry(options) {
  const {
    botApi,
    botCount,
    wildernessRoamerBotCount = 0,
    botBaseCooldownMs,
    spawn,
    spawnOffsets,
    behaviorMode,
    createBotPlayer,
    spawnLocationForIndex,
    createInitialState,
    buildHotspotPvpMetadata: buildHotspotPvpMetadataFn,
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
    startupLogger,
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
  const buildHotspotPvpMetadata =
    typeof buildHotspotPvpMetadataFn === "function"
      ? buildHotspotPvpMetadataFn
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
  let wildernessRoamersAssigned = 0;
  const hotspotSpawnCounts = new Map();

  function buildWildernessHotspotPlan(totalCount) {
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
      return new Array(totalCount).fill(null);
    }

    const hotspotCount = Math.min(totalCount, totalTargetBots);
    const plan = [];
    const allocations = hotspots.map((hotspot) => ({
      hotspotId: hotspot.id,
      count: Math.floor((hotspotCount * Number(hotspot.targetBots ?? 0)) / totalTargetBots),
      remainder: ((hotspotCount * Number(hotspot.targetBots ?? 0)) / totalTargetBots) % 1,
    }));

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
        if (allocated >= hotspotCount) {
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
        for (let i = 0; i < entry.count; i += 1) {
          plan.push(entry.hotspotId);
        }
      });

    while (plan.length < totalCount) {
      plan.push(null);
    }
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

  function setPersistentRespawnResolver(player, resolver) {
    if (!player) {
      return;
    }
    if (typeof resolver === "function") {
      player.__botResolveRespawnLocation = resolver;
    } else {
      delete player.__botResolveRespawnLocation;
    }
  }

  function syncBotProfileAttribute(player, state) {
    const profileId = state?.pvp?.profileId ?? "standard";
    if (!player) {
      return;
    }
    player.setAttribute?.(
      ATTR_BOT_PVP_PROFILE_ID,
      profileId
    );
  }

  function primePvpOnlyStartupState(state, readyAtMs) {
    if (!state) {
      return;
    }
    state.mode = behaviorMode.PVP;
    if (!state.autonomy) {
      state.autonomy = {};
    }
    state.autonomy.allowedAutonomousModes = [behaviorMode.PVP];
    state.autonomy.nextDecisionAt = readyAtMs;
    state.autonomy.nextModeValidationAt = readyAtMs;
    if (!state.pvp) {
      state.pvp = {};
    }
    state.pvp.phase = "seeking";
    state.pvp.nextActionAt = readyAtMs;
  }

  function spawnConfiguredBots() {
    const spawnStartedAt = Date.now();
    const pendingSpawns = [];

    for (let i = 1; i <= botCount; i++) {
      const username = `PlayerBot${i}`;
      const pvpMetadata = buildRoamingPvpMetadata({
        excludeF2p: true,
      });
      const botSpawn = spawnLocationForIndex(spawn, spawnOffsets, i - 1);
      pendingSpawns.push(() => {
        const bot = createBotPlayer(username, botSpawn);
        if (!bot) {
          return;
        }
        bot.setPlayerBot?.(true);
        bot.setAttribute?.(ATTR_SKIP_PERSISTENCE, false);
        setPersistentRespawnResolver(bot, null);

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
          state.autonomy.nextDecisionAt = spawnStartedAt + spawnTimingJitterMs;
          state.autonomy.nextModeValidationAt = spawnStartedAt + spawnTimingJitterMs;
        }
        if (state?.roaming) {
          state.roaming.nextWalkAt = spawnStartedAt + spawnTimingJitterMs;
        }
        assignPvpMetadata(state, { metadata: pvpMetadata });
        syncBotProfileAttribute(bot, state);
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
      });
    }

    const wildernessBounds = listWildernessRoamingBounds();
    const wildernessHotspotPlan = buildWildernessHotspotPlan(wildernessRoamerBotCount);
    for (let i = 1; i <= wildernessRoamerBotCount; i++) {
      const username = `WildyBot${i}`;
      const assignedHotspotId = wildernessHotspotPlan[i - 1] ?? null;
      const assignedHotspot = assignedHotspotId ? getWildernessHotspot(assignedHotspotId) : null;
      const assignedBounds =
        assignedHotspot?.area ??
        wildernessBounds[(i - 1) % wildernessBounds.length] ??
        null;
      const initialSpawnSeed = randomInRange(0, 1_000_000_000);
      const hotspotSpawnIndex =
        assignedHotspotId != null ? reserveHotspotSpawnIndex(assignedHotspotId) : -1;
      const hotspotSpawn =
        assignedHotspotId != null ? createHotspotSpawn(assignedHotspotId, hotspotSpawnIndex) : null;
      const botSpawn =
        hotspotSpawn ??
        createWildernessRoamerSpawn(spawn, assignedBounds, initialSpawnSeed) ??
        spawnLocationForIndex(spawn, spawnOffsets, botCount + i - 1);
      pendingSpawns.push(() => {
        const bot = createBotPlayer(username, botSpawn, {
          loadPersistence: false,
          saveRandomizedAppearance: false,
        });
        if (!bot) {
          return;
        }
        bot.setPlayerBot?.(true);
        bot.setAttribute?.(ATTR_SKIP_PERSISTENCE, true);
        setPersistentRespawnResolver(bot, () => {
          if (assignedHotspotId != null) {
            const respawnIndex = reserveHotspotSpawnIndex(assignedHotspotId);
            const respawnTile = createHotspotSpawn(assignedHotspotId, respawnIndex);
            if (respawnTile) {
              return respawnTile;
            }
            return botSpawn.clone();
          }
          return (
            createWildernessRoamerSpawn(spawn, assignedBounds, randomInRange(0, 1_000_000)) ??
            botSpawn.clone()
          );
        });

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
        primePvpOnlyStartupState(state, spawnStartedAt + spawnTimingJitterMs);
        if (!state.roaming) {
          state.roaming = {};
        }
        state.roaming.nextWalkAt = spawnStartedAt + spawnTimingJitterMs;
        if (assignedBounds) {
          state.roaming.roamBounds = {
            id: assignedHotspotId ?? assignedBounds.id ?? null,
            minX: assignedBounds.minX ?? assignedHotspot?.area?.minX,
            maxX: assignedBounds.maxX ?? assignedHotspot?.area?.maxX,
            minY: assignedBounds.minY ?? assignedHotspot?.area?.minY,
            maxY: assignedBounds.maxY ?? assignedHotspot?.area?.maxY,
            z: assignedBounds.z ?? assignedHotspot?.area?.z ?? botSpawn.getZ(),
          };
        }
        const pvpMetadata =
          assignedHotspotId != null
            ? buildHotspotPvpMetadata({
                hotspotId: assignedHotspotId,
              })
            : buildRoamingPvpMetadata({
                excludeF2p: true,
              });
        assignPvpMetadata(state, {
          metadata: pvpMetadata,
        });
        syncBotProfileAttribute(bot, state);
        applyInitialPvpLoadout(bot, state);
        applyForcedModeForDiagnosis(bot, state);
        bot.setLocation?.(botSpawn.clone());
        bot.setLastKnownRegion?.(botSpawn.clone());
        bot.setRegionHeight?.(botSpawn.getZ?.());
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
        bot.moveTo?.(botSpawn.clone());
        spawned++;
        wildernessRoamersAssigned++;
      });
    }

    let spawnCursor = 0;
    const flushSpawnBatch = () => {
      const end = Math.min(
        spawnCursor + BOT_STARTUP_BATCH_SIZE,
        pendingSpawns.length
      );
      while (spawnCursor < end) {
        pendingSpawns[spawnCursor++]?.();
      }
      ensureBehaviorTaskStarted();
      if (spawnCursor < pendingSpawns.length) {
        setTimeout(flushSpawnBatch, BOT_STARTUP_BATCH_DELAY_MS);
        return;
      }
      const spawnSummary = {
        spawned,
        configured: botCount + wildernessRoamerBotCount,
        wildernessRoamersAssigned,
      };
      botApi.log("spawn_complete", spawnSummary);
      if (typeof startupLogger === "function") {
        startupLogger(spawnSummary);
      }
    };

    flushSpawnBatch();
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
    return Math.abs(hash) % 15000;
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
    const totalTiles = width * height;
    if (totalTiles <= 0) {
      return null;
    }
    const seedBase =
      Math.imul(index + 1, 1103515245) ^
      Math.imul((bounds.id?.length ?? 7) + 37, 12345) ^
      Math.imul(minX + maxY + z, 2654435761);
    const startIndex = Math.abs(seedBase) % totalTiles;
    const rawStep = Math.abs(Math.imul(seedBase ^ 0x9e3779b9, 48271)) % totalTiles;
    const step = rawStep === 0 ? 1 : rawStep;
    const attempts = Math.min(totalTiles, WILDERNESS_SPAWN_TILE_PROBE_LIMIT);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const tileIndex = (startIndex + attempt * step) % totalTiles;
      const offsetX = tileIndex % width;
      const offsetY = Math.floor(tileIndex / width);
      const candidate = new Location(minX + offsetX, minY + offsetY, z);
      if (!RegionManager.blocked(candidate, null)) {
        return candidate;
      }
    }
    return baseSpawn.clone().setX(minX).setY(minY).setZ(z);
  }

  function anchorFallbackForBounds(bounds, fallbackLocation) {
    if (!bounds || !fallbackLocation) {
      return fallbackLocation?.clone?.() ?? null;
    }
    return fallbackLocation
      .clone()
      .setX(Math.floor(bounds.minX ?? fallbackLocation.getX()))
      .setY(Math.floor(bounds.minY ?? fallbackLocation.getY()))
      .setZ(Math.floor(bounds.z ?? fallbackLocation.getZ()));
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
      return RegionManager.blocked(anchor, null) ? null : anchor;
    }
    const totalTiles = width * height;
    if (totalTiles <= 0) {
      return RegionManager.blocked(anchor, null) ? null : anchor;
    }
    const seedBase =
      Math.imul(index + 1, 1103515245) ^
      Math.imul(hotspotId.length + 17, 12345) ^
      Math.imul(minX + maxY + (anchor.getZ?.() ?? 0), 2654435761);
    const startIndex = Math.abs(seedBase) % totalTiles;
    const rawStep = Math.abs(Math.imul(seedBase ^ 0x9e3779b9, 48271)) % totalTiles;
    const step = rawStep === 0 ? 1 : rawStep;
    const z = Math.floor(area.z ?? anchor.getZ?.() ?? 0);
    const attempts = Math.min(totalTiles, WILDERNESS_SPAWN_TILE_PROBE_LIMIT);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const tileIndex = (startIndex + attempt * step) % totalTiles;
      const offsetX = tileIndex % width;
      const offsetY = Math.floor(tileIndex / width);
      const candidate = new Location(minX + offsetX, minY + offsetY, z);
      if (!RegionManager.blocked(candidate, null)) {
        return candidate;
      }
    }
    if (!RegionManager.blocked(anchor, null)) {
      return anchor.clone().setZ(z);
    }
    return null;
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
    });
    syncBotProfileAttribute(player, state);
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
