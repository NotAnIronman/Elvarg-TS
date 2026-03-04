const path = require("path");
const fs = require("fs");

// We extended the low level wilderness mine north of the river lum by adding
// various types of rocks. The purpose is for player bots to use.
module.exports = {
  name: "ReplaceMapRegions",
  register(api) {
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      api.log("region_override_data_dir_missing", { dataDir });
      return;
    }

    const entries = fs
      .readdirSync(dataDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pack"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    let loaded = 0;
    for (const filename of entries) {
      const match = filename.match(/^(\d+)\.pack$/i);
      if (!match) {
        api.log("region_override_skipped_file", { filename });
        continue;
      }
      const regionId = Number.parseInt(match[1], 10);
      if (!Number.isInteger(regionId) || regionId < 0 || regionId > 0xffff) {
        api.log("region_override_invalid_region_id", { filename, regionId });
        continue;
      }

      api.replaceMapRegion(regionId, path.join(dataDir, filename));
      api.log("registered_region_override", { regionId, filename });
      loaded++;
    }

    api.log("registered_region_overrides_complete", {
      loaded,
      scanned: entries.length,
    });
  },
};
