const { Animation } = require("../../../../../src/main/typescript/elvarg/game/model/Animation");
const { Skill } = require("../../../../../src/main/typescript/elvarg/game/model/Skill");
const { TimerKey } = require("../../../../../src/main/typescript/elvarg/util/timers/TimerKey");
const { resolveBotNodeContext } = require("../context/BotNodeContext");

const EAT_ANIMATION = new Animation(829);

class EatFoodActionNode {
  constructor(botStatesByName, api, options = {}) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.lowHpRatio = Math.max(0.05, Math.min(0.95, Number(options.lowHpRatio ?? 0.45)));
    this.minHeal = Math.max(1, Number(options.minHeal ?? 12));
    this.maxHeal = Math.max(this.minHeal, Number(options.maxHeal ?? 18));
  }

  randomHealAmount() {
    const range = this.maxHeal - this.minHeal;
    if (range <= 0) {
      return this.minHeal;
    }
    return this.minHeal + Math.floor(Math.random() * (range + 1));
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requireNotBusy: false,
      requireNotInCombat: false,
      requireNoTraversalTransition: false,
    });
    if (!resolved) {
      return "failure";
    }

    const { player } = resolved;
    const skillManager = player.getSkillManager?.();
    if (!skillManager) {
      return "failure";
    }

    const currentHp = Number(skillManager.getCurrentLevel?.(Skill.HITPOINTS) ?? 0);
    const maxHp = Number(skillManager.getMaxLevel?.(Skill.HITPOINTS) ?? 0);
    if (currentHp <= 0 || maxHp <= 0) {
      return "failure";
    }

    const lowHpThreshold = Math.max(1, Math.ceil(maxHp * this.lowHpRatio));
    if (currentHp > lowHpThreshold) {
      return "failure";
    }

    const timers = player.getTimers?.();
    if (!timers || timers.has?.(TimerKey.FOOD) || timers.has?.(TimerKey.STUN)) {
      return "failure";
    }

    timers.extendOrRegister?.(TimerKey.FOOD, 3);
    timers.extendOrRegister?.(TimerKey.COMBAT_ATTACK, 5);
    player.getPacketSender?.().sendInterfaceRemoval?.();
    skillManager.stopSkillable?.();
    player.performAnimation?.(EAT_ANIMATION);

    const healAmount = this.randomHealAmount();
    player.heal?.(healAmount);
    const nextHp = Number(skillManager.getCurrentLevel?.(Skill.HITPOINTS) ?? currentHp);
    this.api?.log?.("bot_imaginary_food_eat", {
      username: player.getUsername?.(),
      currentHp,
      nextHp,
      healAmount,
      maxHp,
      threshold: lowHpThreshold,
    });
    return "success";
  }
}

module.exports = {
  EatFoodActionNode,
};
