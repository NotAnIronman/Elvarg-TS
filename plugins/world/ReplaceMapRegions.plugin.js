const path = require("path");

// We extended the low level wilderness mine north of the river lum by adding
// various types of rocks. The purpose is for player bots to use.
module.exports = {
  name: "ReplaceMapRegions",
  register(api) {
    // Replace the Edgeville main region with a much better one for private servers
    api.replaceMapRegion(12342, path.join(__dirname, "data", "12342.pack"));
    api.log("registered_region_override", { regionId: 12343 });
  },
};
