/**
 * Covers the LostCity combat-parity fixes:
 *  - NPC defence bonuses are read from stats[10..14] instead of hard-coded 0
 *  - hit XP ratios (magic 1/2, hitpoints 1/3, defensive-cast defence 1/4)
 *  - damage is capped to the target's HP at roll time (tick eating)
 *  - HitQueue drains once per cycle, at the top of the owner's turn
 */
import * as assert from "node:assert/strict";
// Import order matters: the combat graph is circular, and pulling the formula
// module first initialises PrayerHandler before QuickPrayers is ready.
import { World } from "../src/main/typescript/elvarg/game/World";
import { Combat } from "../src/main/typescript/elvarg/game/content/combat/Combat";
import { CombatFactory } from "../src/main/typescript/elvarg/game/content/combat/CombatFactory";
import { AccuracyFormulasDpsCalc } from "../src/main/typescript/elvarg/game/content/combat/formula/AccuracyFormulasDpsCalc";
import { CombatType } from "../src/main/typescript/elvarg/game/content/combat/CombatType";
import { HitDamage } from "../src/main/typescript/elvarg/game/content/combat/hit/HitDamage";
import { HitMask } from "../src/main/typescript/elvarg/game/content/combat/hit/HitMask";
import { HitQueue } from "../src/main/typescript/elvarg/game/content/combat/hit/HitQueue";
import { PendingHit } from "../src/main/typescript/elvarg/game/content/combat/hit/PendingHit";
import { BonusManager } from "../src/main/typescript/elvarg/game/model/equipment/BonusManager";
import { Skill } from "../src/main/typescript/elvarg/game/model/Skill";

void World;
void Combat;

const originalGetHitDamage = CombatFactory.getHitDamage;
const originalApplyExtraHitRolls = CombatFactory.applyExtraHitRolls;
const originalRollAccuracy = AccuracyFormulasDpsCalc.rollAccuracy;
const originalExecuteHit = CombatFactory.executeHit;

try {
    // --- NPC defence bonuses are actually read -------------------------------
    // stats[2] is the defence level, stats[10..14] the per-style defence bonuses
    // in BonusManager.DEFENCE_* order. Both used to be ignored for NPCs.
    const armouredNpc = (): any => {
        const stats = new Array(18).fill(0);
        stats[2] = 1;    // defence level 1 -> effective 10
        stats[10] = 0;   // stab
        stats[12] = 100; // crush
        stats[14] = 40;  // ranged
        stats[13] = 20;  // magic
        const npc: any = {
            isNpc: () => true,
            isPlayer: () => false,
            getCurrentDefinition: () => ({ getStats: () => stats }),
        };
        npc.getAsNpc = () => npc;
        return npc;
    };

    const npc = armouredNpc();
    assert.equal(
        AccuracyFormulasDpsCalc.defenseMeleeRoll(npc, BonusManager.ATTACK_CRUSH),
        10 * (100 + 64),
        "an NPC's crush defence bonus must feed the defence roll"
    );
    assert.equal(
        AccuracyFormulasDpsCalc.defenseMeleeRoll(npc, BonusManager.ATTACK_STAB),
        10 * (0 + 64),
        "a zero bonus still yields the bare +64 roll"
    );
    assert.equal(
        AccuracyFormulasDpsCalc.defenseRangedRoll(armouredNpc()),
        10 * (40 + 64),
        "an NPC's ranged defence bonus must feed the ranged defence roll"
    );

    // --- hit XP ratios -------------------------------------------------------
    // One melee style is the unit (4 xp/damage in OSRS). Magic pays half that,
    // hitpoints a third, and a defensive cast splits 1.33 magic / 1.0 defence.
    const awarded: Array<[string, number]> = [];
    const xpPlayer: any = {
        getSkillManager: () => ({
            addExperience: (skill: any, xp: number) => awarded.push([skill.getName(), xp]),
        }),
        getCombat: () => ({ getPreviousCast: () => ({}) }),
    };
    const xpHit = (type: CombatType, damage: number, skills: number[]): any => ({
        getTotalDamage: () => damage,
        getSkills: () => skills,
        getCombatType: () => type,
        isAccurate: () => true,
    });
    const xpFor = (skill: string) =>
        awarded.filter(([name]) => name === skill).reduce((total, [, xp]) => total + xp, 0);

    awarded.length = 0;
    CombatFactory.rewardExp(xpPlayer, xpHit(CombatType.MELEE, 12, [Skill.ATTACK.getIndex()]));
    assert.equal(xpFor("Attack"), 12, "a single melee style takes the full unit");
    assert.equal(xpFor("Hitpoints"), 4, "hitpoints is a third of the style xp, not 0.7x");

    awarded.length = 0;
    CombatFactory.rewardExp(xpPlayer, xpHit(CombatType.MAGIC, 12, [Skill.MAGIC.getIndex()]));
    assert.equal(xpFor("Magic"), 6, "a standard cast pays half the melee unit");
    assert.equal(xpFor("Hitpoints"), 4, "hitpoints is unaffected by combat style");

    awarded.length = 0;
    CombatFactory.rewardExp(
        xpPlayer,
        xpHit(CombatType.MAGIC, 12, [Skill.MAGIC.getIndex(), Skill.DEFENCE.getIndex()])
    );
    assert.equal(xpFor("Magic"), 4, "a defensive cast pays 1.33/damage to magic");
    assert.equal(xpFor("Defence"), 3, "...and 1.0/damage to defence, not an even split");

    // --- damage is capped to the target's HP at roll time --------------------
    (AccuracyFormulasDpsCalc as any).rollAccuracy = () => true;
    (CombatFactory as any).getHitDamage = () => new HitDamage(999, HitMask.RED);
    (CombatFactory as any).applyExtraHitRolls = () => undefined;

    const meleeMethod: any = { type: () => CombatType.MELEE };
    const attacker: any = { isNpc: () => false, isPlayer: () => true };
    const lowHpTarget: any = { getHitpoints: () => 7 };

    const single = new PendingHit(attacker, lowHpTarget, meleeMethod);
    assert.equal(single.getTotalDamage(), 7, "an overkill roll is capped to the target's HP");

    const multi = new PendingHit(attacker, lowHpTarget, meleeMethod, { hitAmount: 2 });
    assert.equal(multi.getTotalDamage(), 7, "a multi-hit shares one HP budget, it does not double it");
    assert.deepEqual(
        multi.getHits().map((h) => h.getDamage()),
        [7, 0],
        "the budget is consumed in order"
    );

    // --- HitQueue drains once per cycle --------------------------------------
    let executed = 0;
    (CombatFactory as any).executeHit = () => { executed++; };

    const owner: any = {
        isRegistered: () => true,
        getHitpoints: () => 10,
        isUntargetable: () => false,
        // Pretend both hitsplats are already used so pendingDamage is left alone.
        getUpdateFlag: () => ({ flagged: () => true, flag: () => undefined }),
    };
    const queue = new HitQueue(owner);
    const queuedHit: any = {
        getTarget: () => owner,
        getAttacker: () => ({ isRegistered: () => true, getHitpoints: () => 10 }),
        getTotalDamage: () => 3,
        getHits: () => [],
    };
    queue.addPendingHit(queuedHit, 100);

    queue.process(99);
    assert.equal(executed, 0, "a hit does not land before its reveal cycle");
    queue.process(100);
    assert.equal(executed, 1, "the hit lands on its reveal cycle");
    queue.process(100);
    HitQueue.processAll(100);
    assert.equal(executed, 1, "the end-of-tick sweep must not re-apply what the turn already drained");

    console.log("combat parity smoke passed");
} finally {
    (CombatFactory as any).getHitDamage = originalGetHitDamage;
    (CombatFactory as any).applyExtraHitRolls = originalApplyExtraHitRolls;
    (AccuracyFormulasDpsCalc as any).rollAccuracy = originalRollAccuracy;
    (CombatFactory as any).executeHit = originalExecuteHit;
}
