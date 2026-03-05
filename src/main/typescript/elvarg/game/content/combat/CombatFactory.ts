import { Sound } from "../../Sound";
import { Sounds } from "../../Sounds";
import { RegionManager } from "../../collision/RegionManager";
import { PrayerHandler } from "../PrayerHandler";
import { Dueling } from "../Duelling";
import { WeaponInterfaces } from "./WeaponInterfaces";
import { DamageFormulas } from "./formula/DamageFormulas";
import { HitDamage } from "./hit/HitDamage";
import { HitMask } from "./hit/HitMask";
import { PendingHit } from "./hit/PendingHit";
import { CombatSpells } from "./magic/CombatSpells";
import { CombatMethod } from "./method/CombatMethod";
import { MagicCombatMethod } from "./method/impl/MagicCombatMethod";
import { MeleeCombatMethod } from "./method/impl/MeleeCombatMethod";
import { RangedCombatMethod } from "./method/impl/RangedCombatMethod";
import { Ammunition, RangedData, RangedWeapon } from "./ranged/RangedData";
import { Mobile } from "../../entity/impl/Mobile";
import type { NPC } from "../../entity/impl/npc/NPC";
import { CoordinateState, NPCMovementCoordinator } from "../../entity/impl/npc/NPCMovementCoordinator";
import type { Player } from "../../entity/impl/player/Player";
import { Animation } from "../../model/Animation";
import { EffectTimer } from "../../model/EffectTimer"
import { Flag } from "../../model/Flag";
import { Graphic } from "../../model/Graphic";
import { GraphicHeight } from "../../model/GraphicHeight";
import { Item } from "../../model/Item";
import { Location } from "../../model/Location";
import { Skill } from "../../model/Skill";
import { SkullType } from "../../model/SkullType"
import { AreaManager } from "../../model/areas/AreaManager";
import { BasicAttackResponse } from "../../model/areas/Area";
import { Equipment } from "../../model/container/impl/Equipment";
import { MovementQueue } from "../../model/movement/MovementQueue";
import { PathFinder } from "../../model/movement/path/PathFinder";
import { PlayerRights } from "../../model/rights/PlayerRights";
import { Task } from "../../task/Task";
import { TaskManager } from "../../task/TaskManager";
import { CombatPoisonEffect } from "../../task/impl/CombatPoisonEffect"
import { ItemIdentifiers } from "../../../util/ItemIdentifiers";
import { Misc } from "../../../util/Misc";
import { NpcIdentifiers } from "../../../util/NpcIdentifiers";
import { RandomGen } from "../../../util/RandomGen";
import { TimerKey } from "../../../util/timers/TimerKey";
import { CombatType } from "./CombatType";
import { CombatSpecial } from "./CombatSpecial";
import { CombatPoisonData } from "../../task/impl/CombatPoisonEffect";
import { DuelRule } from "../Duelling";
import { PoisonType } from "../../task/impl/CombatPoisonEffect";
import { CombatConstants } from "./CombatConstants";
import { Wilderness } from "../wilderness/Wilderness";
import { ZaryteCrossbowCombatMethod } from "./method/impl/specials/ZaryteCrossbowCombatMethod";
import { PluginManager } from "../../../plugins/PluginManager";

const normalizeAreaResponse = (response: CanAttackResponse | BasicAttackResponse): CanAttackResponse => {
    if (response === BasicAttackResponse.CAN_ATTACK) {
        return CanAttackResponse.CAN_ATTACK;
    }
    if (response === BasicAttackResponse.CANT_ATTACK_IN_AREA) {
        return CanAttackResponse.CANT_ATTACK_IN_AREA;
    }
    return response as CanAttackResponse;
};

const getPlayerCombatSpecial = (player: Player): CombatSpecial | null => {
    const accessor = (player as any)?.getCombatSpecial;
    if (typeof accessor === "function") {
        const resolved = accessor.call(player);
        if (resolved) {
            return resolved;
        }
    }
    return ((player as any)?.combatSpecial ?? null) as CombatSpecial | null;
};

export class CombatFactory {
    private static readonly RANDOM = new RandomGen();
    /**
     * The default melee combat method.
     */
    public static readonly MELEE_COMBAT = new MeleeCombatMethod();

    /**
     * The default ranged combat method
     */
    public static readonly RANGED_COMBAT = new RangedCombatMethod();

    /**
     * The default magic combat method
     */
    public static readonly MAGIC_COMBAT = new MagicCombatMethod();

    static getMethod(attacker: Mobile) {
        if (attacker.isPlayer()) {
            const player = attacker.getAsPlayer();

            // Update ranged data before selecting the combat method.
            player.getCombat().setAmmunition(Ammunition.getFor(player));
            player.getCombat().setRangedWeapon(RangedWeapon.getFor(player));

            if (
                player.getCombat().getCastSpell() != null ||
                (player.getCombat().getAutocastSpell() != null && player.getEquipment().hasStaffEquipped())
            ) {
                return CombatFactory.MAGIC_COMBAT;
            }

            const special = getPlayerCombatSpecial(player);
            if (player.isSpecialActivated() && special != null) {
                return special.getCombatMethod();
            }

            if (player.getCombat().getRangedWeapon() != null) {
                return CombatFactory.RANGED_COMBAT;
            }
        } else if (attacker.isNpc()) {
            return attacker.getAsNpc().getCombatMethod();
        }

        return CombatFactory.MELEE_COMBAT;
    }

    static getHitDamage(entity: Mobile, victim: Mobile, type: CombatType) {
        let damage = 0;
        if (type == CombatType.MELEE) {
            damage = Misc.randomInclusive(0, DamageFormulas.calculateMaxMeleeHit(entity));

            // Do melee effects with the calculated damage..
            if (victim.getPrayerActive()[PrayerHandler.PROTECT_FROM_MELEE]) {
                damage *= 0.6;
            }

        } else if (type == CombatType.RANGED) {
            damage = Misc.randomInclusive(0, DamageFormulas.calculateMaxRangedHit(entity));

            if (victim.getPrayerActive()[PrayerHandler.PROTECT_FROM_MISSILES]) {
                damage *= 0.6;
            }

            // Do ranged effects with the calculated damage..
            if (entity.isPlayer()) {

                let player = entity.getAsPlayer();

                // Check if player is using dark bow and set damage to minimum 8, maxmimum 48 if
                // that's the case...
                const special = getPlayerCombatSpecial(player);
                if (player.isSpecialActivated() && special === CombatSpecial.DARK_BOW) {
                    if (damage < 8) {
                        damage = 8;
                    } else if (damage > 48) {
                        damage = 48;
                    }
                }
                if (player.getWeapon() == WeaponInterfaces.CROSSBOW && Misc.getRandom(10) == 1) {
                    let multiplier = RangedData.getSpecialEffectsMultiplier(player, victim, damage);
                    damage *= multiplier;
                }
            }
        } else if (type == CombatType.MAGIC) {
            damage = Misc.randomInclusive(0, DamageFormulas.getMagicMaxhit(entity));
            if (victim.getPrayerActive()[PrayerHandler.PROTECT_FROM_MAGIC]) {
                damage *= 0.6;
            }
        }

        // Do magic effects with the calculated damage..
        // We've got our damage. We can now create a HitDamage
        // instance.
        let hitDamage = new HitDamage(damage, damage == 0 ? HitMask.BLUE : HitMask.RED);

        /**
         * Prayers decreasing damage.
         */

        // Decrease damage if victim is a player and has prayers active..
        if ((!CombatFactory.fullVeracs(entity) || Misc.getRandom(4) == 1)) {

            // Check if victim is is using correct protection prayer
            if (PrayerHandler.isActivated(victim, PrayerHandler.getProtectingPrayer(type))) {

                // Apply the damage reduction mod
                if (entity.isNpc()) {
                    hitDamage.multiplyDamage(CombatConstants.PRAYER_DAMAGE_REDUCTION_AGAINST_NPCS);
                } else {
                    hitDamage.multiplyDamage(CombatConstants.PRAYER_DAMAGE_REDUCTION_AGAINST_PLAYERS);
                }
            }
        }
        if (victim.isPlayer() && Misc.getRandom(100) <= 70) {
            if (victim.getAsPlayer().getEquipment().getItems()[Equipment.SHIELD_SLOT].getId() == 12817) {
                hitDamage.multiplyDamage(CombatConstants.ELYSIAN_DAMAGE_REDUCTION);
                victim.performGraphic(new Graphic(321, 40)); // Elysian spirit shield effect gfx
            }
        }

        return hitDamage;
    }

    static applyExtraHitRolls(attacker: Mobile, target: Mobile, combatType: CombatType, damage: HitDamage, accurate: boolean, method: CombatMethod) {
        if (!attacker || !target || !damage) {
            return;
        }

        if (!accurate) {
            return;
        }

        const guaranteedCrossbowEffect =
            combatType == CombatType.RANGED &&
            accurate &&
            method instanceof ZaryteCrossbowCombatMethod;

        if (combatType == CombatType.RANGED
            && attacker.isPlayer()
            && attacker.getAsPlayer().getWeapon() == WeaponInterfaces.CROSSBOW
            && (guaranteedCrossbowEffect || Misc.getRandom(10) == 1)) {
            const multiplier = RangedData.getSpecialEffectsMultiplier(attacker.getAsPlayer(), target, damage.getDamage());
            if (multiplier !== 1.0) {
                damage.setDamage(Math.floor(damage.getDamage() * multiplier));
            }
        }
    }

    static validTarget(attacker: Mobile, target: Mobile) {
        if (attacker == null || target == null) {
            return false;
        }
        if (!target.isRegistered() || !attacker.isRegistered() || attacker.getHitpoints() <= 0
            || target.getHitpoints() <= 0 || attacker.isUntargetable()) {
            return false;
        }

        if (attacker.getLocation().getDistance(target.getLocation()) >= 40) {
            return false;
        }

        if (attacker.isNpc() && target.isPlayer()) {
            if (attacker.getAsNpc().getOwner() != null && attacker.getAsNpc().getOwner() != target.getAsPlayer()) {
                return false;
            }
        } else if (attacker.isPlayer() && target.isNpc()) {
            if (target.getAsNpc().getOwner() != null && target.getAsNpc().getOwner() != attacker.getAsPlayer()) {
                attacker.getAsPlayer().getPacketSender().sendMessage("This npc was not spawned for you.");
                return false;
            }
        }

        return true;
    }

    static canReach(attacker: Mobile, method: CombatMethod, target: Mobile) {
        if (!CombatFactory.validTarget(attacker, target)) {
            attacker.getCombat().reset();
            return true;
        }

        const isMoving = target.getMovementQueue().isMovings();

        // Walk back if npc is too far away from spawn position.
        if (attacker.isNpc()) {
            const npc = attacker.getAsNpc();
            if (npc.getCurrentDefinition().doesRetreat()) {
                if (npc.getMovementCoordinator().getCoordinateState() == CoordinateState.RETREATING) {
                    npc.getCombat().reset();
                    return false;
                }
                if (npc.getLocation().getDistance(npc.getSpawnPosition()) >= npc.getCurrentDefinition().getCombatFollowDistance()) {
                    npc.getCombat().reset();
                    npc.getMovementCoordinator().setCoordinateState(CoordinateState.RETREATING);
                    return false;
                }
            }
        }

        const attackerPosition = attacker.getLocation();
        const targetPosition = target.getLocation();

        if (attackerPosition.equals(targetPosition)) {
            if (!attacker.getTimers().has(TimerKey.STEPPING_OUT)) {
                MovementQueue.clippedStep(attacker);
                attacker.getTimers().registers(TimerKey.STEPPING_OUT, 2);
            }
            return false;
        }

        let requiredDistance = method.attackDistance(attacker);
        const distance = attacker.calculateDistance(target);

        // Standing under the target
        if (distance == 0) {
            if (attacker.isPlayer()) {
                return false;
            }
            if (attacker.isNpc() && attacker.getSize() == 0) {
                return false;
            }
        }

        if (method.type() == CombatType.MELEE && isMoving && attacker.getMovementQueue().isMovings()) {
            // If we're using Melee and either player is moving, increase required distance
            requiredDistance++;
        }

        // Too far away from the target
        if (distance > requiredDistance) {
            return false;
        }

        // Don't allow diagonal attacks for smaller entities
        if (method.type() == CombatType.MELEE && attacker.getSize() == 1 && target.getSize() == 1 && !isMoving && !target.getMovementQueue().isMovings()) {
            if (PathFinder.isDiagonalLocation(attacker, target)) {
                CombatFactory.stepOut(attacker, target);
                return false;
            }
        }

        // Make sure we the path is clear for projectiles..
        if (attacker.useProjectileClipping() && !RegionManager.canProjectileAttackReturn(attacker.getLocation(), target.getLocation(), attacker.getSize(), attacker.getPrivateArea())) {
            return false;
        }

        return true;
    }

    public static fullVeracs(entity: Mobile): boolean {
        return entity.isNpc() ? entity.getAsNpc().getId() == NpcIdentifiers.VERAC_THE_DEFILED
            : entity.getAsPlayer().getEquipment().containsAllAny([4753, 4757, 4759, 4755]);
    }

    /**
    * Determines if the entity is wearing full dharoks.
    *
    * @param entity the entity to determine this for.
    * @return true if the player is wearing full dharoks.
    */
    public static fullDharoks(entity: Mobile): boolean {
        return entity.isNpc() ? entity.getAsNpc().getId() == NpcIdentifiers.DHAROK_THE_WRETCHED
            : entity.getAsPlayer().getEquipment().containsAllAny([4716, 4720, 4722, 4718]);
    }

    /**
    * Determines if the entity is wearing full karils.
    *
    * @param entity the entity to determine this for.
    * @return true if the player is wearing full karils.
    */
    public static fullKarils(entity: Mobile): boolean {
        return entity.isNpc() ? entity.getAsNpc().getId() == NpcIdentifiers.KARIL_THE_TAINTED
            : entity.getAsPlayer().getEquipment().containsAllAny([4732, 4736, 4738, 4734]);
    }

    /**
    * Determines if the entity is wearing full ahrims.
    *
    * @param entity the entity to determine this for.
    * @return true if the player is wearing full ahrims.
    */
    public static fullAhrims(entity: Mobile): boolean {
        return entity.isNpc() ? entity.getAsNpc().getId() == NpcIdentifiers.AHRIM_THE_BLIGHTED
            : entity.getAsPlayer().getEquipment().containsAllAny([4708, 4712, 4714, 4710]);
    }

    public static fullTorags(entity: Mobile): boolean {
        return entity.isNpc() ? entity.getAsNpc().getDefinition().getName() === "Torag the Corrupted"
            : entity.getAsPlayer().getEquipment().containsAllAny([4745, 4749, 4751, 4747]);
    }

    /**
     * Determines if the entity is wearing full guthans.
     *
     * @param entity the entity to determine this for.
     * @return true if the player is wearing full guthans.
     */
    public static fullGuthans(entity: Mobile): boolean {
        return entity.isNpc() ? entity.getAsNpc().getDefinition().getName() === "Guthan the Infested"
            : entity.getAsPlayer().getEquipment().containsAllAny([4724, 4728, 4730, 4726]);
    }

    /**
     * Calculates the combat level difference for wilderness player vs. player
     * combat.
     *
     * @param combatLevel the combat level of the first person.
     * @param otherCombatLevel the combat level of the other person.
     * @return the combat level difference.
     */
    public static combatLevelDifference(combatLevel: number, otherCombatLevel: number): number {
        if (combatLevel > otherCombatLevel) {
            return (combatLevel - otherCombatLevel);
        } else if (otherCombatLevel > combatLevel) {
            return (otherCombatLevel - combatLevel);
        } else {
            return 0;
        }
    }

    private static stepOut(attacker: Mobile, target: Mobile) {
        let tiles = [
            new Location(target.getLocation().getX() - 1, target.getLocation().getY()),
            new Location(target.getLocation().getX() + 1, target.getLocation().getY()),
            new Location(target.getLocation().getX(), target.getLocation().getY() + 1),
            new Location(target.getLocation().getX(), target.getLocation().getY() - 1)
        ];
        /** If a tile is present it will step out **/
        tiles.filter(t => !RegionManager.blocked(t, attacker.getPrivateArea())).sort((a, b) => attacker.getLocation().getDistance(a) - attacker.getLocation().getDistance(b)).forEach(tile => {
            PathFinder.calculateWalkRoute(attacker, tile.getX(), tile.getY());
        });
    }

    public static canAttack(attacker: Mobile, method: CombatMethod, target: Mobile): CanAttackResponse {
        if (!CombatFactory.validTarget(attacker, target)) {
            return CanAttackResponse.INVALID_TARGET;
        }

        // Here we check if we are already in combat with another entity.
        // Only check if we aren't in multi.
        if (!(AreaManager.inMulti(attacker) && AreaManager.inMulti(target))) {
            if (
                (
                    CombatFactory.isBeingAttacked(attacker) &&
                    attacker.getCombat().getAttacker() != target &&
                    attacker.getCombat().getAttacker().getHitpoints() > 0
                ) || !attacker.getCombat().getHitQueue().isEmpty(target)
            ) {
                return CanAttackResponse.ALREADY_UNDER_ATTACK;
            }

            // Here we check if we are already in combat with another entity.
            if (
                (CombatFactory.isBeingAttacked(target) && target.getCombat().getAttacker() != attacker) ||
                !target.getCombat().getHitQueue().isEmpty(attacker)
            ) {
                return CanAttackResponse.ALREADY_UNDER_ATTACK;
            }
        }

        // Check plugin and area attack policy.
        const areaResponse = CombatFactory.canAttackByPolicy(attacker, target);
        if (areaResponse != CanAttackResponse.CAN_ATTACK) {
            return areaResponse;
        }

        if (!method.canAttack(attacker, target)) {
            return CanAttackResponse.COMBAT_METHOD_NOT_ALLOWED;
        }

        // Check special attack and player-only attack restrictions.
        if (attacker.isPlayer()) {
            const player = attacker.getAsPlayer();
            const special = getPlayerCombatSpecial(player);

            if (player.isSpecialActivated() && special != null) {
                if (player.getSpecialPercentage() < special.getDrainAmount()) {
                    return CanAttackResponse.NOT_ENOUGH_SPECIAL_ENERGY;
                }
            }

            if (player.getTimers().has(TimerKey.STUN)) {
                return CanAttackResponse.STUNNED;
            }

            // Duel rules
            if (player.getDueling().inDuel()) {
                if (method.type() == CombatType.MELEE && player.getDueling().getRules()[DuelRule.NO_MELEE.getButtonId()]) {
                    return CanAttackResponse.DUEL_MELEE_DISABLED;
                }
                if (method.type() == CombatType.RANGED && player.getDueling().getRules()[DuelRule.NO_RANGED.getButtonId()]) {
                    return CanAttackResponse.DUEL_RANGED_DISABLED;
                }
                if (method.type() == CombatType.MAGIC && player.getDueling().getRules()[DuelRule.NO_MAGIC.getButtonId()]) {
                    return CanAttackResponse.DUEL_MAGIC_DISABLED;
                }
            }
        }

        // Check immune npcs..
        if (target.isNpc()) {
            const npc = target as unknown as NPC;
            if (npc.getTimers().has(TimerKey.ATTACK_IMMUNITY)) {
                return CanAttackResponse.TARGET_IS_IMMUNE;
            }
        }

        return CanAttackResponse.CAN_ATTACK;
    }

    public static canAttackByPolicy(attacker: Mobile, target: Mobile): CanAttackResponse {
        const pluginCanAttack = PluginManager.emitCanAttack(attacker, target);
        if (pluginCanAttack === true) {
            return CanAttackResponse.CAN_ATTACK;
        }
        if (pluginCanAttack === false) {
            return CanAttackResponse.CANT_ATTACK_IN_AREA;
        }
        return normalizeAreaResponse(AreaManager.canAttack(attacker, target));
    }

    /**
     * Ancient spells evaluate possible splash victims outside the main attack start flow.
     * Keep those secondary-target checks centralized here so magic doesn't duplicate policy checks.
     */
    public static canAttackSecondaryTarget(
        attacker: Mobile,
        primaryTarget: Mobile,
        candidate: Mobile,
        spellRadius: number
    ): boolean {
        if (!candidate || candidate === attacker || candidate === primaryTarget) {
            return false;
        }
        if (candidate.getHitpoints() <= 0) {
            return false;
        }
        if (!candidate.getLocation().isWithinDistance(primaryTarget.getLocation(), spellRadius)) {
            return false;
        }
        if (!AreaManager.inMulti(candidate)) {
            return false;
        }
        if (candidate.isNpc() && !candidate.getAsNpc().getCurrentDefinition().isAttackable()) {
            return false;
        }
        if (candidate.isPlayer() && CombatFactory.canAttackByPolicy(attacker, candidate) !== CanAttackResponse.CAN_ATTACK) {
            return false;
        }
        return true;
    }

    public static addPendingHit(qHit: PendingHit) {
        const attacker = qHit.getAttacker();
        const target = qHit.getTarget();
        if (target.getHitpoints() <= 0) {
            return;
        }

        if (target.isUntargetable() || target.isNeedsPlacement()) {
            // If target is teleporting or needs placement, don't register the hit.
            return;
        }

        if (attacker.isPlayer()) {
            // Reward the player experience for this attack..
            CombatFactory.rewardExp(attacker.getAsPlayer(), qHit);

            const area: any = attacker.getAsPlayer().getArea();
            if (area != null && typeof area.onPlayerDealtDamage === "function") {
                area.onPlayerDealtDamage(attacker.getAsPlayer(), target, qHit);
            }

            // Java parity: apply skull at hit-queue time, before executeHit mutates
            // attacker/retaliation state (which can otherwise suppress skulling).
            if (target.isPlayer()) {
                CombatFactory.handleSkull(attacker.getAsPlayer(), target.getAsPlayer());
            }
        }

        // Add this hit to the target's hitQueue.
        target.getCombat().getHitQueue().addPendingHit(qHit);
    }

    public static executeHit(qHit: PendingHit) {
        if (!qHit) {
            return;
        }
        const attacker = qHit.getAttacker();
        const target = qHit.getTarget();
        if (!attacker || !target || typeof target.getCombat !== "function") {
            return;
        }

        // If target/attacker is dead, don't continue.
        if (target.getHitpoints() <= 0 || attacker.getHitpoints() <= 0) {
            return;
        }

        // If target is teleporting or needs placement, don't continue to add the hit.
        if (target.isUntargetable() || target.isNeedsPlacement()) {
            return;
        }

        // Before target takes damage, manipulate the hit to handle last-second effects.
        let resolvedHit = target.manipulateHit(qHit);
        if (!resolvedHit) {
            return;
        }

        const method = resolvedHit.getCombatMethod();
        const combatType = resolvedHit.getCombatType();
        const damage = resolvedHit.getTotalDamage();

        // Do block animation.
        target.performAnimation(new Animation(target.getBlockAnim()));

        // Target-side player effects.
        if (target.isPlayer()) {
            const playerTarget = target.getAsPlayer();
            if (resolvedHit.isAccurate() && damage > 0) {
                const hitSound = playerTarget.getAppearance()?.isMale?.()
                    ? Sound.MALE_GETTING_HIT
                    : Sound.FEMALE_GETTING_HIT;
                Sounds.sendSound(playerTarget, hitSound);
            } else {
                Sounds.sendSound(playerTarget, Sound.DEFENCE_BLOCK);
            }

            // Close interfaces while being hit (except developer rights).
            if (playerTarget.getRights() != PlayerRights.DEVELOPER && playerTarget.busy()) {
                playerTarget.getPacketSender().sendInterfaceRemoval();
            }

            // Prayer effects.
            if (resolvedHit.isAccurate()) {
                if (PrayerHandler.isActivated(playerTarget, PrayerHandler.REDEMPTION)) {
                    CombatFactory.handleRedemption(attacker, playerTarget, damage);
                }
                if (PrayerHandler.isActivated(attacker, PrayerHandler.SMITE)) {
                    CombatFactory.handleSmite(attacker, playerTarget, damage);
                }
            }
        }

        // Don't apply magic splash damage from player casts.
        const magicSplash = combatType == CombatType.MAGIC && !resolvedHit.isAccurate();
        if (!(magicSplash && attacker.isPlayer())) {
            target.getCombat().getHitQueue().addPendingDamage(resolvedHit.getHits());
        }

        // Make sure to let the combat method know we finished the attack.
        if (resolvedHit.getHandleAfterHitEffects() && method != null) {
            method.handleAfterHitEffects(resolvedHit);
        }

        // Attacker-side effects.
        if (attacker.isPlayer()) {
            const playerAttacker = attacker.getAsPlayer();

            // Randomly apply poison if poisonous weapon/ammunition is equipped.
            if (damage > 0 && Misc.getRandom(20) <= 5) {
                let poisonType: PoisonType | undefined;
                let rangedPoisonRoll = false;

                if (
                    combatType == CombatType.MELEE ||
                    playerAttacker.getWeapon() == WeaponInterfaces.DART ||
                    playerAttacker.getWeapon() == WeaponInterfaces.KNIFE ||
                    playerAttacker.getWeapon() == WeaponInterfaces.THROWNAXE ||
                    playerAttacker.getWeapon() == WeaponInterfaces.JAVELIN
                ) {
                    poisonType = CombatPoisonData.getPoisonType(
                        playerAttacker.getEquipment().get(Equipment.WEAPON_SLOT)
                    );
                } else if (combatType == CombatType.RANGED) {
                    rangedPoisonRoll = true;
                    poisonType = CombatPoisonData.getPoisonType(
                        playerAttacker.getEquipment().get(Equipment.AMMUNITION_SLOT)
                    );
                }

                if (poisonType && (!rangedPoisonRoll || Misc.getRandom(10) <= 5)) {
                    CombatFactory.poisonEntity(target, poisonType);
                }
            }

            // Handle barrows effects if damage is more than zero.
            if (damage > 0 && Misc.getRandom(10) >= 8) {
                if (CombatFactory.fullGuthans(playerAttacker)) {
                    CombatFactory.handleGuthans(playerAttacker, target, damage);
                }
            }
        } else if (attacker.isNpc()) {
            const npcAttacker = attacker.getAsNpc();
            if (npcAttacker.getCurrentDefinition().isPoisonous() && Misc.getRandom(10) <= 5) {
                CombatFactory.poisonEntity(target, PoisonType.SUPER);
            }
        }

        // Handle ring of recoil and vengeance for target.
        if (damage > 0) {
            if (
                target.isPlayer() &&
                target.getAsPlayer().getEquipment().get(Equipment.RING_SLOT).getId() == ItemIdentifiers.RING_OF_RECOIL
            ) {
                CombatFactory.handleRecoil(target.getAsPlayer(), attacker, damage);
            }
            if ((target as any).hasVengeance) {
                CombatFactory.handleVengeance(target, attacker, damage);
            }
        }

        // Mark under-attack before retaliation scheduling so retaliatory attacks
        // can correctly detect "already attacked by this target" and avoid
        // incorrectly applying skulls to the defender.
        target.getCombat().setUnderAttack(attacker);
        CombatFactory.handleRetaliation(attacker, target);
        target.getCombat().addDamage(attacker, damage);

        if (target.isPlayerBot()) {
            (target as any).getCombatInteraction?.()?.takenDamage?.(damage, attacker);
        }
    }

    public static rewardExp(player: Player, hit: PendingHit) {
        const hitDamage = Number.isFinite(hit.getTotalDamage()) ? hit.getTotalDamage() : 0;

        // Add magic exp, even if total damage is 0.
        // Since spells have a base exp reward
        if (hit.getCombatType() === CombatType.MAGIC) {
            if (player.getCombat().getPreviousCast() != null) {
                if (hit.isAccurate()) {
                    player.getSkillManager().addExperience(Skill.MAGIC,
                        Math.floor(hitDamage)/* + player.getCombat().getPreviousCast().baseExperience() */, true);
                } else {
                    // Splash should only give 52 exp..
                    player.getSkillManager().addExperience(Skill.MAGIC, 52, false);
                }
            }
        }

        // Don't add any exp to other skills if total damage is 0.
        if (hitDamage <= 0) {
            return;
        }

        // Add hp xp
        player.getSkillManager().addExperience(Skill.HITPOINTS, Math.floor(hitDamage * .70), true);

        // Magic xp was already added
        if (hit.getCombatType() === CombatType.MAGIC) {
            return;
        }

        // Add all other skills xp
        let exp = hit.getSkills();
        for (let i of exp) {
            let skill = Skill.values()[i];
            if (!skill) {
                continue;
            }
            player.getSkillManager().addExperience(skill, Math.floor(hitDamage / exp.length), true);
        }
    }

    public static isAttacking(character: Mobile): boolean {
        return character.getCombat().getTarget() != null;
    }

    public static isBeingAttacked(character: Mobile): boolean {
        return character.getCombat().getAttacker() != null;
    }

    public static inCombat(character: Mobile): boolean {
        return CombatFactory.isAttacking(character) || CombatFactory.isBeingAttacked(character);
    }

    public static poisonEntity(entity: Mobile, poisonType: CombatPoisonData) {
        // We are already poisoned or the poison type is invalid, do nothing.
        if (entity.isPoisoned()) {
            return;
        }

        // If the entity is a player, we check for poison immunity. If they have
        // no immunity then we send them a message telling them that they are
        // poisoned.
        if (entity.isPlayer()) {
            let player = (entity as Player);
            if (!player.getCombat().getPoisonImmunityTimer().finished()) {
                return;
            }
            player.getPacketSender().sendMessage("You have been poisoned!");
            if (poisonType === PoisonType.VENOM) {
                player.getPacketSender().sendPoisonType(2);
            } else {
                player.getPacketSender().sendPoisonType(1);
            }
        }

        entity.setPoisonDamage(CombatPoisonData.getDemage());
        TaskManager.submit(new CombatPoisonEffect(entity));
    }

    public static disableProtectionPrayers(player: Player) {
        // Player has already been prayer-disabled
        if (!player.getCombat().getPrayerBlockTimer().finished()) {
            return;
        }
        player.getCombat().getPrayerBlockTimer().start(200);
        PrayerHandler.resetPrayers(player, PrayerHandler.PROTECTION_PRAYERS);
        player.getPacketSender().sendMessage("You have been disabled and can no longer use protection prayers.");
    }

    public static handleRecoil(player: Player, attacker: Mobile, damage: number) {
        if (damage == 0) {
            return;
        }
        const RECOIL_DMG_MULTIPLIER = 0.1;
        let returnDmg = Math.floor(Math.random() * 3) + 1 === 2 ? 0 : (damage * RECOIL_DMG_MULTIPLIER) + 1;

        // Increase recoil damage for a player.
        player.setRecoilDamage(player.getRecoilDamage() + returnDmg);

        // Deal damage back to attacker
        attacker.getCombat().getHitQueue().addPendingDamage([new HitDamage(returnDmg, HitMask.RED)]);

        // Degrading ring of recoil for a player.
        if (player.getRecoilDamage() >= 40) {
            player.getEquipment().set(Equipment.RING_SLOT, new Item(-1));
            player.getEquipment().refreshItems();
            player.getPacketSender().sendMessage("Your ring of recoil has degraded.");
            player.setRecoilDamage(0);
        }
    }

    public static handleVengeance(character: Mobile, attacker: Mobile, damage: number) {
        let returnDmg = Math.floor(damage * 0.75);
        if (returnDmg <= 0) {
            return;
        }
        attacker.getCombat().getHitQueue().addPendingDamage([new HitDamage(returnDmg, HitMask.RED)]);
        character.forceChat("Taste Vengeance!");
        character.setHasVengeance(false);
    }

    public static handleGuthans(player: Player, target: Mobile, damage: number) {
        target.performGraphic(new Graphic(398));
        player.heal(damage);
    }
    /**
    
    Checks if a player should be skulled or not.
    
    @param attacker
    
    @param target
    */
    public static handleSkull(attacker: Player, target: Player) {
        if (attacker.isSkulled()) {
            return;
        }

        const attackerInWilderness = Wilderness.isIn(attacker);
        const targetInWilderness = Wilderness.isIn(target);
        if (!attackerInWilderness || !targetInWilderness) {
            return;
        }

        // Player bots should behave as players so we don't check them here...

        // We've probably already been skulled by this player.
        const targetHasDamagedAttacker = target.getCombat().damageMapContains(attacker);
        const attackerHasDamagedTarget = attacker.getCombat().damageMapContains(target);
        if (targetHasDamagedAttacker || attackerHasDamagedTarget) {
            return;
        }

        if (
            target.getCombat().getAttacker() != null &&
            target.getCombat().getAttacker() == attacker
        ) {
            return;
        }

        if (
            attacker.getCombat().getAttacker() != null &&
            attacker.getCombat().getAttacker() == target
        ) {
            return;
        }

        CombatFactory.skull(attacker, SkullType.WHITE_SKULL, 300);
    }

    static skull(player: Player, type: SkullType, seconds: number) {
        player.setSkullType(type);
        player.setSkullTimer(Misc.getTicks(seconds));
        player.getUpdateFlag().flag(Flag.APPEARANCE);
        if (type == SkullType.RED_SKULL) {
            player.getPacketSender().sendMessage(
                "@bla@You have received a @red@red skull@bla@! You can no longer use the Protect item prayer!");
            PrayerHandler.deactivatePrayer(player, PrayerHandler.PROTECT_ITEM);
        } else if (type == SkullType.WHITE_SKULL) {
            player.getPacketSender().sendMessage("You've been skulled!");
        }
    }

    static stun(character: Mobile, seconds: number, force: boolean) {
        if (!force) {
            if (character.getTimers().has(TimerKey.STUN)) {
                return;
            }
        }

        character.getTimers().registers(TimerKey.STUN, Misc.getTicks(seconds));
        character.getCombat().reset();
        character.getMovementQueue().reset();
        character.performGraphic(new Graphic(348, GraphicHeight.HIGH));

        if (character.isPlayer()) {
            character.getAsPlayer().getPacketSender().sendMessage("You've been stunned!");
        }
    }

    static handleRetaliation(attacker: Mobile, target: Mobile) {
        if (!CombatFactory.isAttacking(target)) {
            let auto_ret = false;
            if (target.isPlayer()) {
                auto_ret =
                    target.isPlayerBot() ||
                    (target.getAsPlayer().autoRetaliateReturn() && !target.getMovementQueue().isMovings());
            } else if (target.isNpc()) {
                auto_ret = target.getAsNpc().getMovementCoordinator().getCoordinateState() == CoordinateState.HOME;
            }

            if (!auto_ret) {
                return;
            }

            if (target.getMovementQueue) {
                target.getMovementQueue().reset();
            }
            TaskManager.submit(new CombatFactoryTask(1, target, false, () => {
                target.getCombat().attack(attacker);
            }));
        }
    }

    static freeze(character: Mobile, seconds: number) {
        if (character.getTimers().has(TimerKey.FREEZE) || character.getTimers().has(TimerKey.FREEZE_IMMUNITY)) {
            return;
        }

        if (character.getSize() > 2) {
            return;
        }

        const ticks = Misc.getTicks(seconds);
        character.getTimers().registers(TimerKey.FREEZE, ticks);
        character.getTimers().registers(TimerKey.FREEZE_IMMUNITY, ticks + Misc.getTicks(3));
        character.getMovementQueue().reset();

        if (character.isPlayer()) {
            character.getAsPlayer().getPacketSender().sendMessage("You have been frozen!").sendEffectTimer(seconds, EffectTimer.FREEZE);
        }
    }

    private static handleRedemption(attacker: Mobile, victim: Player, damage: number) {
        if ((victim.getHitpoints() - damage) <= (victim.getSkillManager().getMaxLevel(Skill.HITPOINTS) / 10)) {
            const amountToHeal = (victim.getSkillManager().getMaxLevel(Skill.PRAYER) * .25);
            victim.performGraphic(new Graphic(436));
            victim.getSkillManager().setCurrentLevels(Skill.PRAYER, 0);
            victim.getSkillManager().setCurrentLevels(Skill.HITPOINTS, victim.getHitpoints() + amountToHeal);
            victim.getPacketSender().sendMessage("You've run out of prayer points!");
            PrayerHandler.deactivatePrayers(victim);
        }
    }

    private static handleSmite(attacker: Mobile, victim: Player, damage: number) {
        victim.getSkillManager().decreaseCurrentLevel(Skill.PRAYER, (damage / 4), 0);
    }

    static handleRetribution(killed: Player, killer: Player) {
        killed.performGraphic(new Graphic(437));
        if (killer.getLocation().isWithinDistance(killer.getLocation(), CombatConstants.RETRIBUTION_RADIUS)) {
            killer.getCombat().getHitQueue().addPendingDamage([
                new HitDamage(Misc.getRandom(CombatConstants.MAXIMUM_RETRIBUTION_DAMAGE), HitMask.RED)]);
        }
    }

    public static checkAmmo(player: Player, amountRequired: number): boolean {
        const rangedWeapon = player.getCombat().getRangedWeapon();
        const ammoData = player.getCombat().getAmmunition();

        if (rangedWeapon == null) {
            player.getCombat().reset();
            return false;
        }

        if (rangedWeapon === RangedWeapon.TOXIC_BLOWPIPE) {
            if (player.getBlowpipeScales() <= 0) {
                player.getPacketSender().sendMessage("You must recharge your Toxic blowpipe using some Zulrah scales.");
                player.getCombat().reset();
                return false;
            }
            return true;
        }

        if (ammoData == null) {
            player.getPacketSender().sendMessage("You don't have any ammunition to fire.");
            player.getCombat().reset();
            return false;
        }

        if (CombatFactory.usesWeaponSlotAmmo(rangedWeapon)) {
            const weaponSlotItem = player.getEquipment().getItems()[Equipment.WEAPON_SLOT];
            if (weaponSlotItem.getId() == -1 || weaponSlotItem.getAmount() < amountRequired) {
                player.getPacketSender().sendMessage("You don't have the required amount of ammunition to fire that.");
                player.getCombat().reset();
                return false;
            }
            return true;
        }

        let ammoSlotItem = player.getEquipment().getItems()[Equipment.AMMUNITION_SLOT];
        if (ammoSlotItem.getId() == -1 || ammoSlotItem.getAmount() < amountRequired) {
            player.getPacketSender().sendMessage("You don't have the required amount of ammunition to fire that.");
            player.getCombat().reset();
            return false;
        }

        let properReq = false;

        // BAD LOOP
        for (let d of rangedWeapon.getAmmunitionData()) {
            if (d == ammoData) {
                if (d.getItemId() == ammoSlotItem.getId()) {
                    properReq = true;
                    break;
                }
            }
        }

        if (!properReq) {
            let ammoName = ammoSlotItem.getDefinition().getName(),
                weaponName = player.getEquipment().getItems()[Equipment.WEAPON_SLOT].getDefinition().getName(),
                add = !ammoName.endsWith("s") && !ammoName.endsWith("(e)") ? "s" : "";
            player.getPacketSender().sendMessage("You can not use " + ammoName + "" + add + " with "
                + Misc.anOrA(weaponName) + " " + weaponName + ".");
            player.getCombat().reset();
            return false;
        }

        return true;
    }

    public static decrementAmmo(player: Player, pos: Location, amount: number) {
        // Get the ranged weapon data
        const rangedWeapon = player.getCombat().getRangedWeapon();

        // Determine which slot we are decrementing ammo from.
        let slot = Equipment.AMMUNITION_SLOT;

        // Thrown weapons consume ammunition from the weapon slot.
        if (CombatFactory.usesWeaponSlotAmmo(rangedWeapon)) {
            slot = Equipment.WEAPON_SLOT;
        }

        let accumalator = player.getEquipment().get(Equipment.CAPE_SLOT).getId() == 10499;
        if (accumalator) {
            if (Misc.getRandom(12) <= 9) {
                return;
            }
        }

        if (rangedWeapon == RangedWeapon.TOXIC_BLOWPIPE) {
            if (player.decrementAndGetBlowpipeScales() <= 0) {
                player.getPacketSender().sendMessage("Your Toxic blowpipe has run out of scales!");
                player.getCombat().reset();
            }
            return;
        }

        player.getEquipment().get(slot).decrementAmountBy(amount);

        // Drop arrows if the player isn't using an accumalator
        if (player.getCombat().getAmmunition().dropOnFloor()) {
            if (!accumalator) {
                /*
                for(let i = 0; i < amount; i++) {
                    GroundItemManager.spawnGroundItem(player,
                    new GroundItem(new Item(player.getEquipment().get(slot).getId()), pos,
                    player.getUsername(), false, 120, true, 120));
                }
                */
            }
        }

        // If we are at 0 ammo remove the item from the equipment completely.
        if (player.getEquipment().get(slot).getAmount() == 0) {
            player.getPacketSender().sendMessage("You have run out of ammunition!");
            player.getEquipment().set(slot, new Item(-1));

            if (slot == Equipment.WEAPON_SLOT) {
                WeaponInterfaces.assign(player);
                player.getUpdateFlag().flag(Flag.APPEARANCE);
            }
        }

        // Refresh the equipment interface.
        player.getEquipment().refreshItems();
    }

    private static usesWeaponSlotAmmo(rangedWeapon: RangedWeapon): boolean {
        if (!rangedWeapon) {
            return false;
        }

        const ammunitionData = rangedWeapon.getAmmunitionData();
        const weaponIds = rangedWeapon.getWeaponIds();
        if (!Array.isArray(ammunitionData) || ammunitionData.length !== 1 || !Array.isArray(weaponIds)) {
            return false;
        }

        const baseThrownItemId = ammunitionData[0]?.getItemId?.();
        return Number.isInteger(baseThrownItemId) && weaponIds.includes(baseThrownItemId);
    }

}


export enum CanAttackResponse {
    INVALID_TARGET,
    ALREADY_UNDER_ATTACK,
    CANT_ATTACK_IN_AREA,
    COMBAT_METHOD_NOT_ALLOWED,
    LEVEL_DIFFERENCE_TOO_GREAT,
    NOT_ENOUGH_SPECIAL_ENERGY,
    STUNNED,
    DUEL_NOT_STARTED_YET,
    DUEL_MELEE_DISABLED,
    DUEL_RANGED_DISABLED,
    DUEL_MAGIC_DISABLED,
    DUEL_WRONG_OPPONENT,
    TARGET_IS_IMMUNE,
    CAN_ATTACK,
}


class CombatFactoryTask extends Task{
    constructor(n1: number, target: Mobile, bool: boolean, private readonly execFunc: Function){
        super(n1, target, bool)
    }

    execute(): void {
        this.execFunc();
        this.stop();
    }
    
}
