const { CombatEquipment } = require("../../../../src/main/typescript/elvarg/game/content/combat/CombatEquipment");
const { CombatType } = require("../../../../src/main/typescript/elvarg/game/content/combat/CombatType");
const {
  registerMeleeHitModifier,
  registerMeleeAttackAccuracyModifier,
  registerMeleeDefenseModifier,
  registerRangedHitModifier,
  registerRangedAttackAccuracyModifier,
  registerMagicHitModifier,
  registerMagicAttackAccuracyModifier,
} = require("../../../../src/main/typescript/elvarg/game/content/combat/EquipmentEffects");

const VOID_BONUS = 0.10;
const VOID_MAGIC_MULTIPLIER = 1.45;
const VOID_RANGED_MULTIPLIER = 1.125;

function applyVoidMeleeDamage(entity, baseHit) {
  if (!entity || !entity.isPlayer()) {
    return baseHit;
  }
  if (CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.MELEE)) {
    return baseHit * (1 + VOID_BONUS);
  }
  return baseHit;
}

function applyVoidRangedDamage(entity, baseHit) {
  if (!entity || !entity.isPlayer()) {
    return baseHit;
  }
  if (CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.RANGED)) {
    return baseHit * VOID_RANGED_MULTIPLIER;
  }
  return baseHit;
}

function applyVoidMagicDamage(entity, baseHit) {
  if (!entity || !entity.isPlayer()) {
    return baseHit;
  }
  if (CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.MAGIC)) {
    return baseHit * VOID_MAGIC_MULTIPLIER;
  }
  return baseHit;
}

function applyVoidMeleeAccuracy(entity, value) {
  if (entity && entity.isPlayer() && CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.MELEE)) {
    return value * (1 + VOID_BONUS);
  }
  return value;
}

function applyVoidMeleeDefense(entity, value) {
  if (entity && entity.isPlayer() && CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.MELEE)) {
    return value * (1 + VOID_BONUS);
  }
  return value;
}

function applyVoidRangedAccuracy(entity, value) {
  if (entity && entity.isPlayer() && CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.RANGED)) {
    return value * VOID_RANGED_MULTIPLIER;
  }
  return value;
}

function applyVoidMagicAccuracy(entity, value) {
  if (entity && entity.isPlayer() && CombatEquipment.wearingVoid(entity.getAsPlayer(), CombatType.MAGIC)) {
    return value * VOID_MAGIC_MULTIPLIER;
  }
  return value;
}

module.exports = function registerVoidSetEffects() {
  registerMeleeHitModifier(applyVoidMeleeDamage);
  registerRangedHitModifier(applyVoidRangedDamage);
  registerMagicHitModifier(applyVoidMagicDamage);
  registerMeleeAttackAccuracyModifier(applyVoidMeleeAccuracy);
  registerMeleeDefenseModifier(applyVoidMeleeDefense);
  registerRangedAttackAccuracyModifier(applyVoidRangedAccuracy);
  registerMagicAttackAccuracyModifier(applyVoidMagicAccuracy);
};
