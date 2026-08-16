import * as assert from "node:assert/strict";

const {
  nextStressBotActivityTick,
  randomClippedStepWithinBounds,
  shouldTakeStressBotStep,
} = require("../plugins/bots/StressTestBotMovement");

const bounds = { minX: 3152, maxX: 3176, minY: 3476, maxY: 3500 };
const location = { x: bounds.minX, y: bounds.minY };
const player = {
  getLocation: () => ({ getX: () => location.x, getY: () => location.y }),
  getMovementQueue: () => ({
    canWalk: () => true,
    walkStep: (dx: number, dy: number) => {
      location.x += dx;
      location.y += dy;
    },
  }),
};

for (let tick = 0; tick < 10_000; tick++) {
  randomClippedStepWithinBounds(player, bounds);
  assert.ok(location.x >= bounds.minX && location.x <= bounds.maxX);
  assert.ok(location.y >= bounds.minY && location.y <= bounds.maxY);
}

assert.equal(shouldTakeStressBotStep(() => 0.02), true);
assert.equal(shouldTakeStressBotStep(() => 0.03), false);
assert.equal(nextStressBotActivityTick(100, 14, 40, () => 0), 114);
assert.equal(nextStressBotActivityTick(100, 14, 40, () => 0.999), 140);

console.log("Stress bot movement and activity smoke test passed");
