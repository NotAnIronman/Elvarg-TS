import { Server } from "../../../Server"
import { HitDamageCache } from "../../content/combat/hit/HitDamageCache"
import { HitQueue } from "../../content/combat/hit/HitQueue"
import { PendingHit } from "./hit/PendingHit";
import { CombatSpell } from "./magic/CombatSpell";
import { CombatMethod } from "./method/CombatMethod";
import { GraniteMaulCombatMethod } from "./method/impl/specials/GraniteMaulCombatMethod";
import { RangedData, RangedWeapon, Ammunition } from "./ranged/RangedData";
import type { Mobile } from "../../entity/impl/Mobile";
import type { Player } from "../../entity/impl/player/Player";
import { SecondsTimer } from "../../model/SecondsTimer";
import { StatementDialogue } from "../../model/dialogues/entries/impl/StatementDialogue";
import { Stopwatch } from "../../../util/Stopwatch";
import { TimerKey } from "../../../util/timers/TimerKey";
import { CombatFactory, CanAttackResponse } from "./CombatFactory";
import { CombatSpecial } from "./CombatSpecial";
import { CombatConstants } from "./CombatConstants";
import { ServerPerf } from "../../../util/ServerPerf";
import { World } from "../../World";
export class Combat {
    private character: Mobile;
    private hitQueue: HitQueue;
    private damageMap: Map<Player, HitDamageCache> = new Map<Player, HitDamageCache>();
    private lastAttack = new Stopwatch();
    private poisonImmunityTimer = new SecondsTimer();
    private fireImmunityTimer = new SecondsTimer();
    private teleblockTimer = new SecondsTimer();
    private prayerBlockTimer = new SecondsTimer();
    public rangedWeapon: RangedWeapon;
    public ammunition: Ammunition;
    private target: Mobile;
    private attacker: Mobile;
    private method: CombatMethod;
    private cachedResolvedMethod: CombatMethod | null = null;
    private cachedResolvedMethodCycle = -1;
    private cachedCanReachResult = false;
    private cachedCanReachCycle = -1;
    private cachedCanReachMethod: CombatMethod | null = null;
    private cachedCanReachTarget: Mobile | null = null;
    private cachedCanReachAttackerX = -1;
    private cachedCanReachAttackerY = -1;
    private cachedCanReachAttackerZ = -1;
    private cachedCanReachTargetX = -1;
    private cachedCanReachTargetY = -1;
    private cachedCanReachTargetZ = -1;
    private cachedCanReachAttackerMoving = false;
    private cachedCanReachTargetMoving = false;
    private castSpell: CombatSpell;
    private autoCastSpell: CombatSpell;
    private previousCast: CombatSpell;
    constructor(character: Mobile) {
        this.character = character;
        this.hitQueue = new HitQueue();
    }

    private invalidateResolvedMethodCache() {
        this.cachedResolvedMethod = null;
        this.cachedResolvedMethodCycle = -1;
    }

    private invalidateCanReachCache() {
        this.cachedCanReachCycle = -1;
        this.cachedCanReachMethod = null;
        this.cachedCanReachTarget = null;
    }

    public resolveMethodForCurrentCycle(): CombatMethod {
        const cycle = World.getProcessCycle();
        if (this.cachedResolvedMethod && this.cachedResolvedMethodCycle === cycle) {
            return this.cachedResolvedMethod;
        }
        const resolved = CombatFactory.getMethod(this.character);
        this.cachedResolvedMethod = resolved;
        this.cachedResolvedMethodCycle = cycle;
        return resolved;
    }

    public resolveCanReachForCurrentCycle(method: CombatMethod, target: Mobile): boolean {
        const cycle = World.getProcessCycle();
        const attackerLocation = this.character.getLocation();
        const targetLocation = target?.getLocation();
        const attackerMoving = this.character.getMovementQueue().isMovings();
        const targetMoving = target?.getMovementQueue().isMovings() ?? false;

        if (
            this.cachedCanReachCycle === cycle &&
            this.cachedCanReachMethod === method &&
            this.cachedCanReachTarget === target &&
            this.cachedCanReachAttackerX === (attackerLocation?.getX() ?? -1) &&
            this.cachedCanReachAttackerY === (attackerLocation?.getY() ?? -1) &&
            this.cachedCanReachAttackerZ === (attackerLocation?.getZ() ?? -1) &&
            this.cachedCanReachTargetX === (targetLocation?.getX() ?? -1) &&
            this.cachedCanReachTargetY === (targetLocation?.getY() ?? -1) &&
            this.cachedCanReachTargetZ === (targetLocation?.getZ() ?? -1) &&
            this.cachedCanReachAttackerMoving === attackerMoving &&
            this.cachedCanReachTargetMoving === targetMoving
        ) {
            return this.cachedCanReachResult;
        }

        const result = CombatFactory.canReach(this.character, method, target);
        this.cachedCanReachCycle = cycle;
        this.cachedCanReachMethod = method;
        this.cachedCanReachTarget = target;
        this.cachedCanReachAttackerX = attackerLocation?.getX() ?? -1;
        this.cachedCanReachAttackerY = attackerLocation?.getY() ?? -1;
        this.cachedCanReachAttackerZ = attackerLocation?.getZ() ?? -1;
        this.cachedCanReachTargetX = targetLocation?.getX() ?? -1;
        this.cachedCanReachTargetY = targetLocation?.getY() ?? -1;
        this.cachedCanReachTargetZ = targetLocation?.getZ() ?? -1;
        this.cachedCanReachAttackerMoving = attackerMoving;
        this.cachedCanReachTargetMoving = targetMoving;
        this.cachedCanReachResult = result;
        return result;
    }

    public attack(target: Mobile) {
        // Update the target
        this.setTarget(target);
        if (this.character != null && this.character.isNpc() && !this.character.getAsNpc().getDefinition().doesFightBack()) {
            // Don't follow or face enemy if NPC doesn't fight back
            return;
        }

        // Start facing the target
        this.character.setMobileInteraction(target);

        // Perform the first attack now (in same tick)
        this.performNewAttack(false);
    }

    public castSpellOn(target: Mobile, spell: CombatSpell) {
        if (!target || !spell) {
            return;
        }
        this.character.setFollowing(target);
        this.character.setMobileInteraction(target);
        this.character.setPositionToFace(target.getLocation());
        this.setCastSpell(spell);
        this.attack(target);
    }

    /**
     * Processes combat.
     */
    public process() {
        if (!this.hasPendingWork()) {
            return;
        }
        // Process the hit queue
        ServerPerf.measurePhase("combat.process.hit_queue", () => this.hitQueue.process(this.character));

        // Reset attacker if we haven't been attacked in 6 seconds.
        if (this.lastAttack.elapsedTime(6000)) {
            this.setUnderAttack(null);
            // Keep processing our own target even when we're no longer under attack,
            // otherwise PvP facing/pressure can drop until a new hit lands on us.
            if (this.target == null) {
                return;
            }
        }

        // Handle attacking
        ServerPerf.measurePhase("combat.process.attack_cycle", () => this.performNewAttack(false));
    }

    public hasPendingWork(): boolean {
        return this.target != null || this.attacker != null || this.hitQueue.hasPendingWork();
    }

    public performNewAttack(instant: boolean) {
        if (this.target == null || (this.character != null && this.character.isNpc() && !this.character.getAsNpc().getDefinition().doesFightBack())) {
            // Don't process attacks for NPC's who don't fight back
            return;
        }
        this.character.setCombatFollowing(this.target);

        // Primary combat lock-on comes from entity interaction.
        this.character.setMobileInteraction(this.target);
        // Keep combat-facing updated every tick; Mobile now dedupes identical
        // face positions so this no longer needlessly re-flags unchanged values.
        const targetLocation = this.target.getLocation();
        this.character.setPositionToFaceCoordinates(
            targetLocation.getX(),
            targetLocation.getY(),
            targetLocation.getZ()
        );

        if (!instant && this.character.getTimers().has(TimerKey.COMBAT_ATTACK)) {
            if (!this.character.isPlayer()) {
                return;
            }
            const player = this.character.getAsPlayer();
            if (!player.isSpecialActivated() || player.getCombatSpecial() !== CombatSpecial.GRANITE_MAUL) {
                return;
            }
        }

        // Fetch the combat method the character will be attacking with
        this.method = ServerPerf.measurePhase(
            "combat.process.get_method",
            () => this.resolveMethodForCurrentCycle()
        );

        // Granite maul special attack, make sure we disregard delay
        // and that we do not reset the attack timer.
        let graniteMaulSpecial = (this.method instanceof GraniteMaulCombatMethod);
        if (graniteMaulSpecial) {
            instant = true;
        }

        const target = this.target;
        if (!ServerPerf.measurePhase(
            "combat.process.can_reach",
            () => this.resolveCanReachForCurrentCycle(this.method, target)
        )) {
            // Make sure the character is within reach before processing combat
            return;
        }
        if (this.target !== target || target == null) {
            return;
        }

        if (!ServerPerf.measurePhase(
            "combat.process.can_attack.valid_target",
            () => CombatFactory.validTarget(this.character, target)
        )) {
            return;
        }

        switch (ServerPerf.measurePhase(
            "combat.process.can_attack",
            () => CombatFactory.canAttack(this.character, this.method, target, true)
        )) {
            case CanAttackResponse.CAN_ATTACK: {
                if (this.character.getCombat().getAttacker() == null) {
                    // Call the onCombatBegan hook once when combat begins
                    this.method.onCombatBegan(this.character, this.attacker);
                }
                if (this.target.getCombat().getAttacker() == null) {
                    // Call the onCombatBegan hook once when combat begins
                    let targetMethod = CombatFactory.getMethod(this.target);
                    targetMethod.onCombatBegan(this.target, this.character);
                }
                ServerPerf.measurePhase("combat.process.method_start", () =>
                    this.method.start(this.character, this.target)
                );
                let hits = ServerPerf.measurePhase("combat.process.method_hits", () =>
                    this.method.hits(this.character, this.target)
                );
                if (hits == null)
                    return;
                for (let hit of hits) {
                    CombatFactory.addPendingHit(hit);
                }
                ServerPerf.measurePhase("combat.process.method_finished", () =>
                    this.method.finished(this.character, this.target)
                );

                // Reset attack timer
                if (!graniteMaulSpecial) {
                    let speed = this.method.attackSpeed(this.character);
                    this.character.getTimers().registers(TimerKey.COMBAT_ATTACK, speed);
                }
                instant = false;
                if (this.character.isSpecialActivated()) {
                    this.character.setSpecialActivated(false);
                    if (this.character.isPlayer()) {
                        let p = this.character.getAsPlayer();
                        CombatSpecial.updateBar(p);
                    }
                }
                break;
            }
            case CanAttackResponse.ALREADY_UNDER_ATTACK: {
                if (this.character.isPlayer()) {
                    this.character.getAsPlayer().getPacketSender().sendMessage("You are already under attack!");
                }
                this.character.getCombat().reset();
                break;
            }
            case CanAttackResponse.CANT_ATTACK_IN_AREA: {
                this.character.getCombat().reset();
                break;
            }
            case CanAttackResponse.COMBAT_METHOD_NOT_ALLOWED: {
                break;
            }
            case CanAttackResponse.LEVEL_DIFFERENCE_TOO_GREAT: {
                this.character.getAsPlayer().getPacketSender().sendMessage("Your level difference is too great.");
                this.character.getAsPlayer().getPacketSender().sendMessage("You need to move deeper into the Wilderness.");
                this.character.getCombat().reset();
                break;
            }
            case CanAttackResponse.NOT_ENOUGH_SPECIAL_ENERGY: {
                let p = this.character.getAsPlayer();
                p.getPacketSender().sendMessage("You do not have enough special attack energy left!");
                p.setSpecialActivated(false);
                CombatSpecial.updateBar(this.character.getAsPlayer());
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.STUNNED: {
                let p = this.character.getAsPlayer();
                p.getPacketSender().sendMessage("You're currently stunned and cannot attack.");
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.DUEL_NOT_STARTED_YET: {
                let p = this.character.getAsPlayer();
                p.getPacketSender().sendMessage("The duel has not started yet!");
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.DUEL_WRONG_OPPONENT: {
                let p = this.character.getAsPlayer();
                p.getPacketSender().sendMessage("This is not your opponent!");
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.DUEL_MELEE_DISABLED: {
                let p = this.character.getAsPlayer();
                StatementDialogue.send(p, "Melee has been disabled in this duel!");
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.DUEL_RANGED_DISABLED: {
                let p = this.character.getAsPlayer();
                StatementDialogue.send(p, "Ranged has been disabled in this duel!");
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.DUEL_MAGIC_DISABLED: {
                let p = this.character.getAsPlayer();
                StatementDialogue.send(p, "Magic has been disabled in this duel!");
                p.getCombat().reset();
                break;
            }
            case CanAttackResponse.TARGET_IS_IMMUNE: {
                if (this.character.isPlayer()) {
    (this.character as Player).getPacketSender().sendMessage("This npc is currently immune to attacks.");
}
                this.character.getCombat().reset();
                break;
            }
            case CanAttackResponse.INVALID_TARGET: {
                this.character.getCombat().reset();
                break;
            }
        }
    }

    public reset() {
        this.setTarget(null);
        this.character.setCombatFollowing(null);
        this.character.setMobileInteraction(null);
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }
    /**
* Adds damage to the damage map, as long as the argued amount of damage is
* above 0 and the argued entity is a player.
*
* @param entity the entity to add damage for.
* @param amount the amount of damage to add for the argued entity.
*/
    public addDamage(entity: Mobile, amount: number) {
        if (amount <= 0 || entity.isNpc()) {
            return;
        }

        let player = entity as Player;
        if (this.damageMap.has(player)) {
            this.damageMap.get(player).incrementDamage(amount);
            return;
        }

        this.damageMap.set(player, new HitDamageCache(amount));
    }

    public getKiller(clearMap: boolean) {
        // Return null if no players killed this entity.
        if (this.damageMap.size == 0) {
            return null;
        }

        // The damage and killer placeholders.
        let damage = 0;
        let killer: any | null | undefined = null;

        for (let entry of this.damageMap.entries()) {

            // Check if this entry is valid.
            if (entry == null) {
                continue;
            }

            // Check if the cached time is valid.
            let timeout = entry[1].getStopwatch().valueOf();
            if (timeout > CombatConstants.DAMAGE_CACHE_TIMEOUT) {
                continue;
            }

            // Check if the key for this entry has logged out.
            let player = entry[0];
            if (!player.isRegistered()) {
                continue;
            }

            // If their damage is above the placeholder value, they become the
            // new 'placeholder'.
            if (entry[1].getDamage() > damage) {
                damage = entry[1].getDamage();
                killer = entry[0];
            }
        }

        // Clear the damage map if needed.
        if (clearMap)
            this.damageMap.clear();

        // Return the killer placeholder.
        return killer;
    }

    public damageMapContains(player: Player): boolean {
        let damageCache:HitDamageCache = this.damageMap.get(player);
        if (damageCache == null) {
            return false;
        }
        return damageCache.getStopwatch() < CombatConstants.DAMAGE_CACHE_TIMEOUT;
    }

    public getRecentDamagers(): Player[] {
        const recentDamagers: Player[] = [];
        for (const [player, damageCache] of this.damageMap.entries()) {
            if (
                player != null &&
                player.isRegistered() &&
                damageCache != null &&
                damageCache.getDamage() > 0 &&
                damageCache.getStopwatch() < CombatConstants.DAMAGE_CACHE_TIMEOUT
            ) {
                recentDamagers.push(player);
            }
        }
        return recentDamagers;
    }

    public getRecentDamagerEntries(): Array<{ player: Player; damage: number }> {
        const recentDamagers: Array<{ player: Player; damage: number }> = [];
        for (const [player, damageCache] of this.damageMap.entries()) {
            if (
                player != null &&
                player.isRegistered() &&
                damageCache != null &&
                damageCache.getDamage() > 0 &&
                damageCache.getStopwatch() < CombatConstants.DAMAGE_CACHE_TIMEOUT
            ) {
                recentDamagers.push({ player, damage: damageCache.getDamage() });
            }
        }
        return recentDamagers;
    }

    public getCharacter(): Mobile {
        return this.character;
    }

    public getTarget(): Mobile {
        return this.target;
    }

    public setTarget(target: Mobile) {
        if (this.target != null && target == null && this.method != null) {
            // Target has changed to null, this means combat has ended. Call the relevant hook inside the combat method.
            this.method.onCombatEnded(this.character, this.attacker);
        }

        this.target = target;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getHitQueue(): HitQueue {
        return this.hitQueue;
    }

    public getAttacker(): Mobile {
        return this.attacker;
    }

    public setUnderAttack(attacker: Mobile) {
        this.attacker = attacker;
        this.lastAttack.reset();
    }

    public getCastSpell(): CombatSpell {
        return this.castSpell;
    }
    public setCastSpell(castSpell: CombatSpell) {
        this.castSpell = castSpell;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getAutocastSpell(): CombatSpell {
        return this.autoCastSpell;
    }

    public setAutocastSpell(autoCastSpell: CombatSpell) {
        this.autoCastSpell = autoCastSpell;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getSelectedSpell(): CombatSpell {
        let spell = this.getCastSpell();
        if (spell != null) {
            return spell;
        }
        return this.getAutocastSpell();
    }

    public getPreviousCast(): CombatSpell {
        return this.previousCast;
    }

    public setPreviousCast(previousCast: CombatSpell) {
        this.previousCast = previousCast;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getRangedWeapon(): RangedWeapon {
        return this.rangedWeapon;
    }

    public setRangedWeapon(rangedWeapon: RangedWeapon) {
        this.rangedWeapon = rangedWeapon;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getAmmunition(): Ammunition {
        return this.ammunition;
    }

    public setAmmunition(ammunition: Ammunition) {
        this.ammunition = ammunition;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getRangeAmmoData(): RangedData {
        return this.ammunition as unknown as RangedData;
    }

    public setRangeAmmoData(rangeAmmoData: RangedData) {
        this.ammunition = rangeAmmoData as unknown as Ammunition;
        this.invalidateResolvedMethodCache();
        this.invalidateCanReachCache();
    }

    public getPoisonImmunityTimer(): SecondsTimer {
        return this.poisonImmunityTimer;
    }

    public getFireImmunityTimer(): SecondsTimer {
        return this.fireImmunityTimer;
    }

    public getTeleblockTimer(): SecondsTimer {
        return this.teleblockTimer;
    }

    public getPrayerBlockTimer(): SecondsTimer {
        return this.prayerBlockTimer;
    }

    public getLastAttack(): Stopwatch {
        return this.lastAttack;
    }
}
