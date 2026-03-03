const path = require("path");

// We extended the low level wilderness mine north of the river lum by adding
// various types of rocks. The purpose is for player bots to use.
module.exports = {
  name: "ExtendEdgevilleMine",
  register(api) {
    api.replaceMapRegion(12343, path.join(__dirname, "data", "12343.pack"));
    api.log("registered_region_override", { regionId: 12343 });
  },
};
