const fs = require("fs");
const path = require("path");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const {
  registerNpcSpawnSource,
  ensureNpcSpawnsLoaded,
} = require("./lib/NpcSpawnRegistry");
const getGameConstants = () =>
  require("../../src/main/typescript/elvarg/game/GameConstants").GameConstants;

const SPAWN_FILE_CANDIDATES = [
  path.join(process.cwd(), "data", "definitions", "npc_spawns_osrs.json"),
  path.join(process.cwd(), "data", "npc_spawns_osrs.json"),
];

const FACING_ID_BY_NAME = {
  NORTH_WEST: 0,
  NORTH: 1,
  NORTH_EAST: 2,
  WEST: 3,
  EAST: 4,
  SOUTH_WEST: 5,
  SOUTH: 6,
  SOUTH_EAST: 7,
};

const LEGACY_FISHING_SPOT_NET_BAIT_ID = 1497;
const LEGACY_FISHING_SPOT_CAGE_HARPOON_ID = 1510;
const LEGACY_FISHING_SPOT_NET_HARPOON_ID = 1511;

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toOptionalRadius(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.max(0, Math.trunc(n));
}

function toFacingId(value, fallback = -1) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (Object.prototype.hasOwnProperty.call(FACING_ID_BY_NAME, normalized)) {
      return FACING_ID_BY_NAME[normalized];
    }
  }

  return fallback;
}

function resolveSpawnPosition(spawn) {
  const position = spawn?.position;
  if (Array.isArray(position)) {
    return position.length > 0 ? position[0] : null;
  }
  if (position && typeof position === "object") {
    return position;
  }
  return null;
}

function resolveSpawnsFile() {
  for (const file of SPAWN_FILE_CANDIDATES) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  throw new Error(
    `Could not find osrs npc spawns file. Checked: ${SPAWN_FILE_CANDIDATES.join(", ")}`
  );
}

function readSpawnRowsFromFile() {
  const raw = fs.readFileSync(resolveSpawnsFile(), "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function isFishingSpot(spawn) {
  const name = String(spawn?.name ?? spawn?.description ?? "").toLowerCase();
  return name.includes("fishing spot");
}

function normalizeFishingSpotId(spawn, id) {
  if (!isFishingSpot(spawn)) {
    return id;
  }

  if (id === 5234) {
    return LEGACY_FISHING_SPOT_NET_HARPOON_ID;
  }

  const actions = Array.isArray(spawn?.actions)
    ? spawn.actions.map((a) => String(a ?? "").toLowerCase())
    : [];
  const hasAction = (needle) => actions.some((a) => a.includes(needle));

  if (hasAction("harpoon")) {
    return hasAction("cage")
      ? LEGACY_FISHING_SPOT_CAGE_HARPOON_ID
      : LEGACY_FISHING_SPOT_NET_HARPOON_ID;
  }

  if (
    hasAction("bait") ||
    hasAction("lure") ||
    hasAction("net") ||
    hasAction("use-rod") ||
    hasAction("catch")
  ) {
    return LEGACY_FISHING_SPOT_NET_BAIT_ID;
  }

  return id;
}

function normalizeNpcId(spawn) {
  const id = toInt(spawn?.id, -1);
  if (id < 0) {
    return id;
  }

  return normalizeFishingSpotId(spawn, id);
}

function normalizeSpawn(spawn) {
  const id = normalizeNpcId(spawn);
  const position = resolveSpawnPosition(spawn);
  const x = toInt(position?.x ?? spawn?.x, NaN);
  const y = toInt(position?.y ?? spawn?.y, NaN);
  const z = toInt(position?.z ?? position?.p ?? spawn?.z ?? spawn?.p ?? 0, 0);
  const radius = toOptionalRadius(spawn?.radius);
  const facing = toFacingId(spawn?.facing ?? spawn?.direction ?? -1, -1);
  const description = String(spawn?.description ?? spawn?.name ?? "");

  if (id < 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    id,
    x,
    y,
    z,
    radius,
    facing,
    description,
  };
}

function loadSpawns() {
  const rows = readSpawnRowsFromFile();
  const normalizedSpawns = [];

  for (const row of rows) {
    const normalized = normalizeSpawn(row);
    if (!normalized) {
      continue;
    }
    normalizedSpawns.push(normalized);
  }

  return normalizedSpawns;
}

module.exports = {
  name: "OSRSNpcSpawns",
  register(api) {
    const GameConstants = getGameConstants();
    if (!GameConstants.ENABLE_OSRS_NPC_SPAWNS) {
      if (api && typeof api.log === "function") {
        api.log("osrs_spawn_source_disabled", {
          flag: "GameConstants.ENABLE_OSRS_NPC_SPAWNS",
          enabled: false,
        });
      }
      return;
    }

    registerNpcSpawnSource({
      api,
      sourceName: "osrs",
      loadSpawns,
    });

    api.onPlayerLogin(() => {
      ensureNpcSpawnsLoaded(api);
    });
  },
};
