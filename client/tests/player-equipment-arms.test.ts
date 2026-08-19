import assert from "node:assert/strict";

import { EquipmentSlot } from "../rs/config/player/Equipment";
import { Gender, PlayerAppearance } from "../rs/config/player/PlayerAppearance";
import { PlayerModelLoader } from "../rs/config/player/PlayerModelLoader";

function composedKits(wearPos: number, wearPos2: number, wearPos3 = -1): number[] {
    const item = { wearPos, wearPos2, wearPos3 };
    const loader = new PlayerModelLoader(
        { getCount: () => 0 } as any,
        { load: () => item } as any,
        {} as any,
        {} as any,
    );
    let result: PlayerAppearance | undefined;
    (loader as any).buildStaticModel = (appearance: PlayerAppearance) => {
        result = appearance;
        return {};
    };
    const equip = new Array(14).fill(-1);
    equip[wearPos === 0 ? EquipmentSlot.HEAD : EquipmentSlot.BODY] = 100;
    loader.buildStaticModelFromEquipment(
        new PlayerAppearance(Gender.MALE, [0, 0, 0, 0, 0], [10, 11, 12, 13, 14, 15, 16], equip),
        equip,
    );
    assert.ok(result);
    return result.kits;
}

assert.deepEqual(composedKits(4, -1).slice(2, 4), [-1, 13], "chainbody must retain arms");
assert.deepEqual(composedKits(4, 6).slice(2, 4), [-1, -1], "platebody must hide arms");
assert.deepEqual(composedKits(0, 8, 11).slice(0, 2), [-1, -1], "full helmets must hide hair and jaw");
assert.deepEqual(composedKits(0, 11).slice(0, 2), [10, -1], "masks must retain the head kit");

console.log("Player equipment arm-slot regression test passed");
