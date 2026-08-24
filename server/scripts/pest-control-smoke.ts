import assert = require("node:assert/strict");

const plugin = require("../plugins/minigames/PestControl.plugin.js");
const { BOATS, PEST_IDS, PORTAL_ORDERS, choosePortalOrder, clampActivity, botsNeeded, BOT_EQUIPMENT, moveBetweenAreas, constants } = plugin._test;

assert.equal(plugin.name, "PestControl");
assert.deepEqual(constants, {
    LANDER_OVERLAY: 407,
    GAME_OVERLAY: 408,
    ACTIVITY_VARBIT: 5662,
    MIN_PLAYERS: 5,
    MAX_PLAYERS: 25,
});
assert.deepEqual(BOATS.map((boat: any) => [boat.key, boat.level, boat.points, boat.portalHp]), [
    ["novice", 40, 3, 200],
    ["intermediate", 70, 4, 250],
    ["veteran", 100, 5, 250],
]);
assert.deepEqual(BOATS.map((boat: any) => [boat.gangplankId, boat.exitId, boat.squireId]), [
    [14315, 14314, 1771],
    [25631, 25629, 1772],
    [25632, 25630, 1773],
]);
assert.deepEqual(BOATS[0].unshieldedIds, [1747, 1748, 1749, 1750]);
assert.deepEqual(BOATS[0].shieldedIds, [1751, 1752, 1753, 1754]);
for (const boat of BOATS.slice(1)) {
    assert.deepEqual(boat.unshieldedIds, [1739, 1740, 1741, 1742]);
    assert.deepEqual(boat.shieldedIds, [1743, 1744, 1745, 1746]);
}
for (const tiers of Object.values(PEST_IDS) as number[][][]) {
    assert.equal(tiers.length, 3);
    assert.ok(tiers.flat().every(Number.isInteger));
}
assert.equal(PORTAL_ORDERS.length, 6);
for (const order of PORTAL_ORDERS) {
    assert.equal(order.length, 4);
    assert.equal(new Set(order).size, 4);
    assert.notEqual(order[0], "red");
}
assert.deepEqual(choosePortalOrder(() => 0), PORTAL_ORDERS[0]);
assert.deepEqual(choosePortalOrder(() => 0.999), PORTAL_ORDERS[5]);
assert.equal(clampActivity(-1), 0);
assert.equal(clampActivity(101), 100);
assert.equal(botsNeeded(1), 4);
assert.equal(botsNeeded(5), 0);
assert.deepEqual(BOT_EQUIPMENT.map(([, itemId]: number[]) => itemId), [1163, 6570, 1704, 4587, 1127, 1201, 1079, 7462, 4131]);

const currentArea = { left: false, leave() { this.left = true; } };
const nextArea = { entered: false, enter() { this.entered = true; } };
const player: any = {
    area: currentArea,
    getArea() { return this.area; },
    setArea(area: any) { this.area = area; },
    moveTo(location: any) { this.location = location; },
};
const destination = { x: 1, y: 2 };
moveBetweenAreas(player, nextArea, destination);
assert.equal(currentArea.left, true);
assert.equal(nextArea.entered, true);
assert.equal(player.area, nextArea);
assert.equal(player.location, destination);

console.log("Pest Control smoke checks passed.");
