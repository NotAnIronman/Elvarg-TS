const { Equipment } = require("../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { ItemIdentifiers } = require("../../../src/main/typescript/elvarg/util/ItemIdentifiers");
const { registerMagicHitModifier } = require("../../../src/main/typescript/elvarg/game/content/combat/EquipmentEffects");

const STAFF_MULTIPLIERS = new Map([
  [ItemIdentifiers.AHRIMS_STAFF, 1.05],
  [ItemIdentifiers.KODAI_WAND, 1.15],
  [ItemIdentifiers.STAFF_OF_THE_DEAD, 1.15],
  [ItemIdentifiers.STAFF_OF_LIGHT, 1.15],
  [ItemIdentifiers.TOXIC_STAFF_OF_THE_DEAD, 1.15],
]);

function applyMagicStaffDamage(entity, baseHit) {
  if (!entity || !entity.isPlayer()) {
    return baseHit;
  }
  const player = entity.getAsPlayer();
  const weaponId = player.getEquipment().get(Equipment.WEAPON_SLOT).getId();
  const multiplier = STAFF_MULTIPLIERS.get(weaponId);
  if (multiplier) {
    return baseHit * multiplier;
  }
  return baseHit;
}

module.exports = function registerMagicStaffEffects() {
  registerMagicHitModifier(applyMagicStaffDamage);
};
