import assert from "node:assert/strict";

import { EquipmentSlot } from "../rs/config/player/Equipment";
import { Gender, PlayerAppearance } from "../rs/config/player/PlayerAppearance";
import { PlayerModelLoader } from "../rs/config/player/PlayerModelLoader";

function composedKits(wearPos2: number): number[] {
    const item = { wearPos: 4, wearPos2, wearPos3: -1 };
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
    equip[EquipmentSlot.BODY] = 100;
    loader.buildStaticModelFromEquipment(
        new PlayerAppearance(Gender.MALE, [0, 0, 0, 0, 0], [10, 11, 12, 13, 14, 15, 16], equip),
        equip,
    );
    assert.ok(result);
    return result.kits;
}

assert.deepEqual(composedKits(-1).slice(2, 4), [-1, 13], "chainbody must retain arms");
assert.deepEqual(composedKits(6).slice(2, 4), [-1, -1], "platebody must hide arms");

console.log("Player equipment arm-slot regression test passed");
