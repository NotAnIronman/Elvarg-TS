import { strict as assert } from "assert";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { PolygonalBoundary } from "../src/main/typescript/elvarg/game/model/PolygonalBoundary";
import { Area } from "../src/main/typescript/elvarg/game/model/areas/Area";
import { AreaManager } from "../src/main/typescript/elvarg/game/model/areas/AreaManager";
import { PluginManager } from "../src/main/typescript/elvarg/plugins/PluginManager";

const api = (PluginManager as any).createApi("area-plugin-policy-smoke");
const player = {};
const target = {};
const item = {};
const hit = {};

api.onCanUnequip((event: any) => {
  event.allow = false;
});
assert.equal(PluginManager.emitCanUnequip(player, 1, item), false);

let laterDeathHookRan = false;
api.onPlayerDeath((event: any) => {
  event.handled = true;
});
api.onPlayerDeath(() => {
  laterDeathHookRan = true;
});
assert.equal(
  PluginManager.emitPlayerDeath({ player, killer: null, handled: false }),
  true
);
assert.equal(laterDeathHookRan, false);

api.onPlayerOption((event: any) => {
  event.handled = event.option === 4;
});
assert.equal(
  PluginManager.emitPlayerOption({ player, target, option: 4, handled: false }),
  true
);

let dealtDamageHooks = 0;
api.onPlayerDealtDamage(() => {
  dealtDamageHooks++;
});
PluginManager.emitPlayerDealtDamage({ player, target, hit });
assert.equal(dealtDamageHooks, 1);

const polygonArea = new (class extends Area {})([
  new PolygonalBoundary([[10, 10], [20, 10], [20, 20], [10, 20]]),
]);
AreaManager.areas.push(polygonArea);
assert.equal(AreaManager.get(new Location(15, 15, 1)), polygonArea);

console.log("Area gameplay policy hooks passed.");
