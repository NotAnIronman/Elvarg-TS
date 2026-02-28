const { CombatMethod } = require("../../src/main/typescript/elvarg/game/content/combat/method/CombatMethod");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Graphic } = require("../../src/main/typescript/elvarg/game/model/Graphic");
const { CombatType } = require("../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { PendingHit } = require("../../src/main/typescript/elvarg/game/content/combat/hit/PendingHit");
const { Projectile } = require("../../src/main/typescript/elvarg/game/model/Projectile");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { WeaponInterfaces } = require("../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces");
const { BonusManager } = require("../../src/main/typescript/elvarg/game/model/equipment/BonusManager");
const { Flag } = require("../../src/main/typescript/elvarg/game/model/Flag");
const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");

const ChaosElementalAttackType = {
  DEFAULT: 558,
  DISARM: 551,
  TELEPORT: 554,
};

class ChaosElementalCombatMethod extends CombatMethod {
  static MELEE_COMBAT_GFX = new Graphic(869, 0);
  static RANGED_COMBAT_GFX = new Graphic(867, 0);
  static MAGIC_COMBAT_GFX = new Graphic(868, 0);
  static currentAttack = ChaosElementalAttackType.DEFAULT;
  static combatType = CombatType.MELEE;

  type() {
    return ChaosElementalCombatMethod.combatType;
  }

  hits(character, target) {
    return [new PendingHit(character, target, this, 2)];
  }

  start(character, target) {
    character.performAnimation(new Animation(character.getAttackAnim()));
    const projectile = Projectile.createProjectile(
      character,
      target,
      ChaosElementalCombatMethod.currentAttack,
      40,
      70,
      31,
      43
    );
    projectile.sendProjectile();
  }

  attackDistance() {
    return 8;
  }

  finished(character, target) {
    if (Misc.getRandom(100) <= 10) {
      ChaosElementalCombatMethod.currentAttack = ChaosElementalAttackType.DISARM;
    } else if (Misc.getRandom(100) <= 10) {
      ChaosElementalCombatMethod.currentAttack = ChaosElementalAttackType.TELEPORT;
    }
    const keys = Object.keys(CombatType);
    const randomIndex = Misc.getRandom(keys.length - 1);
    const combatType = CombatType[keys[randomIndex]];
    ChaosElementalCombatMethod.combatType = combatType;
  }

  handleAfterHitEffects(hit) {
    if (!hit || !hit.getTarget()) {
      return;
    }
    const target = hit.getTarget();
    switch (ChaosElementalCombatMethod.combatType) {
      case CombatType.MELEE:
        target.performGraphic(ChaosElementalCombatMethod.MELEE_COMBAT_GFX);
        break;
      case CombatType.RANGED:
        target.performGraphic(ChaosElementalCombatMethod.RANGED_COMBAT_GFX);
        break;
      case CombatType.MAGIC:
        target.performGraphic(ChaosElementalCombatMethod.MAGIC_COMBAT_GFX);
        break;
      default:
        break;
    }

    if (!target.isPlayer()) {
      return;
    }
    const player = target.getAsPlayer();
    if (Misc.getRandom(100) <= 20) {
      if (ChaosElementalCombatMethod.currentAttack === ChaosElementalAttackType.DISARM) {
        disarmChaosElemental(player);
      } else if (
        ChaosElementalCombatMethod.currentAttack === ChaosElementalAttackType.TELEPORT
      ) {
        const offsetX = Misc.getRandom(4);
        const offsetY = Misc.getRandom(4);
        player.moveTo(player.getLocation().add(offsetX, offsetY));
        player.getPacketSender().sendMessage("The Chaos elemental has teleported you.");
      }
    }
  }
}

function disarmChaosElemental(player) {
  if (!player.getInventory().isFull()) {
    const randomSlot = Misc.getRandom(player.getEquipment().capacity() - 1);
    const toDisarm = player.getEquipment().getItems()[randomSlot];
    if (toDisarm.isValid()) {
      player.getEquipment().set(randomSlot, new Item(-1, 0));
      player.getInventory().addItem(toDisarm.clone());
      player.getPacketSender().sendMessage("You have been disarmed!");
      WeaponInterfaces.assign(player);
      BonusManager.update(player);
      player.getUpdateFlag().flag(Flag.APPEARANCE);
    }
  }
}

module.exports = {
  name: "ChaosElemental",
  register(api) {
    api.registerNpcCombatMethodProvider(
      [
        NpcIdentifiers.CHAOS_ELEMENTAL,
        NpcIdentifiers.CHAOS_ELEMENTAL_JR_,
        NpcIdentifiers.CHAOS_ELEMENTAL_JR_2,
        NpcIdentifiers.CHAOS_ELEMENTAL_2,
      ],
      ChaosElementalCombatMethod,
      { singleton: false }
    );
  },
};
