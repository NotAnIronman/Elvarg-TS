const { CombatMethod } = require("../../src/main/typescript/elvarg/game/content/combat/method/CombatMethod");
const { CombatType } = require("../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { PendingHit } = require("../../src/main/typescript/elvarg/game/content/combat/hit/PendingHit");
const { Projectile } = require("../../src/main/typescript/elvarg/game/model/Projectile");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../src/main/typescript/elvarg/game/model/Graphic");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");
const {
  resolveChromaticDragonfireDamage,
  initDragonfireProtectionCoreAccess,
} = require("../combat/DragonfireProtection");

const GREEN_DRAGON_IDS = [
  NpcIdentifiers.GREEN_DRAGON,
  NpcIdentifiers.GREEN_DRAGON_2,
  NpcIdentifiers.GREEN_DRAGON_3,
  NpcIdentifiers.GREEN_DRAGON_4,
  NpcIdentifiers.GREEN_DRAGON_5,
];

const GREEN_DRAGON_MELEE_ANIMATION = new Animation(80);
const GREEN_DRAGON_DRAGONFIRE_ANIMATION = new Animation(81);
const GREEN_DRAGON_DRAGONFIRE_PROJECTILE_ID = 393;
const GREEN_DRAGON_DRAGONFIRE_IMPACT_GFX = new Graphic(1);

class GreenDragonCombatMethod extends CombatMethod {
  constructor() {
    super();
    this.useDragonfire = false;
    this.currentAttackType = CombatType.MELEE;
  }

  start(character, target) {
    this.selectAttack(character, target);
    if (this.useDragonfire) {
      character.performAnimation(GREEN_DRAGON_DRAGONFIRE_ANIMATION);
      Projectile.createProjectile(
        character,
        target,
        GREEN_DRAGON_DRAGONFIRE_PROJECTILE_ID,
        40,
        55,
        31,
        43
      ).sendProjectile();
      return;
    }
    character.performAnimation(GREEN_DRAGON_MELEE_ANIMATION);
  }

  attackSpeed() {
    return 4;
  }

  attackDistance() {
    // Green dragons only use dragonfire when they are already in melee reach.
    return 1;
  }

  type() {
    return this.currentAttackType;
  }

  hits(character, target) {
    if (!this.useDragonfire) {
      return [new PendingHit(character, target, this, 1)];
    }

    const hit = new PendingHit(character, target, this, {
      delay: 1,
      rollAccuracy: false,
    });

    if (target.isPlayer()) {
      const player = target.getAsPlayer();
      const dragonfire = resolveChromaticDragonfireDamage(character, player, {
        maxHit: 50,
        closeRange: true,
      });
      hit.setTotalDamage(dragonfire.damage);
      player.getPacketSender().sendMessage(dragonfire.message);
    } else {
      hit.setTotalDamage(0);
    }

    return [hit];
  }

  handleAfterHitEffects(hit) {
    if (!this.useDragonfire) {
      return;
    }
    const target = hit?.getTarget?.();
    target?.performGraphic?.(GREEN_DRAGON_DRAGONFIRE_IMPACT_GFX);
  }

  finished() {
  }

  selectAttack(character, target) {
    const canUseCloseRangeDragonfire =
      !!character &&
      !!target &&
      target.isPlayer?.() === true &&
      character.calculateDistance(target) <= 1;

    this.useDragonfire =
      canUseCloseRangeDragonfire &&
      Misc.randomInclusive(0, 5) === 0;
    this.currentAttackType = this.useDragonfire
      ? CombatType.MAGIC
      : CombatType.MELEE;
  }
}

module.exports = {
  name: "Dragons",
  register(api) {
    initDragonfireProtectionCoreAccess(api);
    api.registerNpcCombatMethodProvider(
      GREEN_DRAGON_IDS,
      GreenDragonCombatMethod,
      { singleton: false }
    );
  },
};
