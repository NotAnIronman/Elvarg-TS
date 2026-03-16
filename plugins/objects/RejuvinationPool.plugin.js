const { CombatFactory } = require("../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { CombatSpecial } = require("../../src/main/typescript/elvarg/game/content/combat/CombatSpecial");
const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const POOL_ID = ObjectIds.ORNATE_REJUVENATION_POOL;
const ATTR_BLEED_TASK_KEY = "combat:bleed:taskKey";

function isRecentPvpCombat(player) {
  if (!player) {
    return false;
  }
  const combat = player.getCombat?.();
  const participants = [
    combat?.getTarget?.(),
    combat?.getAttacker?.(),
    player.getCombatFollowing?.(),
  ];
  return participants.some(
    (other) =>
      other?.isPlayer?.() === true &&
      other?.isRegistered?.() === true &&
      (other.getHitpoints?.() ?? 0) > 0
  );
}

function restoreLoweredStats(player) {
  const skillManager = player.getSkillManager?.();
  if (!skillManager) {
    return;
  }
  for (const skill of Skill.values()) {
    const current = Number(skillManager.getCurrentLevel?.(skill) ?? 0);
    const max = Number(skillManager.getMaxLevel?.(skill) ?? 0);
    if (current < max) {
      skillManager.setCurrentLevels?.(skill, max, true);
    }
  }
}

function restorePrayer(player) {
  const skillManager = player.getSkillManager?.();
  if (!skillManager) {
    return;
  }
  const maxPrayer = Number(skillManager.getMaxLevel?.(Skill.PRAYER) ?? 0);
  if (maxPrayer > 0) {
    skillManager.setCurrentLevels?.(Skill.PRAYER, maxPrayer, true);
  }
}

function restoreHitpoints(player) {
  const skillManager = player.getSkillManager?.();
  const maxHp = Number(skillManager?.getMaxLevel?.(Skill.HITPOINTS) ?? 0);
  if (maxHp > 0) {
    player.setHitpoints?.(maxHp);
  }
}

function restoreSpecialAttack(player) {
  player.setSpecialActivated?.(false);
  player.setRecoveringSpecialAttack?.(false);
  player.setSpecialPercentage?.(100);
  player.getSpecialAttackRestore?.().stop?.();
  CombatSpecial.updateBar?.(player);
}

function restoreRunEnergy(player) {
  player.setRunEnergy?.(100);
  player.getPacketSender?.().sendRunEnergy?.();
}

function clearPoisonAndVenom(player) {
  player.setPoisonDamage?.(0);
  player.getPacketSender?.().sendPoisonType?.(0);
}

function clearBleed(player) {
  const bleedTaskKey = player.getAttribute?.(ATTR_BLEED_TASK_KEY);
  if (bleedTaskKey) {
    TaskManager.cancelTasks(bleedTaskKey);
    player.setAttribute?.(ATTR_BLEED_TASK_KEY, null);
  }
}

function restoreFromPool(player) {
  restoreHitpoints(player);
  restoreSpecialAttack(player);
  restoreRunEnergy(player);
  restorePrayer(player);
  restoreLoweredStats(player);
  clearPoisonAndVenom(player);
  clearBleed(player);
}

module.exports = {
  name: "RejuvinationPool",
  register(api) {
    api.onObjectFirstClick([POOL_ID], (event) => {
      if (isRecentPvpCombat(event.player)) {
        event.player
          .getPacketSender()
          .sendMessage("You can't drink from the pool during combat.");
        event.handled = true;
        return;
      }
      restoreFromPool(event.player);
      event.player
        .getPacketSender()
        .sendMessage("You feel fully rejuvenated.");
      event.handled = true;
    });
  },
};
