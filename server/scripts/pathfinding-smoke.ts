import assert = require("assert");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { RegionManager } from "../src/main/typescript/elvarg/game/collision/RegionManager";
import { RsmodRouteFinding } from "../src/main/typescript/elvarg/game/model/movement/path/RsmodRouteFinding";

const originalGetClipping = RegionManager.getClipping;
const blocked = new Set(["2,-1", "2,0", "2,1"]);
(RegionManager as any).getClipping = (x: number, y: number) => blocked.has(`${x},${y}`) ? 0x100 : 0;

try {
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
  assert(route.waypoints.length > 4, "route should go around the wall");

  let previous = { x: 0, y: 0 };
  for (const step of route.waypoints) {
    assert(Math.abs(step.x - previous.x) <= 1 && Math.abs(step.y - previous.y) <= 1);
    assert(!blocked.has(`${step.x},${step.y}`));
    assert(RegionManager.canMove(previous.x, previous.y, step.x, step.y, 0, 1, 1, null));
    previous = step;
  }
  assert.strictEqual(previous.x, 4);
  assert.strictEqual(previous.y, 0);

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
