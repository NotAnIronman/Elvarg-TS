const registerDharoksArmourEffects = require("./effects/DharoksArmour");
const registerVoidSetEffects = require("./effects/VoidSet");
const registerObsidianEffects = require("./effects/ObsidianArmour");
const registerMagicStaffEffects = require("./effects/MagicStaves");

module.exports = {
  name: "EquipmentEffects",
  register(api) {
    registerDharoksArmourEffects();
    registerVoidSetEffects();
    registerObsidianEffects();
    registerMagicStaffEffects();
  },
};
