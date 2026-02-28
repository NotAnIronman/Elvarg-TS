const { Skill } = require("../../../src/main/typescript/elvarg/game/model/Skill");
const { CombatFactory } = require("../../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { registerMeleeHitModifier } = require("../../../src/main/typescript/elvarg/game/content/combat/EquipmentEffects");

const DHAROK_VETERAN_MULTIPLIER = 0.35;

function applyDharokModifiers(entity, baseHit) {
  if (!entity || !CombatFactory.fullDharoks(entity)) {
    return baseHit;
  }

  if (entity.isPlayer()) {
    const player = entity.getAsPlayer();
    const currentHp = player.getHitpoints();
    const maxHp = player.getSkillManager().getMaxLevel(Skill.HITPOINTS);
    if (maxHp <= 0) {
      return baseHit;
    }
    const multiplier = 1 + Math.max(0, (maxHp - currentHp) / maxHp);
    return baseHit * multiplier;
  }

  if (entity.isNpc()) {
    const npc = entity.getAsNpc();
    const maxHitpoints = npc.getDefinition().getHitpoints();
    const currentHp = entity.getHitpoints();
    const bonus = Math.max(0, (maxHitpoints - currentHp) * DHAROK_VETERAN_MULTIPLIER);
    return baseHit + bonus;
  }

  return baseHit;
}

module.exports = function registerDharoksArmourEffects() {
  registerMeleeHitModifier(applyDharokModifiers);
};
