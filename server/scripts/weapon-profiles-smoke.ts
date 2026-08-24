import * as assert from "node:assert/strict";
import { FightType } from "../src/main/typescript/elvarg/game/content/combat/FightType";
import { Ammunition, RangedWeapon } from "../src/main/typescript/elvarg/game/content/combat/ranged/RangedData";
import { WeaponProfiles } from "../src/main/typescript/elvarg/game/content/combat/WeaponProfile";
import { WeaponInterfaces } from "../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces";
import { Equipment } from "../src/main/typescript/elvarg/game/model/container/impl/Equipment";
import { ItemIdentifiers } from "../src/main/typescript/elvarg/util/ItemIdentifiers";

const player = (itemId: number, weapon: WeaponInterfaces, fightType: FightType): any => {
    const items: Array<{ getId: () => number }> = Array.from({ length: 14 }, () => ({ getId: () => -1 }));
    items[Equipment.WEAPON_SLOT] = { getId: () => itemId };
    return {
    getEquipment: () => ({ getItems: () => items }),
    getWeapon: () => weapon,
    getFightType: () => fightType,
    };
};

const darkBow = player(11235, WeaponInterfaces.DARK_BOW, FightType.LONGBOW_ACCURATE);
assert.deepEqual(WeaponProfiles.hitDelays(darkBow, 7), [2, 4]);
assert.equal(WeaponProfiles.ranged(darkBow).ammoRequired, 2);
assert.equal(WeaponProfiles.attackDistance(darkBow, 6), 9);

const crossbow = player(9185, WeaponInterfaces.CROSSBOW, FightType.CROSSBOW_LONGRANGE);
assert.equal(WeaponProfiles.attackAnimation(crossbow, -1), 4230);
assert.equal(WeaponProfiles.attackDistance(crossbow, 6), 9);
assert.equal(WeaponProfiles.get(crossbow)?.boltEffects, true);

const crystalBow = player(ItemIdentifiers.CRYSTAL_BOW_3, WeaponInterfaces.LONGBOW, FightType.LONGBOW_ACCURATE);
assert.equal(RangedWeapon.getFor(crystalBow), RangedWeapon.CRYSTAL_BOW);
assert.equal(Ammunition.getFor(crystalBow), Ammunition.CRYSTAL_BOW);

console.info("weapon profiles smoke passed");
