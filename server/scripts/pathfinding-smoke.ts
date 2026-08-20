import assert = require("assert");
import { FightType } from "../src/main/typescript/elvarg/game/content/combat/FightType";
import { WeaponProfiles } from "../src/main/typescript/elvarg/game/content/combat/WeaponProfile";
import { WeaponInterfaces } from "../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { RegionManager } from "../src/main/typescript/elvarg/game/collision/RegionManager";
import { RsmodRouteFinding } from "../src/main/typescript/elvarg/game/model/movement/path/RsmodRouteFinding";

void FightType;
void WeaponProfiles;
void WeaponInterfaces;

const originalGetClipping = RegionManager.getClipping;
const blocked = new Set(["2,-1", "2,0", "2,1"]);
(RegionManager as any).getClipping = (x: number, y: number) => blocked.has(`${x},${y}`) ? 0x100 : 0;

try {
  const assertRouteSteps = (
    route: ReturnType<RsmodRouteFinding["findRoute"]>,
    start: { x: number; y: number },
  ) => {
    let previous = start;
    for (const waypoint of route.waypoints) {
      let deltaX = waypoint.x - previous.x;
      let deltaY = waypoint.y - previous.y;
      const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      for (let i = 0; i < steps; i++) {
        const next = {
          x: previous.x + Math.sign(deltaX),
          y: previous.y + Math.sign(deltaY),
        };
        assert(!blocked.has(`${next.x},${next.y}`));
        assert(RegionManager.canMove(previous.x, previous.y, next.x, next.y, 0, 1, 1, null));
        previous = next;
        deltaX = waypoint.x - previous.x;
        deltaY = waypoint.y - previous.y;
      }
    }
    return previous;
  };

  const route = new RsmodRouteFinding().findRoute({
    level: 0,
    srcX: 0,
    srcY: 0,
    srcSize: 1,
    destX: 4,
    destY: 0,
    locShape: -1,
    moveNear: false,
    privateArea: null,
  });
  assert.strictEqual(route.success, true);

  const previous = assertRouteSteps(route, { x: 0, y: 0 });
  assert(route.waypoints.length < 6, "route should contain turn checkpoints, not every tile");
  assert.strictEqual(previous.x, 4);
  assert.strictEqual(previous.y, 0);

  const longStraightRoute = new RsmodRouteFinding().findRoute({
    level: 0,
    srcX: 0,
    srcY: 10,
    srcSize: 1,
    destX: 60,
    destY: 10,
    locShape: -1,
    moveNear: false,
    privateArea: null,
  });
  assert.strictEqual(longStraightRoute.success, true);
  assert.strictEqual(longStraightRoute.waypoints.length, 1);
  assert.deepStrictEqual(assertRouteSteps(longStraightRoute, { x: 0, y: 10 }), { x: 60, y: 10 });

  blocked.add("4,0");
  const blockedFloorItem = new RsmodRouteFinding().findRoute({
    level: 0,
    srcX: 0,
    srcY: 0,
    srcSize: 1,
    destX: 4,
    destY: 0,
    locShape: -1,
    moveNear: false,
    privateArea: null,
  });
  assert.strictEqual(blockedFloorItem.success, false);
} finally {
  (RegionManager as any).getClipping = originalGetClipping;
}

async function verifyCacheCollision(): Promise<void> {
  await CachePipeline.initialize();
  RegionManager.init();
  RegionManager.loadMapFiles(3089, 3490);

  assert.strictEqual(RegionManager.getClipping(3081, 3480, 0, null) & 0x10, 0);
  assert.notStrictEqual(RegionManager.getClipping(3081, 3481, 0, null) & 0x10, 0);
  assert.notStrictEqual(RegionManager.getClipping(3093, 3508, 0, null) & 0x100, 0);
  assert.notStrictEqual(RegionManager.getClipping(3072, 3515, 0, null) & 0x80, 0);
  assert.strictEqual(RegionManager.canMove(3092, 3508, 3093, 3508, 0, 1, 1, null), false);
}

verifyCacheCollision()
  .then(() => console.log("pathfinding smoke test passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
