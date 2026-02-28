import { Mobile } from "../../entity/impl/Mobile";
import type { Player } from "../../entity/impl/player/Player";
import { CombatFactory } from "./CombatFactory";
import { BonusManager } from "../../model/equipment/BonusManager";
import { CombatMethod } from "./method/CombatMethod";
import { CombatType } from "./CombatType";
import { TaskManager } from "../../task/TaskManager";
import { RestoreSpecialAttackTask } from '../../task/impl/RestoreSpecialAttackTask'
import { Equipment } from "../../model/container/impl/Equipment";
import { DuelRule } from "../Duelling";
import { ItemIdentifiers } from "../../../util/ItemIdentifiers";

class DummyCombatMethod extends CombatMethod {
    start(): void {}
    finished(): void {}
    onCombatBegan(): void {}
    onCombatEnded(): void {}
    handleAfterHitEffects(): void {}
    canAttack(): boolean { return true; }
    attackSpeed(character: Mobile): number { return character.getBaseAttackSpeed(); }
    attackDistance(): number { return 1; }
    type(): CombatType { return CombatType.MELEE; }
    hits(): any[] { return []; }
}
const DUMMY_COMBAT_METHOD = new DummyCombatMethod();


export class CombatSpecial {
    public static readonly ABYSSAL_WHIP = new CombatSpecial (
        [4151, 21371, 15441, 15442, 15443, 15444],
        50,
        1,
        1,
        DUMMY_COMBAT_METHOD,
        null as any
    )
    public static readonly ABYSSAL_TENTACLE = new CombatSpecial(
        [12006],
        50,
        1,
        1,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly BARRELSCHEST_ANCHOR = new CombatSpecial(
        [10887],
        50,
        1.22,
        1.10,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_SCIMITAR = new CombatSpecial(
        [4587],
        55,
        1.00,
        1.25,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_LONGSWORD = new CombatSpecial(
        [1305],
        25,
        1.15,
        1.25,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_MACE =  new CombatSpecial(
        [1434],
        25,
        1.5,
        1.25,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_WARHAMMER =  new CombatSpecial (
        [13576],
        50,
        1.5,
        1.00,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly SARADOMIN_SWORD = new CombatSpecial(
        [11838],
        100,
        1.0,
        1.0,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly ARMADYL_GODSWORD = new CombatSpecial(
        [11802],
        50,
        1.375,
        2,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly SARADOMIN_GODSWORD = new CombatSpecial(
        [11806],
        50,
        1.1,
        1.5,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly BANDOS_GODSWORD = new CombatSpecial(
        [11804],
        100,
        1.21,
        1.5,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly ZAMORAK_GODSWORD = new CombatSpecial(
        [11808],
        50,
        1.1,
        1.5,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly ABYSSAL_BLUDGEON = new CombatSpecial(
        [13263],
        50,
        1.20,
        1.0,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_HALBERD = new CombatSpecial(
        [3204],
        30,
        1.1,
        1.35,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_DAGGER = new CombatSpecial(
        [1215, 1231, 5680, 5698],
        25,
        1.15,
        1.20,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly ABYSSAL_DAGGER = new CombatSpecial (
        [13271],
        50,
        0.85,
        1.25,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly GRANITE_MAUL = new CombatSpecial(
        [4153, 12848],
        50,
        1,
        1,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DRAGON_CLAWS = new CombatSpecial(
        [13652],
        50,
        1,
        1.35,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly MAGIC_SHORTBOW = new CombatSpecial(
        [ItemIdentifiers.MAGIC_SHORTBOW, ItemIdentifiers.MAGIC_SHORTBOW_I_, ItemIdentifiers.MAGIC_SHORTBOW_3],
        55,
        1,
        1,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly DARK_BOW = new CombatSpecial(
        [11235],
        55,
        1.5,
        1.35,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly ARMADYL_CROSSBOW = new CombatSpecial(
        [11785],
        40,
        1,
        2.0,
        DUMMY_COMBAT_METHOD,
        null
    )
    public static readonly BALLISTA = new CombatSpecial(
        [19481],
        65,
        1.25,
        1.45,
        DUMMY_COMBAT_METHOD,
        null
    )

    constructor(identifiers: any, drainAmount: number, strengthMultiplier: number, accuracyMultiplier: number, combatMethod: CombatMethod, weaponInterface: any){
        this.identifiers = identifiers
        this.drainAmount = drainAmount
        this.strengthMultiplier = strengthMultiplier
        this.accuracyMultiplier = accuracyMultiplier
        this.combatMethod = combatMethod
        this.weaponType = weaponInterface
    }

    SPECIAL_ATTACK_WEAPON_IDS = new Set(Object.values(CombatSpecial).flatMap((cs) => cs.identifiers));

    private drainAmount: number;
    private strengthMultiplier: number;
    private accuracyMultiplier: number;
    private combatMethod: any;
    private weaponType: any;
    private identifiers: [];


    public static checkSpecial(player: Player, special: CombatSpecial): boolean {
        return (
            player.getCombatSpecial() != null &&
            player.getCombatSpecial() == special &&
            player.isSpecialActivated() &&
            player.getSpecialPercentage() >= special.getDrainAmount()
        );
    }

    public static drain(character: Mobile, amount: number) {
        character.decrementSpecialPercentage(amount);

        if (!character.isRecoveringSpecialAttack()) {
            TaskManager.submit(new RestoreSpecialAttackTask(character));
        }

        if (character.isPlayer()) {
            let p = character.getAsPlayer();
            CombatSpecial.updateBar(p);
        }
    }

    public static updateBar(player: Player) {
        const weapon = player.getWeapon();
        if (!weapon || typeof weapon.getSpecialBar !== "function" || typeof weapon.getSpecialMeter !== "function") {
            return;
        }
        if (weapon.getSpecialBar() == -1 || weapon.getSpecialMeter() == -1) {
            return;
        }
        let specialCheck = 10;
        let specialBar = weapon.getSpecialMeter();
        let specialAmount = player.getSpecialPercentage() / 10;

        for (let i = 0; i < 10; i++) {
            player.getPacketSender().sendInterfaceComponentMoval(specialAmount >= specialCheck ? 500 : 0, 0, --specialBar);
            specialCheck--;
        }
        player.getPacketSender().updateSpecialAttackOrb().sendString(
            player.isSpecialActivated()
                ? ("@yel@ Special Attack (" + player.getSpecialPercentage() + "%)")
                : ("@bla@ Special Attack (" + player.getSpecialPercentage() + "%)"),
            weapon.getSpecialMeter()
        );
        player.getPacketSender().sendSpecialAttackState(player.isSpecialActivated());
    }

    public static assign(player: Player) {
        if (player.getWeapon().getSpecialBar() == -1) {
            player.setSpecialActivated(false);
            player.setCombatSpecial(null);
            CombatSpecial.updateBar(player);
            return;
        }

        const equippedWeaponId = player.getEquipment().get(Equipment.WEAPON_SLOT).getId();
        for (let c of Object.values(CombatSpecial)) {
            if (!(c instanceof CombatSpecial)) {
                continue;
            }
            if (c.identifiers.some(id => equippedWeaponId == id)) {
                player.getPacketSender().sendInterfaceDisplayState(player.getWeapon().getSpecialBar(), false);
                player.setCombatSpecial(c);
                return;
            }
        }

        player.getPacketSender().sendInterfaceDisplayState(player.getWeapon().getSpecialBar(), true);
        player.setCombatSpecial(null);
        player.setSpecialActivated(false);
        player.getPacketSender().sendSpecialAttackState(false);
    }

    public static activate(player: Player) {
        if (player.getCombatSpecial() == null) {
            return;
        }

        if (player.getDueling().inDuel() && player.getDueling().getRules()[DuelRule.NO_SPECIAL_ATTACKS.getButtonId()]) {
            return;
        }

        if (player.isSpecialActivated()) {
            player.setSpecialActivated(false);
            CombatSpecial.updateBar(player);
        } else {
            const spec = player.getCombatSpecial();
            player.setSpecialActivated(true);
            CombatSpecial.updateBar(player);

            if (spec == CombatSpecial.GRANITE_MAUL) {
                if (player.getSpecialPercentage() < player.getCombatSpecial().getDrainAmount()) {
                    player.getPacketSender().sendMessage("You do not have enough special attack energy left!");
                    player.setSpecialActivated(false);
                    CombatSpecial.updateBar(player);
                    return;
                }

                const target = player.getCombat().getTarget();
                if (target != null && CombatFactory.getMethod(player).type() == CombatType.MELEE) {
                    player.getCombat().performNewAttack(true);
                    return;
                } else {
                    // Uninformed player using gmaul without being in combat..
                    // Teach them a lesson!
                    player.getPacketSender()
                        .sendMessage("Although not required, the Granite maul special attack should be used during")
                        .sendMessage("combat for maximum effect.");
                }
            }
        }

        if (player.getInterfaceId() == BonusManager.INTERFACE_ID) {
            BonusManager.update(player);
        }
    }

    public getIdentifiers(): number[] {
        return this.identifiers;
    }

    public getDrainAmount(): number {
        return this.drainAmount;
    }

    public getStrengthMultiplier(): number {
        return this.strengthMultiplier;
    }

    public getAccuracyMultiplier(): number {
        return this.accuracyMultiplier;
    }

    public getCombatMethod(): CombatMethod {
        return this.combatMethod;
    }

    public getWeaponType(): any {
        return this.weaponType;
    }

}
