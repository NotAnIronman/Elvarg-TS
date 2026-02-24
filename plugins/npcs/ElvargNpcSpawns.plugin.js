const fs = require("fs");
const path = require("path");
const {
  registerNpcSpawnSource,
  ensureNpcSpawnsLoaded,
} = require("./lib/NpcSpawnRegistry");

const SPAWN_FILE_CANDIDATES = [
  path.join(process.cwd(), "data", "definitions", "npc_spawns.json"),
  path.join(process.cwd(), "data", "npc_spawns.json"),
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
    `Could not find npc spawns file. Checked: ${SPAWN_FILE_CANDIDATES.join(", ")}`
  );
}

function readSpawnRowsFromFile() {
  const raw = fs.readFileSync(resolveSpawnsFile(), "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeSpawn(spawn) {
  const position = resolveSpawnPosition(spawn);
  const id = toInt(spawn?.id, -1);
  const x = toInt(position?.x, NaN);
  const y = toInt(position?.y, NaN);
  const z = toInt(position?.z ?? position?.p ?? 0, 0);
  const radius = toOptionalRadius(spawn?.radius);
  const facing = toFacingId(spawn?.facing ?? spawn?.direction ?? -1, -1);
  const description = String(spawn?.description ?? "");

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
  name: "ElvargNpcSpawns",
  register(api) {
    registerNpcSpawnSource({
      api,
      sourceName: "elvarg",
      loadSpawns,
    });

    api.onPlayerLogin(() => {
      ensureNpcSpawnsLoaded(api);
    });
  },
};
