import { HitDamageCache } from "../../content/combat/hit/HitDamageCache";
import { HitQueue } from "../../content/combat/hit/HitQueue";
import type { Mobile } from "../../entity/impl/Mobile";
import type { Player } from "../../entity/impl/player/Player";
import { CoordinateState } from "../../entity/impl/npc/NPCMovementCoordinator";
import { SecondsTimer } from "../../model/SecondsTimer";
import { StatementDialogue } from "../../model/dialogues/entries/impl/StatementDialogue";
import { Stopwatch } from "../../../util/Stopwatch";
import { ServerPerf } from "../../../util/ServerPerf";
import { World } from "../../World";
import { CombatConstants } from "./CombatConstants";
import { CombatFactory, CanAttackResponse } from "./CombatFactory";
import { CombatRange } from "./CombatRange";
import { CombatSpecial } from "./CombatSpecial";
import type { CombatSpell } from "./magic/CombatSpell";
import type { CombatMethod } from "./method/CombatMethod";
import { GraniteMaulCombatMethod } from "./method/impl/specials/GraniteMaulCombatMethod";
import { Ammunition, RangedData, RangedWeapon } from "./ranged/RangedData";

type RouteState = {
    target: Mobile;
    x: number;
    y: number;
    z: number;
    range: number;
    method: CombatMethod;
};

/** Owns one character's target, attack deadline, approach route, and delayed hits. */
export class Combat {
    private readonly hitQueue = new HitQueue(this.character);
    private readonly damageMap = new Map<Player, HitDamageCache>();
    private readonly lastAttack = new Stopwatch();
    private readonly poisonImmunityTimer = new SecondsTimer();
    private readonly fireImmunityTimer = new SecondsTimer();
    private readonly teleblockTimer = new SecondsTimer();
    private readonly prayerBlockTimer = new SecondsTimer();
    private nextAttackCycle = 0;
    private route: RouteState | null = null;
    private target: Mobile | null = null;
    private attacker: Mobile | null = null;
    private graniteMaulSpecialQueued = false;
    private method: CombatMethod | null = null;
    private castSpell: CombatSpell | null = null;
    private autoCastSpell: CombatSpell | null = null;
    private previousCast: CombatSpell | null = null;
    public rangedWeapon: RangedWeapon | null = null;
    public ammunition: Ammunition | null = null;

    constructor(private readonly character: Mobile) {}

    public attack(target: Mobile): void {
        this.setTarget(target);
        if (this.character.isNpc() && !this.character.getAsNpc().getDefinition().doesFightBack()) return;
        this.character.setMobileInteraction(target);
        this.performNewAttack(false);
    }

    public castSpellOn(target: Mobile, spell: CombatSpell): void {
        if (!target || !spell) return;
        this.character.setMobileInteraction(target);
        this.character.setPositionToFace(target.getLocation());
        this.setCastSpell(spell);
        this.attack(target);
    }

    public process(): void {
        if (!this.target && !this.attacker) return;

        if (this.lastAttack.elapsedTime(6000)) {
            this.setUnderAttack(null);
            if (!this.target) return;
        }
        this.performNewAttack(false);
    }

    public hasPendingWork(): boolean {
        return this.target != null || this.attacker != null || this.hitQueue.hasPendingWork();
    }

    public performNewAttack(instant: boolean): boolean {
        const target = this.target;
        if (!target || (this.character.isNpc() && !this.character.getAsNpc().getDefinition().doesFightBack())) {
            return false;
        }

        this.character.setMobileInteraction(target);
        const targetLocation = target.getLocation();
        this.character.setPositionToFaceCoordinates(targetLocation.getX(), targetLocation.getY(), targetLocation.getZ());

        const method = this.resolveMethodForCurrentCycle();
        this.method = method;
        const bypassDelay = instant || method instanceof GraniteMaulCombatMethod;
        const cycle = World.getProcessCycle();
        if (!bypassDelay && cycle < this.nextAttackCycle) return false;

        if (!CombatFactory.validTarget(this.character, target)) {
            this.reset();
            return false;
        }

        if (this.character.isNpc()) {
            const npc = this.character.getAsNpc();
            if (
                npc.getCurrentDefinition().doesRetreat() &&
                (npc.getMovementCoordinator().getCoordinateState() === CoordinateState.RETREATING ||
                    npc.getLocation().getDistance(npc.getSpawnPosition()) >= npc.getCurrentDefinition().getCombatFollowDistance())
            ) {
                npc.getMovementCoordinator().setCoordinateState(CoordinateState.RETREATING);
                this.reset();
                return false;
            }
        }

        if (!CombatRange.canReach(this.character, method, target)) {
            this.routeToward(method, target);
            return false;
        }

        this.character.getMovementQueue().reset();
        this.route = null;
        if (this.target !== target) return false;

        switch (CombatFactory.canAttack(this.character, method, target, true)) {
            case CanAttackResponse.CAN_ATTACK: {
                if (this.attacker == null) method.onCombatBegan(this.character, target);
                if (target.getCombat().getAttacker() == null) {
                    CombatFactory.getMethod(target).onCombatBegan(target, this.character);
                }
                // A combat method may extend this in start() for a special attack.
                if (!bypassDelay) this.nextAttackCycle = cycle + Math.max(1, method.attackSpeed(this.character) | 0);
                method.start(this.character, target);
                const hits = method.hits(this.character, target);
                if (hits == null) return false;
                for (const hit of hits) CombatFactory.addPendingHit(hit);
                method.finished(this.character, target);

                this.graniteMaulSpecialQueued = false;
                if (this.character.isSpecialActivated()) {
                    this.character.setSpecialActivated(false);
                    if (this.character.isPlayer()) CombatSpecial.updateBar(this.character.getAsPlayer());
                }
                return true;
            }
            case CanAttackResponse.ALREADY_UNDER_ATTACK:
                if (this.character.isPlayer()) this.character.getAsPlayer().getPacketSender().sendMessage("You are already under attack!");
                this.reset();
                return false;
            case CanAttackResponse.CANT_ATTACK_IN_AREA:
            case CanAttackResponse.INVALID_TARGET:
                this.reset();
                return false;
            case CanAttackResponse.COMBAT_METHOD_NOT_ALLOWED:
                return false;
            case CanAttackResponse.LEVEL_DIFFERENCE_TOO_GREAT:
                this.character.getAsPlayer().getPacketSender().sendMessage("Your level difference is too great.");
                this.character.getAsPlayer().getPacketSender().sendMessage("You need to move deeper into the Wilderness.");
                this.reset();
                return false;
            case CanAttackResponse.NOT_ENOUGH_SPECIAL_ENERGY: {
                const player = this.character.getAsPlayer();
                player.getPacketSender().sendMessage("You do not have enough special attack energy left!");
                player.setSpecialActivated(false);
                CombatSpecial.updateBar(player);
                this.reset();
                return false;
            }
            case CanAttackResponse.STUNNED:
                this.character.getAsPlayer().getPacketSender().sendMessage("You're currently stunned and cannot attack.");
                this.reset();
                return false;
            case CanAttackResponse.DUEL_NOT_STARTED_YET:
                this.character.getAsPlayer().getPacketSender().sendMessage("The duel has not started yet!");
                this.reset();
                return false;
            case CanAttackResponse.DUEL_WRONG_OPPONENT:
                this.character.getAsPlayer().getPacketSender().sendMessage("This is not your opponent!");
                this.reset();
                return false;
            case CanAttackResponse.DUEL_MELEE_DISABLED:
                StatementDialogue.send(this.character.getAsPlayer(), "Melee has been disabled in this duel!");
                this.reset();
                return false;
            case CanAttackResponse.DUEL_RANGED_DISABLED:
                StatementDialogue.send(this.character.getAsPlayer(), "Ranged has been disabled in this duel!");
                this.reset();
                return false;
            case CanAttackResponse.DUEL_MAGIC_DISABLED:
                StatementDialogue.send(this.character.getAsPlayer(), "Magic has been disabled in this duel!");
                this.reset();
                return false;
            case CanAttackResponse.TARGET_IS_IMMUNE:
                if (this.character.isPlayer()) this.character.getAsPlayer().getPacketSender().sendMessage("This npc is currently immune to attacks.");
                this.reset();
                return false;
        }
    }

    public resolveMethodForCurrentCycle(): CombatMethod {
        return CombatFactory.getMethod(this.character);
    }

    public resolveValidTargetForCurrentCycle(target: Mobile): boolean {
        return CombatFactory.validTarget(this.character, target);
    }

    public resolveCanReachForCurrentCycle(method: CombatMethod, target: Mobile, _skipTargetValidation = false): boolean {
        return CombatRange.canReach(this.character, method, target);
    }

    public setAttackDelay(ticks: number): void {
        this.nextAttackCycle = World.getProcessCycle() + Math.max(0, ticks | 0);
    }

    public extendAttackDelay(ticks: number): void {
        this.nextAttackCycle = Math.max(this.nextAttackCycle, World.getProcessCycle() + Math.max(0, ticks | 0));
    }

    public getAttackDelay(): number {
        return Math.max(0, this.nextAttackCycle - World.getProcessCycle());
    }

    public willAttackBeReadyIn(ticks: number): boolean {
        return this.getAttackDelay() <= Math.max(0, ticks | 0);
    }

    public reset(): void {
        const previousTarget = this.target;
        this.target = null;
        if (previousTarget && this.method) this.method.onCombatEnded(this.character, previousTarget);
        this.character.getMovementQueue().reset();
        this.character.setMobileInteraction(null);
        this.route = null;
        this.graniteMaulSpecialQueued = false;
    }

    public isGraniteMaulSpecialQueued(): boolean { return this.graniteMaulSpecialQueued; }
    public setGraniteMaulSpecialQueued(queued: boolean): void { this.graniteMaulSpecialQueued = queued; }

    public addDamage(entity: Mobile, amount: number): void {
        if (amount <= 0 || entity.isNpc()) return;
        const player = entity as Player;
        const cached = this.damageMap.get(player);
        if (cached) cached.incrementDamage(amount);
        else this.damageMap.set(player, new HitDamageCache(amount));
    }

    public getKiller(clearMap: boolean): Player | null {
        let damage = 0;
        let killer: Player | null = null;
        for (const [player, cached] of this.damageMap) {
            if (!player.isRegistered() || cached.getStopwatch() > CombatConstants.DAMAGE_CACHE_TIMEOUT) continue;
            if (cached.getDamage() > damage) {
                damage = cached.getDamage();
                killer = player;
            }
        }
        if (clearMap) this.damageMap.clear();
        return killer;
    }

    public damageMapContains(player: Player): boolean {
        const cached = this.damageMap.get(player);
        return cached != null && cached.getStopwatch() < CombatConstants.DAMAGE_CACHE_TIMEOUT;
    }

    public getRecentDamagers(): Player[] {
        return [...this.damageMap].flatMap(([player, cached]) =>
            player.isRegistered() && cached.getDamage() > 0 && cached.getStopwatch() < CombatConstants.DAMAGE_CACHE_TIMEOUT
                ? [player] : []
        );
    }

    public getRecentDamagerEntries(): Array<{ player: Player; damage: number }> {
        return [...this.damageMap].flatMap(([player, cached]) =>
            player.isRegistered() && cached.getDamage() > 0 && cached.getStopwatch() < CombatConstants.DAMAGE_CACHE_TIMEOUT
                ? [{ player, damage: cached.getDamage() }] : []
        );
    }

    public getCharacter(): Mobile { return this.character; }
    public getTarget(): Mobile | null { return this.target; }
    public setTarget(target: Mobile | null): void { this.target = target; this.route = null; }
    public getHitQueue(): HitQueue { return this.hitQueue; }
    public getAttacker(): Mobile | null { return this.attacker; }
    public setUnderAttack(attacker: Mobile | null): void { this.attacker = attacker; this.lastAttack.reset(); }
    public getCastSpell(): CombatSpell | null { return this.castSpell; }
    public setCastSpell(spell: CombatSpell | null): void { this.castSpell = spell; }
    public getAutocastSpell(): CombatSpell | null { return this.autoCastSpell; }
    public setAutocastSpell(spell: CombatSpell | null): void { this.autoCastSpell = spell; }
    public getSelectedSpell(): CombatSpell | null { return this.castSpell ?? this.autoCastSpell; }
    public getPreviousCast(): CombatSpell | null { return this.previousCast; }
    public setPreviousCast(spell: CombatSpell | null): void { this.previousCast = spell; }
    public getRangedWeapon(): RangedWeapon | null { return this.rangedWeapon; }
    public setRangedWeapon(weapon: RangedWeapon | null): void { this.rangedWeapon = weapon; }
    public getAmmunition(): Ammunition | null { return this.ammunition; }
    public setAmmunition(ammunition: Ammunition | null): void { this.ammunition = ammunition; }
    public getRangeAmmoData(): RangedData { return this.ammunition as unknown as RangedData; }
    public setRangeAmmoData(data: RangedData): void { this.ammunition = data as unknown as Ammunition; }
    public getPoisonImmunityTimer(): SecondsTimer { return this.poisonImmunityTimer; }
    public getFireImmunityTimer(): SecondsTimer { return this.fireImmunityTimer; }
    public getTeleblockTimer(): SecondsTimer { return this.teleblockTimer; }
    public getPrayerBlockTimer(): SecondsTimer { return this.prayerBlockTimer; }
    public getLastAttack(): Stopwatch { return this.lastAttack; }

    private routeToward(method: CombatMethod, target: Mobile): void {
        const location = target.getLocation();
        const range = Math.max(1, method.attackDistance(this.character) | 0);
        if (
            this.route?.target === target &&
            this.route.x === location.getX() && this.route.y === location.getY() && this.route.z === location.getZ() &&
            this.route.range === range && this.route.method === method &&
            this.character.getMovementQueue().hasPendingWork()
        ) return;

        if (ServerPerf.measurePhase("combat.route", () => CombatRange.route(this.character, method, target))) {
            this.route = { target, x: location.getX(), y: location.getY(), z: location.getZ(), range, method };
        } else {
            this.route = null;
        }
    }
}
