/**
 * Item spawner op routing: Spawn (op1) vs Spawn X (op2), the entered-amount
 * flow, amount clamping, and the developer-only guard on both ops.
 */
import * as assert from "node:assert/strict";
import { CacheDefinitions } from "../src/main/typescript/elvarg/game/cache/CacheDefinitions";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { PlayerRights } from "../src/main/typescript/elvarg/game/model/rights/PlayerRights";

async function main() {
  await CachePipeline.initialize();
  const plugin = require("../plugins/interface/ItemSpawner.plugin.js");
  const { uid, ICON_START } = require("../plugins/interface/itemSpawnerWidget.js");

  let handler: any = null;
  const api: any = {
    registerCommand: () => {},
    onInterfaceActionButton: (ids: any, h: any) => {
      const list = Array.isArray(ids) ? ids : [ids];
      if (list.includes(uid(ICON_START))) handler = h;
    },
  };
  plugin.register(api);
  assert.ok(handler, "result-slot handler registered");

  const added: Array<[number, number]> = [];
  const messages: string[] = [];
  let prompt: string | null = null;
  let amountAction: any = null;
  const player: any = {
    getRights: () => PlayerRights.DEVELOPER,
    getInventory: () => ({ adds: (id: number, amt: number) => added.push([id, amt]) }),
    getPacketSender: () => ({
      sendMessage: (m: string) => messages.push(m),
      sendEnterAmountPrompt: (t: string) => { prompt = t; },
    }),
    setEnteredAmountAction: (a: any) => { amountAction = a; },
  };

  const ABYSSAL_WHIP = 4151;

  // op1 -> spawn one immediately, no prompt
  handler({ player, itemId: ABYSSAL_WHIP, action: 1 });
  assert.deepEqual(added, [[ABYSSAL_WHIP, 1]], "Spawn adds exactly one");
  assert.equal(prompt, null, "Spawn does not prompt");

  // op2 -> prompt, nothing spawned yet
  added.length = 0;
  handler({ player, itemId: ABYSSAL_WHIP, action: 2 });
  assert.equal(added.length, 0, "Spawn X must not spawn before the amount arrives");
  assert.ok(prompt && prompt.includes("Abyssal whip"), `prompt names the item, got: ${prompt}`);
  assert.ok(amountAction, "an entered-amount action was registered");

  amountAction.execute(250);
  assert.deepEqual(added, [[ABYSSAL_WHIP, 250]], "the entered amount is spawned");

  // clamping and rejection
  added.length = 0;
  amountAction.execute(9_999_999_999);
  assert.deepEqual(added, [[ABYSSAL_WHIP, 2147483647]], "over-large amounts clamp to int max");
  added.length = 0;
  for (const bad of [0, -5, NaN, "abc"]) amountAction.execute(bad as any);
  assert.equal(added.length, 0, "non-positive / non-numeric amounts spawn nothing");

  // non-developer is refused on both ops
  added.length = 0;
  const mortal = { ...player, getRights: () => PlayerRights.PLAYER };
  handler({ player: mortal, itemId: ABYSSAL_WHIP, action: 1 });
  handler({ player: mortal, itemId: ABYSSAL_WHIP, action: 2 });
  assert.equal(added.length, 0, "non-developers cannot spawn");

  // out-of-range item ids are refused
  handler({ player, itemId: CacheDefinitions.getCounts().items + 10, action: 2 });
  handler({ player, itemId: 0, action: 1 });
  assert.equal(added.length, 0, "invalid item ids are refused");

  console.log("item spawner op routing OK");
}
main();
