import * as assert from "node:assert/strict";

import { MobileList } from "../src/main/typescript/elvarg/game/entity/impl/MobileList";

let registered = false;
let index = -1;
const mobile = {
    isRegistered: () => registered,
    setRegistered: (value: boolean) => {
        registered = value;
    },
    getIndex: () => index,
    setIndex: (value: number) => {
        index = value;
    },
    onAdd() {},
    onRemove() {},
};
const events: string[] = [];
const list = new MobileList<any>(2, () => events.push("added"), () => events.push("removed"));

assert(list.add(mobile));
assert.deepEqual(events, ["added"]);
list.remove(mobile);
assert.deepEqual(events, ["added", "removed"]);

console.info("MobileList spatial hook smoke test passed");
