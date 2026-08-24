import assert = require("assert");
import { SkullType } from "../src/main/typescript/elvarg/game/model/SkullType";

const ItemsKeptOnDeath = require("../plugins/interface/ItemsKeptOnDeath.plugin");

const OPEN_BUTTON = (387 << 16) | 5;
const SETTINGS_COMPONENT = (4 << 16) | 12;
const MAIN_MODAL_TARGET_UID = (161 << 16) | 16;
const DEATH_ITEMS_INVENTORY_ID = 584;
const DEATH_ITEM_STATE_INVENTORY_ID = 468;

function item(id: number, value: number, amount = 1, tradeable = true) {
  const definition = {
    getValue: () => value,
    isTradeable: () => tradeable,
  };
  return {
    getId: () => id,
    getAmount: () => amount,
    getDefinition: () => definition,
  };
}

type Sent = { call: string; args: any[] };
const sent: Sent[] = [];
let interfaceId = -1;
const sender: any = {};
for (const call of [
  "sendSubInterface",
  "sendInterfaceScript",
  "sendInterfaceFlagsRange",
  "sendString",
  "sendInterfaceRemoval",
]) {
  sender[call] = (...args: any[]) => {
    sent.push({ call, args });
    return sender;
  };
}

const inventoryItems = [
  item(1, 100),
  item(2, 90),
  item(3, 80),
  item(4, 70, 2),
  item(5, 10_000, 1, false),
];
const equipmentItems = [item(6, 60)];
let skullTimer = 0;
let skullType = SkullType.WHITE_SKULL;
const player: any = {
  protectItem: false,
  busy: () => false,
  getPacketSender: () => sender,
  setInterfaceId: (id: number) => { interfaceId = id; },
  getInterfaceId: () => interfaceId,
  getSkullTimer: () => skullTimer,
  getSkullType: () => skullType,
  getInventory: () => ({ getItems: () => inventoryItems }),
  getEquipment: () => ({ getItems: () => equipmentItems }),
};

const handlers = new Map<number, (event: any) => boolean>();
ItemsKeptOnDeath.register({
  getPrayerHandler: () => ({
    PROTECT_ITEM: 0,
    isActivated: (target: any) => target.protectItem,
  }),
  emitShouldKeepItemOnDeath: () => null,
  onInterfaceActionButton: (buttonId: number, handler: (event: any) => boolean) => {
    handlers.set(buttonId, handler);
  },
});

const lastScript = () =>
  [...sent].reverse().find((entry) => entry.call === "sendInterfaceScript");

assert.equal(handlers.get(OPEN_BUTTON)?.({ player }), true);
assert.equal(interfaceId, 4);
assert.deepEqual(
  sent.find((entry) => entry.call === "sendSubInterface")?.args,
  [MAIN_MODAL_TARGET_UID, 4, 0],
);

let script = lastScript();
assert.ok(script);
assert.deepEqual(script!.args[1], [0, 0, 0, 0, "", 3, 1, 2, 3, -1]);
assert.deepEqual(script!.args[4][DEATH_ITEMS_INVENTORY_ID], {
  capacity: 50,
  slots: [
    { slot: 0, itemId: 4, quantity: 2 },
    { slot: 1, itemId: 5, quantity: 1 },
    { slot: 2, itemId: 6, quantity: 1 },
  ],
});
assert.deepEqual(script!.args[4][DEATH_ITEM_STATE_INVENTORY_ID].slots, [
  { slot: 0, itemId: 1991, quantity: 1 },
  { slot: 1, itemId: 323, quantity: 1 },
  { slot: 2, itemId: 1991, quantity: 1 },
]);
assert.match(
  sent.find((entry) => entry.call === "sendString")!.args[0],
  />200<\//,
);

assert.equal(handlers.get(SETTINGS_COMPONENT)?.({ player, action: 1 }), true);
script = lastScript();
assert.deepEqual(script!.args[1], [1, 0, 0, 0, "", 0, -1, -1, -1, -1]);

assert.equal(handlers.get(SETTINGS_COMPONENT)?.({ player, action: 0 }), true);
script = lastScript();
assert.deepEqual(script!.args[1], [1, 1, 0, 0, "", 1, 1, -1, -1, -1]);

assert.equal(handlers.get(SETTINGS_COMPONENT)?.({ player, action: 2 }), true);
assert.equal(lastScript()!.args[1][3], 1);
assert.equal(handlers.get(SETTINGS_COMPONENT)?.({ player, action: 3 }), true);
assert.equal(lastScript()!.args[1][2], 21);

skullTimer = 1;
skullType = SkullType.RED_SKULL;
assert.equal(handlers.get(OPEN_BUTTON)?.({ player }), true);
assert.equal(lastScript()!.args[1][5], 0, "a red skull protects no items");
assert.equal(handlers.get(SETTINGS_COMPONENT)?.({ player, action: 1 }), true);
assert.equal(lastScript()!.args[1][5], 3, "the skull preview toggle can still be disabled");

console.log("items kept on death interface smoke test passed");
