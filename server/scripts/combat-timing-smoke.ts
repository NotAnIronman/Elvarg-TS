import * as assert from "node:assert/strict";
import { FightType } from "../src/main/typescript/elvarg/game/content/combat/FightType";
import { WeaponProfiles } from "../src/main/typescript/elvarg/game/content/combat/WeaponProfile";
import { WeaponInterfaces } from "../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces";
import { World } from "../src/main/typescript/elvarg/game/World";
import { Combat } from "../src/main/typescript/elvarg/game/content/combat/Combat";
import {
    CanAttackResponse,
    CombatFactory,
} from "../src/main/typescript/elvarg/game/content/combat/CombatFactory";
import { CombatRange } from "../src/main/typescript/elvarg/game/content/combat/CombatRange";
import { CombatType } from "../src/main/typescript/elvarg/game/content/combat/CombatType";
import { CoordinateState } from "../src/main/typescript/elvarg/game/entity/impl/npc/NPCMovementCoordinator";
import { TaskManager } from "../src/main/typescript/elvarg/game/task/TaskManager";
import { NPCDeathTask } from "../src/main/typescript/elvarg/game/task/impl/NPCDeathTask";

void FightType;
void WeaponProfiles;
void WeaponInterfaces;

const originalCycle = World.getProcessCycle();
const originalRewardExp = CombatFactory.rewardExp;
const originalValidTarget = CombatFactory.validTarget;
const originalCanAttack = CombatFactory.canAttack;
const originalGetMethod = CombatFactory.getMethod;
const originalAddPendingHit = CombatFactory.addPendingHit;
const originalHandleRetaliation = (CombatFactory as any).handleRetaliation;
const originalCanReach = CombatRange.canReach;
const originalSubmit = TaskManager.submit;

try {
    (World as any).processCycle = 50;
    (CombatFactory as any).rewardExp = () => undefined;

    const revealCycles: number[] = [];
    const target: any = {
        getHitpoints: () => 10,
        isUntargetable: () => false,
        isNeedsPlacement: () => false,
        isPlayer: () => false,
        getCombat: () => ({
            getHitQueue: () => ({
                addPendingHit: (_hit: unknown, revealCycle: number) => revealCycles.push(revealCycle),
            }),
        }),
    };
    const player: any = {
        isPlayer: () => true,
        getAsPlayer: () => ({ getArea: () => null }),
    };
    const npc: any = { isPlayer: () => false };
    const hit = (attacker: any, type: CombatType, delay: number): any => ({
        getAttacker: () => attacker,
        getTarget: () => target,
        getCombatType: () => type,
        getDelay: () => delay,
    });

    CombatFactory.addPendingHit(hit(player, CombatType.MELEE, 0));
    CombatFactory.addPendingHit(hit(player, CombatType.MELEE, 1));
    CombatFactory.addPendingHit(hit(npc, CombatType.MELEE, 0));
    CombatFactory.addPendingHit(hit(player, CombatType.RANGED, 2));
    assert.deepEqual(revealCycles, [51, 52, 50, 52]);

    let launchBlocks = 0;
    const location = { getX: () => 3200, getY: () => 3200, getZ: () => 0 };
    const combatTarget: any = {
        getLocation: () => location,
        getCombat: () => ({ getAttacker: () => null }),
        getBlockAnim: () => 425,
        performAnimation: () => launchBlocks++,
    };
    const character: any = {
        isNpc: () => false,
        setMobileInteraction: () => character,
        setPositionToFaceCoordinates: () => character,
        getMovementQueue: () => ({ reset: () => undefined }),
        isSpecialActivated: () => false,
    };
    const method: any = {
        type: () => CombatType.MELEE,
        attackSpeed: () => 4,
        attackDistance: () => 1,
        onCombatBegan: () => undefined,
        start: () => undefined,
        hits: () => [{}, {}],
        finished: () => undefined,
    };
    const combat = new Combat(character);
    combat.setTarget(combatTarget);
    combat.resolveMethodForCurrentCycle = () => method;
    (CombatFactory as any).validTarget = () => true;
    (CombatFactory as any).canAttack = () => CanAttackResponse.CAN_ATTACK;
    (CombatFactory as any).getMethod = () => ({ onCombatBegan: () => undefined });
    (CombatFactory as any).addPendingHit = () => undefined;
    (CombatRange as any).canReach = () => true;
    assert.equal(combat.performNewAttack(false), true);
    assert.equal(launchBlocks, 1);

    (CombatFactory as any).handleRetaliation = () => undefined;
    const impactBlocks = (type: CombatType, hitpoints: number, damage: number): number => {
        let blocks = 0;
        const queue = { getQueuedDamage: () => 0, addPendingDamage: () => undefined };
        const combatState = {
            getHitQueue: () => queue,
            setUnderAttack: () => undefined,
            addDamage: () => undefined,
        };
        const attacker: any = {
            getHitpoints: () => 10,
            isPlayer: () => false,
            isNpc: () => true,
            getAsNpc: () => ({
                getCurrentDefinition: () => ({ isPoisonous: () => false }),
            }),
        };
        const resolvedHit: any = {
            getAttacker: () => attacker,
            getTarget: () => victim,
            getCombatMethod: () => null,
            getCombatType: () => type,
            getTotalDamage: () => damage,
            getHandleAfterHitEffects: () => false,
            getHits: () => [],
        };
        const victim: any = {
            getHitpoints: () => hitpoints,
            isUntargetable: () => false,
            isNeedsPlacement: () => false,
            manipulateHit: () => resolvedHit,
            getCombat: () => combatState,
            getBlockAnim: () => 425,
            performAnimation: () => blocks++,
            isPlayer: () => false,
            hasVengeanceReturn: () => false,
            isPlayerBot: () => false,
        };
        CombatFactory.executeHit(resolvedHit);
        return blocks;
    };
    assert.equal(impactBlocks(CombatType.RANGED, 10, 9), 1);
    assert.equal(impactBlocks(CombatType.RANGED, 10, 10), 0);
    assert.equal(impactBlocks(CombatType.MELEE, 10, 1), 0);

    (CombatFactory as any).handleRetaliation = originalHandleRetaliation;
    let retaliationDelay = -1;
    const attacker: any = { getHitpoints: () => 10, isRegistered: () => true };
    const retaliationCombat = {
        getTarget: () => null,
        extendAttackDelay: (ticks: number) => retaliationDelay = ticks,
        attack: () => undefined,
    };
    const retaliatingNpc: any = {
        getCombat: () => retaliationCombat,
        isPlayer: () => false,
        isNpc: () => true,
        getAsNpc: () => ({
            getMovementCoordinator: () => ({ getCoordinateState: () => CoordinateState.HOME }),
        }),
        getMovementQueue: () => ({ reset: () => undefined }),
    };
    (CombatFactory as any).getMethod = () => ({ attackSpeed: () => 4 });
    (TaskManager as any).submit = () => undefined;
    (CombatFactory as any).handleRetaliation(attacker, retaliatingNpc);
    assert.equal(retaliationDelay, 2);

    let deathAnimations = 0;
    let clearedAttacker = false;
    const movement = {
        setBlockMovement: () => movement,
        reset: () => movement,
    };
    const dyingNpc: any = {
        getMovementQueue: () => movement,
        getCombat: () => ({
            getKiller: () => null,
            reset: () => undefined,
            setUnderAttack: (value: unknown) => clearedAttacker = value === null,
        }),
        getCurrentDefinition: () => ({ getDeathAnim: () => 836, getDeathSound: () => -1 }),
        performAnimation: () => deathAnimations++,
        setMobileInteraction: () => undefined,
    };
    const deathTask = new NPCDeathTask(dyingNpc);
    deathTask.setRunning(true);
    assert.equal(deathTask.getRemainingTicks(), 1);
    assert.equal(deathTask.tick(), true);
    assert.equal(deathAnimations, 1);
    assert.equal(clearedAttacker, true);
    assert.equal(deathTask.getRemainingTicks(), 2);

    console.info("combat timing smoke passed");
} finally {
    (World as any).processCycle = originalCycle;
    (CombatFactory as any).rewardExp = originalRewardExp;
    (CombatFactory as any).validTarget = originalValidTarget;
    (CombatFactory as any).canAttack = originalCanAttack;
    (CombatFactory as any).getMethod = originalGetMethod;
    (CombatFactory as any).addPendingHit = originalAddPendingHit;
    (CombatFactory as any).handleRetaliation = originalHandleRetaliation;
    (CombatRange as any).canReach = originalCanReach;
    (TaskManager as any).submit = originalSubmit;
}
