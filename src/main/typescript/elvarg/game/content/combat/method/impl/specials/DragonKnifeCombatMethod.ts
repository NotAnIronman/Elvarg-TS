import { RangedCombatMethod } from "../RangedCombatMethod";
import { Animation } from "../../../../../model/Animation";
import { PendingHit } from "../../../hit/PendingHit";
import { Mobile } from "../../../../../entity/impl/Mobile";
import { CombatSpecial } from "../../../CombatSpecial";
import { RangedData } from "../../../ranged/RangedData";
import { Projectile } from "../../../../../model/Projectile";
import { ItemIdentifiers } from "../../../../../../util/ItemIdentifiers";
import { Equipment } from "../../../../../model/container/impl/Equipment";
import { Item } from "../../../../../model/Item";
import { WeaponInterfaces } from "../../../WeaponInterfaces";
import { Flag } from "../../../../../model/Flag";
import { Sound } from "../../../../../Sound";
import { Sounds } from "../../../../../Sounds";

export class DragonKnifeCombatMethod extends RangedCombatMethod {
    private static readonly ANIMATION = new Animation(8292);

    hits(character: Mobile, target: Mobile): PendingHit[] {
        const distance = character.getLocation().getDistance(target.getLocation());
        const hitDelay = RangedData.hitDelay(distance, character.getCombat().getRangedWeapon());
        return [
            new PendingHit(character, target, this, hitDelay),
            new PendingHit(character, target, this, hitDelay)
        ];
    }

    canAttack(character: Mobile, target: Mobile): boolean {
        if (!character.isPlayer()) {
            return false;
        }
        const weaponId = character.getAsPlayer().getEquipment().get(Equipment.WEAPON_SLOT).getId();
        return weaponId === ItemIdentifiers.DRAGON_KNIFE
            || weaponId === ItemIdentifiers.DRAGON_KNIFE_P_
            || weaponId === ItemIdentifiers.DRAGON_KNIFE_P_PLUS_
            || weaponId === ItemIdentifiers.DRAGON_KNIFE_P_PLUS_PLUS_;
    }

    start(character: Mobile, target: Mobile): void {
        const player = character.getAsPlayer();
        CombatSpecial.drain(player, CombatSpecial.DRAGON_KNIFE.getDrainAmount());
        player.performAnimation(DragonKnifeCombatMethod.ANIMATION);
        Sounds.sendSound(character, Sound.THROW_DART);
        Projectile.createProjectile(character, target, 1629, 30, 60, 40, 36).sendProjectile();
        DragonKnifeCombatMethod.decrementThrownWeapon(player, 1);
    }

    private static decrementThrownWeapon(player: any, amount: number): void {
        const item = player.getEquipment().get(Equipment.WEAPON_SLOT);
        item.decrementAmountBy(amount);

        if (item.getAmount() <= 0) {
            player.getPacketSender().sendMessage("You have run out of ammunition!");
            player.getEquipment().set(Equipment.WEAPON_SLOT, new Item(-1));
            WeaponInterfaces.assign(player);
            player.getUpdateFlag().flag(Flag.APPEARANCE);
        }

        player.getEquipment().refreshItems();
    }
}
