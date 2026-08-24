import assert = require("node:assert/strict");
import { NpcIdentifiers } from "../src/main/typescript/elvarg/util/NpcIdentifiers";

const plugin = require("../plugins/npcs/Dragons.plugin.js");
const registrations: Array<{ ids: number[]; method: new () => any }> = [];

plugin.register({
    getPrayerHandler: () => ({}),
    registerNpcCombatMethodProvider: (ids: number[], method: new () => any) => registrations.push({ ids, method }),
});

assert.equal(registrations.length, 3);
const registered = new Set(registrations.flatMap(({ ids }) => ids));
for (const id of [
    NpcIdentifiers.GREEN_DRAGON,
    NpcIdentifiers.BLUE_DRAGON,
    NpcIdentifiers.RED_DRAGON,
    NpcIdentifiers.BLACK_DRAGON,
    NpcIdentifiers.BRUTAL_GREEN_DRAGON,
    NpcIdentifiers.BRUTAL_BLUE_DRAGON,
    NpcIdentifiers.BRUTAL_RED_DRAGON,
    NpcIdentifiers.BRUTAL_BLACK_DRAGON,
    NpcIdentifiers.BRONZE_DRAGON,
    NpcIdentifiers.IRON_DRAGON,
    NpcIdentifiers.STEEL_DRAGON,
    NpcIdentifiers.MITHRIL_DRAGON,
    NpcIdentifiers.ADAMANT_DRAGON,
    NpcIdentifiers.RUNE_DRAGON,
    NpcIdentifiers.LAVA_DRAGON,
    NpcIdentifiers.REANIMATED_DRAGON,
    NpcIdentifiers.FROST_DRAGON,
]) {
    assert.ok(registered.has(id), `dragon ${id} should use dragonfire`);
}

assert.ok(!registered.has(NpcIdentifiers.BABY_GREEN_DRAGON));
assert.ok(!registered.has(NpcIdentifiers.KING_BLACK_DRAGON));
assert.equal(new registrations[0].method().attackDistance(), 1);
assert.equal(new registrations[1].method().attackDistance(), 8);
assert.equal(new registrations[2].method().attackDistance(), 8);

console.log("dragon plugin smoke checks passed");
