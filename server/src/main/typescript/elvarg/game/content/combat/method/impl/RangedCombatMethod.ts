import { CombatMethod } from "../CombatMethod";
import { CombatType } from "../../CombatType";
import { CombatFactory } from "../../CombatFactory";
import { PendingHit } from "../../hit/PendingHit";
import { Mobile } from "../../../../entity/impl/Mobile";
import { Animation } from "../../../../model/Animation";
import { Projectile } from "../../../../model/Projectile";
import { Sound } from "../../../../Sound";
import { Sounds } from "../../../../Sounds";
import { WeaponProfiles } from "../../WeaponProfile";
export class RangedCombatMethod extends CombatMethod {
    type(): CombatType {
        return CombatType.RANGED;
    }

    hits(character: Mobile, target: Mobile): PendingHit[] {
        const distance = character.getLocation().getDistance(target.getLocation());
        const delays = character.isPlayer() ? WeaponProfiles.hitDelays(character.getAsPlayer(), distance) : [1];
        return delays.map((delay) => new PendingHit(character, target, this, delay));
    }

    canAttack(character: Mobile, target: Mobile): boolean {
        if (character.isNpc()) {
            return true;
        }

        const p = character.getAsPlayer();

        if (!CombatFactory.checkAmmo(p, WeaponProfiles.ranged(p).ammoRequired ?? 1)) {
            return false;
        }
        return true;
    }

    start(character: Mobile, target: Mobile) {
        const ammo = character.getCombat().getAmmunition();
        const rangedWeapon = character.getCombat().getRangedWeapon();
        const animation = character.getAttackAnim();

        if (animation !== -1) {
            character.performAnimation(new Animation(animation));
        }

        const profile = character.isPlayer() ? WeaponProfiles.ranged(character.getAsPlayer()) : null;
        if (ammo?.getStartGraphic() && profile?.startGraphic !== false) {
            character.performGraphic(ammo.getStartGraphic());
        }

        if (!rangedWeapon || !ammo) {
            return;
        }

        const projectiles = profile?.projectiles ?? [{ delay: 40, speed: 57, startHeight: 43, endHeight: 31 }];
        for (const projectile of projectiles) {
            Projectile.createProjectile(character, target, ammo.getProjectileId(), projectile.delay, projectile.speed, projectile.startHeight, projectile.endHeight).sendProjectile();
        }
        Sounds.sendSound(character, profile?.fireSound ?? Sound.SHOOT_ARROW);

        if (character.isPlayer()) {
            CombatFactory.decrementAmmo(character.getAsPlayer(), target.getLocation(), profile?.ammoRequired ?? 1);
        }
    }

    attackDistance(character: Mobile): number {
        return character.isPlayer() ? WeaponProfiles.attackDistance(character.getAsPlayer(), 6) : 6;
    }

}
