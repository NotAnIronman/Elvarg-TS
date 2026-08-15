import * as assert from "node:assert/strict";
import "../src/main/typescript/elvarg/game/content/combat/FightType";
import "../src/main/typescript/elvarg/game/content/combat/WeaponProfile";
import { Bank } from "../src/main/typescript/elvarg/game/model/container/impl/Bank";

const plugin = require("../plugins/objects/BankDepositBooth.plugin.js");

let openIds: number[] = [];
let openHandler: (event: any) => void;
let itemHandler: (event: any) => void;
let buttonHandler: (event: any) => boolean;
let itemOnObjectHandler: (event: any) => void;
let prompt: { title: string; pairs: any[] } | undefined;

plugin.register({
  emitCanBank: () => true,
  onObjectFirstClick: (ids: number[], handler: typeof openHandler) => {
    openIds = ids;
    openHandler = handler;
  },
  onItemAction: (handler: typeof itemHandler) => { itemHandler = handler; },
  onInterfaceActionButton: (_ids: number[], handler: typeof buttonHandler) => { buttonHandler = handler; },
  onItemOnObject: (handler: typeof itemOnObjectHandler) => { itemOnObjectHandler = handler; },
  sendMultiChatboxPrompt: (_player: any, title: string, ...pairs: any[]) => {
    prompt = { title, pairs };
    return true;
  },
});

assert.ok(openIds.includes(10529), "modern bank deposit box id must be registered");
assert.ok(!openIds.includes(9398), "legacy 317 door alias must not be registered");

let amount = 12;
const item = {
  getId: () => 995,
  getDefinition: () => ({ getExamine: () => "Lovely money!", getName: () => "Coins" }),
};
const inventory = {
  forSlot: (slot: number) => slot === 2 ? item : undefined,
  getAmount: (id: number) => id === 995 ? amount : 0,
  getValidItems: () => amount > 0 ? [item] : [],
};
const equipment = { getValidItems: () => [] };
const attributes = new Map<string, any>();
const sent = {
  subInterfaces: [] as number[][],
  containers: [] as number[],
  flags: [] as number[][],
  animations: [] as number[],
};
const sender: any = {
  sendSubInterface: (...args: number[]) => { sent.subInterfaces.push(args); return sender; },
  sendInterfaceFlagsRange: (...args: number[]) => { sent.flags.push(args); return sender; },
  sendConfig: () => sender,
  sendVarbit: () => sender,
  clearItemOnInterface: () => sender,
  sendItemContainer: (_container: any, id: number) => { sent.containers.push(id); return sender; },
  sendSoundEffect: () => sender,
  sendEnterAmountPrompt: () => sender,
  sendMessage: () => sender,
};
let interfaceId = -1;
const player: any = {
  getPacketSender: () => sender,
  getInventory: () => inventory,
  getEquipment: () => equipment,
  getInterfaceId: () => interfaceId,
  setInterfaceId: (id: number) => { interfaceId = id; },
  getAttribute: (key: string) => attributes.get(key),
  setAttribute: (key: string, value: any) => attributes.set(key, value),
  setEnteredAmountAction: () => {},
  performAnimation: (animation: any) => sent.animations.push(animation.getId()),
  getUsername: () => "smoke",
  isPlayerBot: () => false,
};
const object = { getDefinition: () => ({ name: "Bank Deposit Box" }) };

const originalDeposit = Bank.deposit;
try {
  const deposits: any[][] = [];
  Bank.deposit = ((...args: any[]) => {
    deposits.push(args);
    amount -= Math.min(amount, args[3]);
  }) as typeof Bank.deposit;

  openHandler({ player, object, objectId: 10529, handled: false });
  assert.strictEqual(interfaceId, 192);
  assert.deepStrictEqual(sent.subInterfaces, [[(161 << 16) | 16, 192, 0]]);
  assert.ok(sent.containers.includes((192 << 16) | 24), "interface 192:24 must receive the inventory");
  assert.deepStrictEqual(sent.flags, [[(192 << 16) | 24, 0, 27, 0x2047e]]);

  buttonHandler({ player, buttonId: (192 << 16) | 37 });
  itemHandler({ player, interfaceId: (192 << 16) | 24, itemId: 995, slot: 2, clickType: 1, handled: false });
  assert.strictEqual(deposits.at(-1)?.[3], 10, "selected Deposit-10 must drive op1");
  assert.strictEqual(deposits.at(-1)?.[4], true, "deposit-box deposits bypass the bank modal guard");

  amount = 12;
  const useEvent = { player, object, objectId: 10529, itemId: 995, itemSlot: 2, handled: false };
  itemOnObjectHandler(useEvent);
  assert.strictEqual(useEvent.handled, true);
  assert.deepStrictEqual(prompt?.pairs.filter((_: any, index: number) => index % 2 === 0), ["1", "5", "10", "X", "All"]);
  prompt?.pairs[3]();
  assert.strictEqual(deposits.at(-1)?.[3], 5, "item-on-box quantity choice must be deposited");
  assert.ok(sent.animations.includes(834), "successful deposits must play the OSRS lever animation");
} finally {
  Bank.deposit = originalDeposit;
}

console.log("bank deposit box smoke passed");
