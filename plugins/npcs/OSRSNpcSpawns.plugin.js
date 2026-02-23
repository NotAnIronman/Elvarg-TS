const fs = require("fs");
const path = require("path");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { NPC } = require("../../src/main/typescript/elvarg/game/entity/impl/npc/NPC");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

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

function loadSpawnsFromFile() {
  const spawnsFile = resolveSpawnsFile();
  const raw = fs.readFileSync(spawnsFile, "utf8");
  const parsed = JSON.parse(raw);
  return {
    spawnsFile,
    spawns: Array.isArray(parsed) ? parsed : [],
  };
}

function isFishingSpot(spawn) {
  const name = String(spawn?.name ?? spawn?.description ?? "").toLowerCase();
  return name.includes("fishing spot");
}

function normalizeFishingSpotId(spawn, id) {
  if (!isFishingSpot(spawn)) {
    return id;
  }

  // Explicitly map the spot the user called out.
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

function createNpc(spawn) {
  const id = normalizeNpcId(spawn);
  const position = resolveSpawnPosition(spawn);
  const x = toInt(position?.x ?? spawn?.x, NaN);
  const y = toInt(position?.y ?? spawn?.y, NaN);
  const z = toInt(position?.z ?? position?.p ?? spawn?.z ?? spawn?.p ?? 0, 0);
  const radius = toInt(spawn?.radius ?? 0, 0);
  const direction = toFacingId(spawn?.facing ?? spawn?.direction ?? -1, -1);

  if (id < 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  // Plugin load runs before NPC implementation maps are initialized, so use
  // direct construction instead of NPC.create(...).
  const npc = new NPC(id, new Location(x, y, z));
  npc.getMovementCoordinator().setRadius(Math.max(0, radius));
  npc.setFace(direction);
  if (typeof npc.setDescription === "function") {
    npc.setDescription(String(spawn?.description ?? spawn?.name ?? ""));
  }
  return npc;
}

function prioritizeSpawnsForCapacity(spawns, capacity) {
  if (capacity <= 0) {
    return {
      selected: [],
      fishingTotal: 0,
      fishingSelected: 0,
    };
  }

  const fishing = [];
  const other = [];

  for (const spawn of spawns) {
    if (isFishingSpot(spawn)) {
      fishing.push(spawn);
    } else {
      other.push(spawn);
    }
  }

  const selected = fishing.concat(other).slice(0, capacity);
  const fishingSelected = selected.filter((spawn) => isFishingSpot(spawn)).length;

  return {
    selected,
    fishingTotal: fishing.length,
    fishingSelected,
  };
}

module.exports = {
  name: "OSRSNpcSpawns",
  register(api) {
    let firstLoginRefreshDone = false;

    const runLoad = () => {
      try {
        const { spawnsFile, spawns } = loadSpawnsFromFile();

        // World NPC indices are bounded; queueing beyond capacity drops entries.
        const maxNpcs = Math.max(0, World.getNpcs().capacityReturn() - 1);
        const { selected, fishingTotal, fishingSelected } = prioritizeSpawnsForCapacity(
          spawns,
          maxNpcs
        );

        // Replace existing world spawns with the OSRS set.
        World.getNpcs().clear();
        World.getAddNPCQueue().length = 0;
        World.getRemoveNPCQueue().length = 0;

        let loaded = 0;
        for (const spawn of selected) {
          const npc = createNpc(spawn);
          if (!npc) {
            continue;
          }
          World.getAddNPCQueue().push(npc);
          loaded++;
        }

        api.log("loaded_osrs_npc_spawns", {
          file: spawnsFile,
          totalInFile: spawns.length,
          selectedForCapacity: selected.length,
          worldNpcCapacity: maxNpcs,
          fishingSpotsInFile: fishingTotal,
          fishingSpotsSelected: fishingSelected,
          count: loaded,
        });
      } catch (error) {
        console.error("[plugin:OSRSNpcSpawns] failed to load npc spawns", error);
      }
    };

    runLoad();

    // ElvargNpcSpawns refreshes once on first login; refresh OSRS once after that
    // so the active world spawn set remains OSRS.
    api.onPlayerLogin(() => {
      if (firstLoginRefreshDone) {
        return;
      }
      firstLoginRefreshDone = true;
      runLoad();
    });
  },
};
