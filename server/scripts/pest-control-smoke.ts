import assert = require("node:assert/strict");
import { GameObject } from "../src/main/typescript/elvarg/game/entity/impl/object/GameObject";
import { ObjectManager, OperationType } from "../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager";
import { MapObjects } from "../src/main/typescript/elvarg/game/entity/impl/object/MapObjects";
import { World } from "../src/main/typescript/elvarg/game/World";
import { Boundary } from "../src/main/typescript/elvarg/game/model/Boundary";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { PrivateArea } from "../src/main/typescript/elvarg/game/model/areas/impl/PrivateArea";

const plugin = require("../plugins/minigames/PestControl.plugin.js");
const { BOATS, PEST_IDS, PORTAL_ORDERS, choosePortalOrder, clampActivity, botsNeeded, moveBetweenAreas, adoptPendingBots, chooseDefenceTarget, gateGroupKey, releaseMatchPlayer, cleanupMatchNpcs, resetStructures, constants } = plugin._test;

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
assert.equal(botsNeeded(1), 24);
assert.equal(botsNeeded(25), 0);

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

let botLogoutRequested = false;
let botMoved = false;
let botLeft = false;
const finishedBot: any = {
    isPlayerBot: () => true,
    setAttribute: () => undefined,
    getForcedLogoutTimer: () => ({ start: () => undefined }),
    requestLogout: () => { botLogoutRequested = true; },
    moveTo: () => { botMoved = true; },
};
releaseMatchPlayer(finishedBot, { leave: () => { botLeft = true; } });
assert.equal(botLogoutRequested, true);
assert.equal(botMoved, false);
assert.equal(botLeft, false);

const pendingNpc: any = {
    isRegistered: () => false,
    getCombat: () => ({ reset: () => undefined }),
    getMovementQueue: () => ({ reset: () => undefined }),
    setVisible(value: boolean) { this.visible = value; },
};
const activeNpc: any = { ...pendingNpc, isRegistered: () => true };
const npcSet = new Set([pendingNpc, activeNpc]);
const addNpcQueue = [pendingNpc];
const removeNpcQueue: any[] = [];
cleanupMatchNpcs(npcSet, {
    getAddNPCQueue: () => addNpcQueue,
    getRemoveNPCQueue: () => removeNpcQueue,
});
assert.equal(npcSet.size, 0);
assert.deepEqual(addNpcQueue, []);
assert.deepEqual(removeNpcQueue, [activeNpc]);
assert.equal(pendingNpc.visible, false);
assert.equal(activeNpc.visible, false);

const damagedStructure: any = { damage: 3, open: true };
const fullStructure: any = { damage: 0, open: false };
const replacedStructures: any[] = [];
resetStructures(new Map([["damaged", damagedStructure], ["full", fullStructure]]), (state: any) => replacedStructures.push(state));
assert.deepEqual(damagedStructure, { damage: 0, open: false });
assert.deepEqual(replacedStructures, [damagedStructure]);

const waitingState: any = { boat: BOATS[0], queue: [] };
const waitingArea = { enter(bot: any) { bot.setArea(this); waitingState.queue.push(bot); } };
waitingState.area = waitingArea;
const pendingBot: any = {
    area: null,
    location: null,
    isPlayerBot() { return true; },
    getAttribute(key: string) { return key === "pest-control:waiting-boat" ? "novice" : null; },
    getArea() { return this.area; },
    setArea(area: any) { this.area = area; },
    moveTo(location: any) { this.location = location; },
};
adoptPendingBots(waitingState, [pendingBot]);
assert.equal(pendingBot.area, waitingArea);
assert.ok(pendingBot.location.equals(BOATS[0].waitingLocation));
assert.deepEqual(waitingState.queue, [pendingBot]);

const matchArea = {};
let landedAttacker: any = null;
const pendingAttackers = new Set();
const knight: any = {
    getPrivateArea: () => matchArea,
    getCombat: () => ({
        getAttacker: () => landedAttacker,
        getHitQueue: () => ({ hasPendingHitFrom: (npc: any) => pendingAttackers.has(npc) }),
    }),
};
const pest = (type: string, target: any = knight, area: any = matchArea): any => ({
    __pcType: type,
    getHitpoints: () => 10,
    isRegistered: () => true,
    getPrivateArea: () => area,
    getCombat: () => ({ getTarget: () => target }),
});
const torcher = pest("torcher");
const defiler = pest("defiler");
const idleBrawler = pest("brawler", null);
pendingAttackers.add(torcher);
pendingAttackers.add(defiler);
assert.equal(chooseDefenceTarget(knight, [torcher, defiler, idleBrawler], () => 0), torcher);
assert.equal(chooseDefenceTarget(knight, [torcher, defiler, idleBrawler], () => 0.999), defiler);
pendingAttackers.clear();
landedAttacker = defiler;
assert.equal(chooseDefenceTarget(knight, [torcher, defiler], () => 0), defiler);
landedAttacker = null;
assert.equal(chooseDefenceTarget(knight, [torcher, idleBrawler, pest("shifter", knight, {})], () => 0), null);
assert.deepEqual([
    gateGroupKey(new Location(2643, 2592)),
    gateGroupKey(new Location(2670, 2592)),
    gateGroupKey(new Location(2656, 2585)),
], ["west", "east", "south"]);

const baseGate = new GameObject(14233, new Location(3200, 3200), 0, 0, null);
MapObjects.mapObjects.set(MapObjects.getHash(3200, 3200, 0), [baseGate]);
const privateArea = new (class extends PrivateArea {})([new Boundary(3200, 3200, 3200, 3200)]);
const privateGate = new GameObject(14233, new Location(3200, 3200), 0, 0, privateArea);
MapObjects.remove(privateGate);
assert.deepEqual(MapObjects.mapObjects.get(MapObjects.getHash(3200, 3200, 0)), [baseGate]);
privateArea.detach(privateGate);
assert.equal(privateGate.getPrivateArea(), privateArea);
assert.deepEqual(privateArea.getObjects(), []);

let privateObjectUpdates = 0;
const originalForEachNetworkPlayer = World.forEachNetworkPlayer;
const originalMapObjectAdd = MapObjects.add;
(World as any).forEachNetworkPlayer = (consumer: (player: any) => void) => consumer({
    getPrivateArea: () => privateArea,
    getSession: () => ({ isTileInScene: () => false }),
    getPacketSender: () => ({ sendObject: () => { privateObjectUpdates++; } }),
});
(MapObjects as any).add = () => undefined;
try {
    ObjectManager.perform(privateGate, OperationType.SPAWN);
    assert.equal(privateObjectUpdates, 1);
} finally {
    (World as any).forEachNetworkPlayer = originalForEachNetworkPlayer;
    (MapObjects as any).add = originalMapObjectAdd;
}
World.getRemovedObjects().push(privateGate);
privateArea.destroy();
assert.equal(World.getRemovedObjects().includes(privateGate), false);

console.log("Pest Control smoke checks passed.");
