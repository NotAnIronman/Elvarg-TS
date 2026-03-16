const fs = require("fs");
const path = require("path");
const { World } = require("../../../src/main/typescript/elvarg/game/World");
const { NPC } = require("../../../src/main/typescript/elvarg/game/entity/impl/npc/NPC");
const { Location } = require("../../../src/main/typescript/elvarg/game/model/Location");

const NPC_SPAWN_REGISTRY_STATE_KEY = "__npcSpawnRegistryState";

const SOURCE_PRIORITY = Object.freeze({
  osrs: 10,
  elvarg: 20,
});

const NPC_DEFINITION_FILE_CANDIDATES = [
  path.join(process.cwd(), "data", "definitions", "npc_defs.json"),
  path.join(process.cwd(), "data", "npc_defs.json"),
];

function getState() {
  if (!globalThis[NPC_SPAWN_REGISTRY_STATE_KEY]) {
    globalThis[NPC_SPAWN_REGISTRY_STATE_KEY] = {
      api: null,
      sources: new Map(),
      sourceSpawns: new Map(),
      initialLoadScheduled: false,
      spawnedNpcs: new Set(),
      hasAppliedSpawns: false,
      supportedNpcIds: null,
    };
  }
  return globalThis[NPC_SPAWN_REGISTRY_STATE_KEY];
}

function sourcePriority(name) {
  return SOURCE_PRIORITY[name] ?? 100;
}

function getOrderedSourceNames(sourceNames) {
  return Array.from(sourceNames).sort((a, b) => {
    const priorityDiff = sourcePriority(a) - sourcePriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return a.localeCompare(b);
  });
}

function buildNpcKey(spawn) {
  return `${spawn.id}:${spawn.x}:${spawn.y}:${spawn.z}`;
}

function resolveNpcDefinitionFile() {
  for (const file of NPC_DEFINITION_FILE_CANDIDATES) {
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

function loadSupportedNpcIds(state, api) {
  const file = resolveNpcDefinitionFile();
  if (!file) {
    state.supportedNpcIds = null;
    console.warn(
      `[plugin:npc-spawns] npc_defs.json not found; skipping spawn id compatibility filtering`
    );
    return false;
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    const defs = JSON.parse(raw);
    const ids = new Set();
    if (Array.isArray(defs)) {
      for (const def of defs) {
        const id = Number(def?.id);
        if (!Number.isFinite(id)) {
          continue;
        }
        ids.add(Math.trunc(id));
      }
    }
    state.supportedNpcIds = ids;

    if (api && typeof api.log === "function") {
      api.log("npc_spawn_supported_ids_loaded", {
        file,
        count: ids.size,
      });
    }

    return true;
  } catch (error) {
    state.supportedNpcIds = null;
    console.error(`[plugin:npc-spawns] failed to load npc defs from ${file}`, error);
    return false;
  }
}

function resolveNpcRadius(npc, explicitRadius) {
  if (Number.isFinite(explicitRadius)) {
    return Math.max(0, Math.trunc(explicitRadius));
  }

  let definitionRadius = NaN;
  if (npc && typeof npc.getDefinition === "function") {
    const definition = npc.getDefinition();
    if (definition && typeof definition.getWalkRadius === "function") {
      definitionRadius = Number(definition.getWalkRadius());
    }
  }
  if (Number.isFinite(definitionRadius) && definitionRadius > 0) {
    return Math.max(0, Math.trunc(definitionRadius));
  }

  const size = npc && typeof npc.getSize === "function" ? Number(npc.getSize()) : NaN;
  if (Number.isFinite(size) && size > 0) {
    return Math.max(0, Math.trunc(size) + 5);
  }

  return 0;
}

function removeSpawnRegistryNpcs(state) {
  if (!state || !state.spawnedNpcs) {
    return;
  }

  const addQueue = World.getAddNPCQueue();
  const removeQueue = World.getRemoveNPCQueue();
  const worldNpcs = World.getNpcs();

  for (const npc of state.spawnedNpcs) {
    if (!npc) {
      continue;
    }

    for (let index = addQueue.indexOf(npc); index !== -1; index = addQueue.indexOf(npc)) {
      addQueue.splice(index, 1);
    }

    for (let index = removeQueue.indexOf(npc); index !== -1; index = removeQueue.indexOf(npc)) {
      removeQueue.splice(index, 1);
    }

    if (typeof npc.isRegistered === "function" && npc.isRegistered()) {
      worldNpcs.remove(npc);
    }
  }

  state.spawnedNpcs.clear();
}

function clearPlayerLocalNpcs() {
  for (const player of World.getPlayers()) {
    if (!player || typeof player.getLocalNpcs !== "function") {
      continue;
    }
    const localNpcs = player.getLocalNpcs();
    if (Array.isArray(localNpcs)) {
      localNpcs.length = 0;
    }
  }
}

function addNpcFromSpawn(spawn, state) {
  const npc = NPC.create(spawn.id, new Location(spawn.x, spawn.y, spawn.z));
  npc.getMovementCoordinator().setRadius(resolveNpcRadius(npc, spawn.radius));
  npc.setFace(Number.isFinite(spawn.facing) ? Math.trunc(spawn.facing) : -1);
  if (typeof npc.setDescription === "function" && spawn.description) {
    npc.setDescription(spawn.description);
  }
  const added = World.getNpcs().add(npc);
  if (added && state?.spawnedNpcs) {
    state.spawnedNpcs.add(npc);
  }
  return added;
}

function countRegisteredSpawnRegistryNpcs(state) {
  if (!state?.spawnedNpcs) {
    return 0;
  }
  let count = 0;
  for (const npc of state.spawnedNpcs) {
    if (npc && typeof npc.isRegistered === "function" && npc.isRegistered()) {
      count++;
    }
  }
  return count;
}

function getCombinedSpawns(state) {
  const orderedSources = getOrderedSourceNames(state.sourceSpawns.keys());
  const dedupedByKey = new Map();
  const unsupportedIdCountById = new Map();
  let totalCandidates = 0;
  let filteredUnsupportedNpcIds = 0;
  const supportedNpcIds = state?.supportedNpcIds ?? null;

  for (const sourceName of orderedSources) {
    const sourceSpawns = state.sourceSpawns.get(sourceName);
    if (!Array.isArray(sourceSpawns)) {
      continue;
    }

    totalCandidates += sourceSpawns.length;

    for (const spawn of sourceSpawns) {
      if (
        !spawn ||
        typeof spawn.id !== "number" ||
        !Number.isFinite(spawn.id) ||
        !Number.isFinite(spawn.x) ||
        !Number.isFinite(spawn.y) ||
        !Number.isFinite(spawn.z)
      ) {
        continue;
      }

      const npcId = Math.trunc(spawn.id);
      const shouldFilterUnsupportedId =
        sourceName !== "elvarg" && supportedNpcIds && !supportedNpcIds.has(npcId);

      if (shouldFilterUnsupportedId) {
        filteredUnsupportedNpcIds++;
        unsupportedIdCountById.set(
          npcId,
          (unsupportedIdCountById.get(npcId) ?? 0) + 1
        );
        continue;
      }

      dedupedByKey.set(buildNpcKey(spawn), {
        ...spawn,
        id: npcId,
      });
    }
  }

  const filteredUnsupportedNpcIdSamples = Array.from(
    unsupportedIdCountById.entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, count]) => ({ id, count }));

  return {
    orderedSources,
    totalCandidates,
    filteredUnsupportedNpcIds,
    filteredUnsupportedNpcIdSamples,
    spawns: Array.from(dedupedByKey.values()),
  };
}

function setGlobalHooks(state) {
  const orderedSources = getOrderedSourceNames(state.sources.keys());
  globalThis.__npcSpawnSource = orderedSources.join("+") || "none";
  globalThis.__npcSpawnReload = () => reloadAllNpcSpawnSources(state.api);
}

function applyCombinedSpawns(api) {
  const state = getState();
  const combined = getCombinedSpawns(state);

  const maxNpcs = Math.max(0, World.getNpcs().capacityReturn() - 1);
  const selected = combined.spawns.slice(0, maxNpcs);

  removeSpawnRegistryNpcs(state);

  let loaded = 0;
  for (const spawn of selected) {
    if (addNpcFromSpawn(spawn, state)) {
      loaded++;
    }
  }

  state.hasAppliedSpawns = true;

  clearPlayerLocalNpcs();

  if (api && typeof api.log === "function") {
    api.log("applied_npc_spawns", {
      sources: combined.orderedSources,
      totalCandidates: combined.totalCandidates,
      filteredUnsupportedNpcIds: combined.filteredUnsupportedNpcIds,
      filteredUnsupportedNpcIdSamples: combined.filteredUnsupportedNpcIdSamples,
      deduped: combined.spawns.length,
      selectedForCapacity: selected.length,
      worldNpcCapacity: maxNpcs,
      count: loaded,
    });
  }

  return {
    loaded,
    orderedSources: combined.orderedSources,
    totalCandidates: combined.totalCandidates,
    filteredUnsupportedNpcIds: combined.filteredUnsupportedNpcIds,
    filteredUnsupportedNpcIdSamples: combined.filteredUnsupportedNpcIdSamples,
    deduped: combined.spawns.length,
    selectedForCapacity: selected.length,
    worldNpcCapacity: maxNpcs,
  };
}

function reloadNpcSpawnSource(sourceName, api) {
  const state = getState();
  const source = state.sources.get(sourceName);
  if (!source || typeof source.loadSpawns !== "function") {
    return false;
  }

  try {
    const sourceSpawns = source.loadSpawns();
    if (!Array.isArray(sourceSpawns)) {
      console.warn(
        `[plugin:npc-spawns] source ${sourceName} returned non-array spawns; using empty list`
      );
      state.sourceSpawns.set(sourceName, []);
    } else {
      state.sourceSpawns.set(sourceName, sourceSpawns);
    }

    if (api && typeof api.log === "function") {
      api.log("loaded_npc_spawn_source", {
        source: sourceName,
        sourceSpawnCount: Array.isArray(sourceSpawns) ? sourceSpawns.length : 0,
      });
    }

    return true;
  } catch (error) {
    console.error(`[plugin:npc-spawns] failed to load source ${sourceName}`, error);
    return false;
  }
}

function reloadAllNpcSpawnSources(api) {
  const state = getState();
  const orderedSources = getOrderedSourceNames(state.sources.keys());

  loadSupportedNpcIds(state, api);

  let ok = true;
  for (const sourceName of orderedSources) {
    const loaded = reloadNpcSpawnSource(sourceName, api);
    if (!loaded) {
      ok = false;
    }
  }

  applyCombinedSpawns(api);
  setGlobalHooks(state);
  return ok;
}

function scheduleInitialLoad(api) {
  const state = getState();
  if (state.initialLoadScheduled) {
    return;
  }

  state.initialLoadScheduled = true;
  setImmediate(() => {
    state.initialLoadScheduled = false;
    reloadAllNpcSpawnSources(api);
  });
}

function registerNpcSpawnSource({ api, sourceName, loadSpawns }) {
  if (typeof sourceName !== "string" || sourceName.trim().length === 0) {
    throw new Error("registerNpcSpawnSource requires a non-empty sourceName");
  }

  if (typeof loadSpawns !== "function") {
    throw new Error(
      `registerNpcSpawnSource(${sourceName}) requires loadSpawns()`
    );
  }

  const state = getState();
  state.api = api;
  state.sources.set(sourceName, { loadSpawns });
  setGlobalHooks(state);
  scheduleInitialLoad(api);
}

function ensureNpcSpawnsLoaded(api) {
  const state = getState();
  const registeredCount = countRegisteredSpawnRegistryNpcs(state);
  if (state.hasAppliedSpawns && registeredCount > 0) {
    return true;
  }
  return reloadAllNpcSpawnSources(api);
}

module.exports = {
  registerNpcSpawnSource,
  ensureNpcSpawnsLoaded,
  reloadAllNpcSpawnSources,
};
