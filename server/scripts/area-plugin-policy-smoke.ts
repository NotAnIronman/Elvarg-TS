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

const destination = new Location(205, 205, 0);
const targetArea = new (class extends Area {})([
  new PolygonalBoundary([[200, 200], [210, 200], [210, 210], [200, 210]]),
]);
const sourceArea = new (class extends Area {
  process(mobile: any) {
    this.leave(mobile, false);
    targetArea.enter(mobile);
    mobile.setArea(targetArea);
    mobile.moveTo(destination);
  }
})([
  new PolygonalBoundary([[100, 100], [110, 100], [110, 110], [100, 110]]),
]);
const mobile: any = {
  area: sourceArea,
  location: new Location(105, 105, 0),
  multiIcon: 0,
  getArea() { return this.area; },
  setArea(area: Area) { this.area = area; },
  getLocation() { return this.location; },
  moveTo(location: Location) { this.location = location; },
  getIndex() { return 1; },
  isPlayer() { return true; },
  isNpc() { return false; },
  getAsPlayer() { return this; },
  getMultiIcon() { return this.multiIcon; },
  setMultiIcon(value: number) { this.multiIcon = value; },
};
sourceArea.enter(mobile);
AreaManager.process(mobile);
assert.equal(mobile.getArea(), targetArea);
assert.equal(mobile.getLocation(), destination);

console.log("Area gameplay policy hooks passed.");
