const fs = require("fs");
const path = require("path");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { NPC } = require("../../src/main/typescript/elvarg/game/entity/impl/npc/NPC");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

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

function loadSpawnsFromFile() {
  const spawnsFile = resolveSpawnsFile();
  const raw = fs.readFileSync(spawnsFile, "utf8");
  const parsed = JSON.parse(raw);
  return {
    spawnsFile,
    spawns: Array.isArray(parsed) ? parsed : [],
  };
}

function createNpc(spawn) {
  const id = toInt(spawn?.id, -1);
  const x = toInt(spawn?.position?.x, NaN);
  const y = toInt(spawn?.position?.y, NaN);
  const z = toInt(spawn?.position?.z ?? spawn?.position?.p ?? 0, 0);
  const radius = toInt(spawn?.radius ?? 0, 0);
  const facing = toFacingId(spawn?.facing ?? spawn?.direction ?? -1, -1);

  if (id < 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const npc = new NPC(id, new Location(x, y, z));
  npc.getMovementCoordinator().setRadius(Math.max(0, radius));
  npc.setFace(facing);
  return npc;
}

function removeAllWorldNpcs() {
  const worldNpcs = World.getNpcs();
  const existing = Array.from(worldNpcs);
  for (const npc of existing) {
    worldNpcs.remove(npc);
  }

  World.getAddNPCQueue().length = 0;
  World.getRemoveNPCQueue().length = 0;
}

function loadWorldSpawns(api) {
  const { spawnsFile, spawns } = loadSpawnsFromFile();
  removeAllWorldNpcs();

  let loaded = 0;
  for (const spawn of spawns) {
    const npc = createNpc(spawn);
    if (!npc) {
      continue;
    }

    World.getAddNPCQueue().push(npc);
    loaded++;
  }

  api.log("loaded_elvarg_npc_spawns", {
    file: spawnsFile,
    totalInFile: spawns.length,
    count: loaded,
  });
}

module.exports = {
  name: "ElvargNpcSpawns",
  register(api) {
    let firstLoginRefreshDone = false;

    const runLoad = () => {
      try {
        loadWorldSpawns(api);
      } catch (error) {
        console.error("[plugin:ElvargNpcSpawns] failed to load npc spawns", error);
      }
    };

    runLoad();

    // NpcSpawnDefinitionLoader currently injects a test spawn during boot;
    // refresh once after startup to enforce full JSON spawns.
    api.onPlayerLogin(() => {
      if (firstLoginRefreshDone) {
        return;
      }
      firstLoginRefreshDone = true;
      runLoad();
    });
  },
};
