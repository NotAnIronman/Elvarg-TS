import assert = require("assert");
import { RsmodRouteFinding } from "../src/main/typescript/elvarg/game/model/movement/path/RsmodRouteFinding";

const blocked = new Set(["2,-1", "2,0", "2,1"]);
const routeFinder = new RsmodRouteFinding((x, y) => blocked.has(`${x},${y}`) ? 0x100 : 0);

function expandRoute(route: ReturnType<RsmodRouteFinding["findRoute"]>, startX: number, startY: number) {
  const tiles: Array<[number, number]> = [];
  let x = startX;
  let y = startY;
  for (const waypoint of route.waypoints) {
    while (x !== waypoint.x || y !== waypoint.y) {
      x += Math.sign(waypoint.x - x);
      y += Math.sign(waypoint.y - y);
      assert(!blocked.has(`${x},${y}`), `route entered blocked tile ${x},${y}`);
      tiles.push([x, y]);
    }
  }
  return tiles;
}

const detour = routeFinder.findRoute({
  level: 0, srcX: 0, srcY: 0, srcSize: 1, destX: 4, destY: 0,
  locShape: -1, moveNear: false, privateArea: null,
});
assert(detour.success);
const detourTiles = expandRoute(detour, 0, 0);
assert(detour.waypoints.length >= 3, "detour fixture must preserve a multi-checkpoint corridor");
assert(detour.waypoints.length < detourTiles.length, "route should contain turns, not every traversed tile");
assert.deepStrictEqual(detourTiles.at(-1), [4, 0]);

const straight = routeFinder.findRoute({
  level: 0, srcX: 0, srcY: 10, srcSize: 1, destX: 60, destY: 10,
  locShape: -1, moveNear: false, privateArea: null,
});
assert(straight.success);
assert.deepStrictEqual(straight.waypoints, [{ x: 60, y: 10, z: 0 }]);

const corner = new RsmodRouteFinding((x, y) => x === 1 && y === 0 ? 0x100 : 0).findRoute({
  level: 0, srcX: 0, srcY: 0, srcSize: 1, destX: 1, destY: 1,
  locShape: -1, moveNear: false, privateArea: null,
});
assert.deepStrictEqual(corner.waypoints, [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }]);

blocked.add("4,0");
assert.strictEqual(routeFinder.findRoute({
  level: 0, srcX: 0, srcY: 0, srcSize: 1, destX: 4, destY: 0,
  locShape: -1, moveNear: false, privateArea: null,
}).success, false);

console.log("RSMod route core smoke test passed");
