const fs = require("fs");
const path = require("path");

const SPAWN_FILE = path.join(process.cwd(), "data", "definitions", "npc_spawns.json");

module.exports = {
  name: "NpcSpawns",
  register(api) {
    api.registerDefinitionSource("npc_spawns", {
      name: "npc-spawns",
      load() {
        const spawns = JSON.parse(fs.readFileSync(SPAWN_FILE, "utf8"));
        if (!Array.isArray(spawns)) throw new Error(`${SPAWN_FILE} must contain an array`);
        return spawns;
      },
    });
  },
};
