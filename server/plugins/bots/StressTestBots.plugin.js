// Network stress-testing mode: spawns a large number of bare-bones player
// bots that just randomly walk around. No PvP, no economy behaviors -
// this exists purely to generate player-count and movement-packet load.
// Enabled via `--stressTest[=count]` (see Server.ts), off by default.
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { MovementQueue } = require("../../src/main/typescript/elvarg/game/model/movement/MovementQueue");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { createBotPlayer } = require("./behaviours/spawn/BotPlayerFactory");
const { randomInRange } = require("./behaviours/navigation/BotNavigation");
const { WILDERNESS_ROAMING_BOUNDS } = require("./behaviours/spawn/WildernessRoamingBounds");
const { ATTR_SKIP_PERSISTENCE } = require("./runtime/BotPersistenceConstants");

const SPAWN_TILE_PROBE_LIMIT = 40;
const SPAWN_BATCH_SIZE = 50;
const SPAWN_BATCH_DELAY_MS = 20;
const WALK_STEP_SIZE = 1;

function parseStressBotCount() {
  const raw = process.env.STRESS_TEST_BOT_COUNT;
  if (raw === undefined) {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

// Same approach as the wilderness roamer spawns elsewhere in this plugin
// directory: pick a random tile in bounds and reject it via RegionManager's
// clipping check (this also keeps bots off water, which has no floor).
function findWalkableTile(RegionManager, bounds) {
  const z = Math.floor(bounds.z ?? 0);
  for (let attempt = 0; attempt < SPAWN_TILE_PROBE_LIMIT; attempt++) {
    const candidate = new Location(
      randomInRange(bounds.minX, bounds.maxX),
      randomInRange(bounds.minY, bounds.maxY),
      z
    );
    if (!RegionManager.blocked(candidate, null)) {
      return candidate;
    }
  }
  return null;
}

module.exports = {
  name: "StressTestBots",
  register(api) {
    const requestedCount = parseStressBotCount();
    if (requestedCount <= 0) {
      return;
    }

    const RegionManager = api.getRegionManager();
    const bounds = WILDERNESS_ROAMING_BOUNDS[0];
    const players = [];

    const spawnOne = (index) => {
      const location = findWalkableTile(RegionManager, bounds);
      if (!location) {
        return;
      }
      const bot = createBotPlayer(`StressBot${index}`, location, {
        api,
        loadPersistence: false,
        saveRandomizedAppearance: false,
      });
      if (!bot) {
        return;
      }
      bot.setPlayerBot?.(true);
      bot.setAttribute?.(ATTR_SKIP_PERSISTENCE, true);
      players.push(bot);
    };

    let cursor = 0;
    const spawnBatch = () => {
      const end = Math.min(cursor + SPAWN_BATCH_SIZE, requestedCount);
      while (cursor < end) {
        cursor += 1;
        spawnOne(cursor);
      }
      if (cursor < requestedCount) {
        setTimeout(spawnBatch, SPAWN_BATCH_DELAY_MS);
        return;
      }
      api.log("stress_test_bots_spawned", {
        requested: requestedCount,
        spawned: players.length,
      });
    };
    setTimeout(spawnBatch, 0);

    api.getTaskManager().submit(
      new (class extends Task {
        execute() {
          for (const player of players) {
            if (!player.isRegistered?.()) {
              continue;
            }
            MovementQueue.randomClippedStep(player, WALK_STEP_SIZE);
          }
        }
      })(1)
    );
  },
};
