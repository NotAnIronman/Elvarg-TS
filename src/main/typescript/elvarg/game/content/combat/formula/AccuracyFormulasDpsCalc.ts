import { PrayerHandler } from "../../../content/PrayerHandler";
import { CombatFactory } from "../CombatFactory";
import { CombatType } from "../CombatType";
import { FightStyle } from '../FightStyle';
import { Misc } from "../../../../util/Misc";
import { Mobile } from "../../../entity/impl/Mobile";
import { BonusManager } from "../../../model/equipment/BonusManager";
import { Skill } from "../../../model/Skill";
import { applyMeleeAttackAccuracyModifiers, applyRangedAttackAccuracyModifiers, applyMagicAttackAccuracyModifiers, applyMeleeDefenseModifiers, applyRangedDefenseModifiers, applyMagicDefenseModifiers } from "../EquipmentEffects";
import type { Player } from '../../../entity/impl/player/Player';
import { World } from "../../../World";

type RollCacheEntry = {
    cycle: number;
    effectiveAttackLevel?: number;
    effectiveDefenseLevel?: number;
    effectiveRangedAttack?: number;
    effectiveMagicLevel?: number;
    attackMeleeRoll?: number;
    attackRangedRoll?: number;
    attackMagicRoll?: number;
    defenseRangedRoll?: number;
    defenseMagicRoll?: number;
    defenseMeleeRolls?: Map<number, number>;
};

const getPlayerCombatSpecial = (player: Player): any | null => {
    const accessor = (player as any)?.getCombatSpecial;
    if (typeof accessor === "function") {
        const resolved = accessor.call(player);
        if (resolved) {
            return resolved;
        }
    }
    return (player as any)?.combatSpecial ?? null;
};

export class AccuracyFormulasDpsCalc {
    private static readonly rollCache = new WeakMap<Mobile, RollCacheEntry>();

    private static getRollCache(entity: Mobile): RollCacheEntry {
        const cycle = World.getProcessCycle();
        const cached = this.rollCache.get(entity);
        if (cached && cached.cycle === cycle) {
            return cached;
        }
        const next: RollCacheEntry = { cycle, defenseMeleeRolls: new Map<number, number>() };
        this.rollCache.set(entity, next);
        return next;
    }

    static randomFloat() {
        return Math.random();
    }

    public static rollAccuracy(entity: any, enemy: any, style: any) {
        if (style === CombatType.MELEE && CombatFactory.fullVeracs(entity) && Misc.getRandom(4) === 1) {
            return true;
        }

        if (style === CombatType.MELEE) {
            let attRoll = AccuracyFormulasDpsCalc.attackMeleeRoll(entity);
            let defRoll = AccuracyFormulasDpsCalc.defenseMeleeRoll(entity, enemy);

            let hitChance = this.hitChance(attRoll, defRoll);
            return hitChance > this.randomFloat();

        } else if (style === CombatType.RANGED) {
            let attRoll = AccuracyFormulasDpsCalc.attackRangedRoll(entity);
            let defRoll = AccuracyFormulasDpsCalc.defenseRangedRoll(enemy);

            let hitChance = this.hitChance(attRoll, defRoll);
            return hitChance > this.randomFloat();
        } else if (style === CombatType.MAGIC) {
            let attRoll = AccuracyFormulasDpsCalc.attackMagicRoll(entity);
            let defRoll = AccuracyFormulasDpsCalc.defenseMagicRoll(enemy);

            let hitChance = this.hitChance(attRoll, defRoll);
            return hitChance > this.randomFloat();
        }
        return false;
    }

    public static hitChance(attRoll: number, defRoll: number) {

        if (attRoll > defRoll) {
            return 1 - ((defRoll + 2) / (2 * attRoll + 1));
        } else {
            return attRoll / (2 * defRoll + 1);
        }
    }

    public static effectiveAttackLevel(entity: Mobile) {
        const cache = this.getRollCache(entity);
        if (cache.effectiveAttackLevel != null) {
            return cache.effectiveAttackLevel;
        }
        let att = 8;

        if (entity.isNpc()) {
            att += entity.getAsNpc().getCurrentDefinition().getStats()[0];
            cache.effectiveAttackLevel = att;
            return att;
        }

        let player = entity.getAsPlayer();

        att += player.getSkillManager().getCurrentLevel(Skill.ATTACK);

        let prayerBonus = 1;

        // Prayer additions
        if (PrayerHandler.isActivated(player, PrayerHandler.CLARITY_OF_THOUGHT)) {
            prayerBonus = 1.05;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.IMPROVED_REFLEXES)) {
            prayerBonus = 1.10;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.INCREDIBLE_REFLEXES)) {
            prayerBonus = 1.15;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.CHIVALRY)) {
            prayerBonus = 1.15;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.PIETY)) {
            prayerBonus = 1.20;
        }

        att *= prayerBonus;

        let fightStyle = player.getFightType().getStyle();
        if (fightStyle == FightStyle.ACCURATE)
            att += 3;
        else if (fightStyle == FightStyle.CONTROLLED)
            att += 1;

        att = applyMeleeAttackAccuracyModifiers(player, att);

        // Special attack
        const special = getPlayerCombatSpecial(player);
        if (player.isSpecialActivated() && special != null) {
            att *= special.getAccuracyMultiplier();
        }

        cache.effectiveAttackLevel = att;
        return att;
    }

    public static attackMeleeRoll(entity: Mobile) {
        const cache = this.getRollCache(entity);
        if (cache.attackMeleeRoll != null) {
            return cache.attackMeleeRoll;
        }
        let attRoll = AccuracyFormulasDpsCalc.effectiveAttackLevel(entity);

        if (entity.isNpc()) {
            // NPC's don't currently have stab/slash/crush bonuses
            attRoll *= 64;
            cache.attackMeleeRoll = Math.floor(attRoll);
            return cache.attackMeleeRoll;
        }

        let player = entity.getAsPlayer();

        let attStab = player.getBonusManager().getAttackBonus()[BonusManager.ATTACK_STAB];
        let attSlash = player.getBonusManager().getAttackBonus()[BonusManager.ATTACK_SLASH];
        let attCrush = player.getBonusManager().getAttackBonus()[BonusManager.ATTACK_CRUSH];

        switch (player.getFightType().getBonusType()) {
            case BonusManager.ATTACK_STAB:
                attRoll *= attStab + 64;
                break;
            case BonusManager.ATTACK_SLASH:
                attRoll *= attSlash + 64;
                break;
            case BonusManager.ATTACK_CRUSH:
                attRoll *= attCrush + 64;
                break;
            default:
                let maxAtt = Math.max(attStab, Math.max(attCrush, attSlash));
                attRoll *= maxAtt + 64;
        }

        cache.attackMeleeRoll = Math.floor(attRoll);
        return cache.attackMeleeRoll;
    }

    public static effectiveDefenseLevel(enemy: Mobile) {
        const cache = this.getRollCache(enemy);
        if (cache.effectiveDefenseLevel != null) {
            return cache.effectiveDefenseLevel;
        }
        let def = 1;

        if (enemy.isNpc()) {
            cache.effectiveDefenseLevel = enemy.getAsNpc().getCurrentDefinition().getStats()[2];
            return cache.effectiveDefenseLevel;
        }

        let player = enemy.getAsPlayer();
        def = player.getSkillManager().getCurrentLevel(Skill.DEFENCE);


        let prayerBonus = 1;

        // Prayer additions
        if (PrayerHandler.isActivated(enemy, PrayerHandler.THICK_SKIN)) {
            prayerBonus = 1.05;
        } else if (PrayerHandler.isActivated(enemy, PrayerHandler.ROCK_SKIN)) {
            prayerBonus = 1.10;
        } else if (PrayerHandler.isActivated(enemy, PrayerHandler.STEEL_SKIN)) {
            prayerBonus = 1.15;
        } else if (PrayerHandler.isActivated(enemy, PrayerHandler.CHIVALRY)) {
            prayerBonus = 1.20;
        } else if (PrayerHandler.isActivated(enemy, PrayerHandler.PIETY)) {
            prayerBonus = 1.25;
        } else if (PrayerHandler.isActivated(enemy, PrayerHandler.RIGOUR)) {
            prayerBonus = 1.25;
        } else if (PrayerHandler.isActivated(enemy, PrayerHandler.AUGURY)) {
            prayerBonus = 1.25;
        }

        def *= prayerBonus;

        let fightStyle = player.getFightType().getStyle();
        if (fightStyle == FightStyle.DEFENSIVE)
            def += 3;
        else if (fightStyle == FightStyle.CONTROLLED)
            def += 1;
        def += 8;

        def = applyMeleeDefenseModifiers(player, def);

        cache.effectiveDefenseLevel = def;
        return def;
    }

    private static calcDefenseMeleeRoll(entity: Mobile, enemy: Mobile) {
        let bonusType = (entity.isNpc() ? 3 /* Default case */ : entity.getAsPlayer().getFightType().getBonusType());

        return AccuracyFormulasDpsCalc.defenseMeleeRoll(enemy, bonusType);
    }

    public static defenseMeleeRoll(enemy: Mobile, bonusType: number) {
        const cache = this.getRollCache(enemy);
        const cachedRoll = cache.defenseMeleeRolls?.get(bonusType);
        if (cachedRoll != null) {
            return cachedRoll;
        }
        let defLevel = AccuracyFormulasDpsCalc.effectiveDefenseLevel(enemy);

        let enemyPlayer = enemy.getAsPlayer();

        // NPCs don't have defence bonuses currently
        let defStab = (enemy.isNpc() ? 0 : enemyPlayer.getBonusManager().getDefenceBonus()[BonusManager.DEFENCE_STAB]);
        let defSlash = (enemy.isNpc() ? 0 : enemyPlayer.getBonusManager().getDefenceBonus()[BonusManager.DEFENCE_SLASH]);
        let defCrush = (enemy.isNpc() ? 0 : enemyPlayer.getBonusManager().getDefenceBonus()[BonusManager.DEFENCE_CRUSH]);

        switch (bonusType) {
            case BonusManager.ATTACK_STAB:
                defLevel *= defStab + 64;
                break;
            case BonusManager.ATTACK_SLASH:
                defLevel *= defSlash + 64;
                break;
            case BonusManager.ATTACK_CRUSH:
                defLevel *= defCrush + 64;
                break;
            default:
                let maxDef = Math.max(defStab, Math.max(defCrush, defSlash));
                defLevel *= maxDef + 64;
        }

        const resolved = Math.floor(defLevel);
        cache.defenseMeleeRolls?.set(bonusType, resolved);
        return resolved;
    }

    // Ranged
    public static defenseRangedRoll(enemy: Mobile) {
        const cache = this.getRollCache(enemy);
        if (cache.defenseRangedRoll != null) {
            return cache.defenseRangedRoll;
        }
        let defLevel = AccuracyFormulasDpsCalc.effectiveDefenseLevel(enemy);

        const defRange = (enemy.isPlayer() ?
            enemy.getAsPlayer().getBonusManager().getDefenceBonus()[BonusManager.DEFENCE_RANGE]
            : 0);

        defLevel *= defRange + 64;

        cache.defenseRangedRoll = defLevel;
        return defLevel;
    }

    private static effectiveRangedAttack(entity: Mobile) {
        const cache = this.getRollCache(entity);
        if (cache.effectiveRangedAttack != null) {
            return cache.effectiveRangedAttack;
        }
        let rngStrength = 8;

        if (entity.isNpc()) {
            // Prayer bonuses don't apply to NPCs (yet)
            cache.effectiveRangedAttack = rngStrength + entity.getAsNpc().getCurrentDefinition().getStats()[3];
            return cache.effectiveRangedAttack;
        }

        let player = entity.getAsPlayer();
        rngStrength += player.getSkillManager().getCurrentLevel(Skill.RANGED);

        // Prayers
        let prayerMod = 1.0;
        if (PrayerHandler.isActivated(player, PrayerHandler.SHARP_EYE)) {
            prayerMod = 1.05;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.HAWK_EYE)) {
            prayerMod = 1.10;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.EAGLE_EYE)) {
            prayerMod = 1.15;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.RIGOUR)) {
            prayerMod = 1.23;
        }
        rngStrength = (rngStrength * prayerMod);

        let fightStyle = player.getFightType().getStyle();
        if (fightStyle == FightStyle.ACCURATE)
            rngStrength += 3;

        rngStrength = applyRangedAttackAccuracyModifiers(player, rngStrength);

        //    if (dragonHunter(input))
        //        rngStrength =
        cache.effectiveRangedAttack = rngStrength;
        return rngStrength;
    }

    public static attackRangedRoll(entity: Mobile) {
        const cache = this.getRollCache(entity);
        if (cache.attackRangedRoll != null) {
            return cache.attackRangedRoll;
        }
        let accuracyBonus = (entity.isNpc() ? 0 : entity.getAsPlayer().getBonusManager().getAttackBonus()[BonusManager.ATTACK_RANGE]);

        let attRoll = AccuracyFormulasDpsCalc.effectiveRangedAttack(entity);

        attRoll *= (accuracyBonus + 64);

        cache.attackRangedRoll = Math.floor(attRoll);
        return cache.attackRangedRoll;
    }

    private static effectiveMagicLevel(entity: Mobile) {
        const cache = this.getRollCache(entity);
        if (cache.effectiveMagicLevel != null) {
            return cache.effectiveMagicLevel;
        }
        let mag = 8;

        if (entity.isNpc()) {
            // Prayer bonuses don't apply to NPCs (yet)
            mag += entity.getAsNpc().getCurrentDefinition().getStats()[4];
            cache.effectiveMagicLevel = mag;
            return mag;
        }

        let player = entity.getAsPlayer();
        mag += player.getSkillManager().getCurrentLevel(Skill.MAGIC);

        let prayerBonus = 1;

        // Prayer additions
        if (PrayerHandler.isActivated(player, PrayerHandler.MYSTIC_WILL)) {
            prayerBonus = 1.05;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.MYSTIC_LORE)) {
            prayerBonus = 1.10;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.MYSTIC_MIGHT)) {
            prayerBonus = 1.15;
        } else if (PrayerHandler.isActivated(player, PrayerHandler.AUGURY)) {
            prayerBonus = 1.25;
        }

        mag *= prayerBonus;

        let fightStyle = player.getFightType().getStyle();
        if (fightStyle == FightStyle.ACCURATE)
            mag += 3;
        else if (fightStyle == FightStyle.DEFENSIVE)
            mag += 1;

        mag = applyMagicAttackAccuracyModifiers(player, mag);

        cache.effectiveMagicLevel = mag;
        return mag;
    }

    public static defenseMagicRoll(enemy: Mobile): number {
        const cache = this.getRollCache(enemy);
        if (cache.defenseMagicRoll != null) {
            return cache.defenseMagicRoll;
        }
        let defLevel = AccuracyFormulasDpsCalc.effectiveMagicLevel(enemy);

        let defRange = (enemy.isNpc() ? 0 : enemy.getAsPlayer().getBonusManager().getDefenceBonus()[BonusManager.DEFENCE_MAGIC]);

        defLevel *= (defRange + 64);

        cache.defenseMagicRoll = defLevel;
        return defLevel;
    }

    public static attackMagicRoll(entity: Mobile): number {
        const cache = this.getRollCache(entity);
        if (cache.attackMagicRoll != null) {
            return cache.attackMagicRoll;
        }
        let accuracyBonus = (entity.isNpc() ? 0 : entity.getAsPlayer().getBonusManager().getAttackBonus()[BonusManager.ATTACK_MAGIC]);

        let attRoll = AccuracyFormulasDpsCalc.effectiveMagicLevel(entity);
        attRoll *= (accuracyBonus + 64);

        cache.attackMagicRoll = attRoll;
        return attRoll;
    }
}
