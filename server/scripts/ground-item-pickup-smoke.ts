import assert = require("assert");
import { Location } from "../src/main/typescript/elvarg/game/model/Location";

const Module = require("module");
const originalLoad = Module._load;
Module._load = (request: string, parent: unknown, isMain: boolean) =>
  request.endsWith("WeaponProfile")
    ? { WeaponProfile: {} }
    : originalLoad(request, parent, isMain);
const { MovementQueue } = require("../src/main/typescript/elvarg/game/model/movement/MovementQueue");
const { PathFinder } = require("../src/main/typescript/elvarg/game/model/movement/path/PathFinder");
const { TaskManager } = require("../src/main/typescript/elvarg/game/task/TaskManager");
Module._load = originalLoad;

const current = new Location(3200, 3200, 0);
const target = new Location(3202, 3200, 0);
let queue: any;
const player: any = {
  isPlayer: () => true,
  getAsPlayer: () => player,
  getIndex: () => 1,
  getLocation: () => current,
  getMovementQueue: () => queue,
  getSize: () => 1,
  getPrivateArea: () => null,
};
queue = new MovementQueue(player);

const originalSubmit = TaskManager.submit;
const originalCalculate = PathFinder.calculateGroundItemRoute;
const originalRouteFinding = (PathFinder as any).rsmodRouteFinding;
let task: any;
let pickups = 0;

try {
  (queue as any).getMobility = () => ({ canMove: () => true });
  (queue as any).checkDestination = () => true;
  (queue as any).reset = () => queue;
  (queue as any).walkToReset = () => {};
  (PathFinder as any).calculateGroundItemRoute = () => 0;
  (TaskManager as any).submit = (submitted: any) => { task = submitted; };

  // Operable distance for an obj is "on its tile, or adjacent to it": the exact tile
  // short-circuits, anything else delegates with the exclusive-rectangle shape (-2).
  const reachCalls: number[] = [];
  (PathFinder as any).rsmodRouteFinding = {
    reachedAbsolute: (options: any) => { reachCalls.push(options.locShape); return false; },
  };
  assert.strictEqual(PathFinder.reachedObj(player, new Location(3200, 3200, 0)), true);
  assert.deepStrictEqual(reachCalls, [], "standing on the tile must not need a reach search");
  assert.strictEqual(PathFinder.reachedObj(player, new Location(3201, 3200, 0)), false);
  assert.deepStrictEqual(reachCalls, [-2], "an off-tile obj reach uses the entity exclusive rectangle");

  queue.walkToGroundItem(target, () => pickups++);
  assert(task, "pickup should schedule a movement task");

  task.execute();
  assert.strictEqual(pickups, 0);
  current.setAs(target);
  task.execute();
  assert.strictEqual(pickups, 0, "pickup must wait one tick after reaching the item");
  task.execute();
  assert.strictEqual(pickups, 1);

  // A walk-to task must be driven from its owner's turn (after that cycle's steps),
  // not from the global task pass which runs before anyone has moved.
  (TaskManager as any).submit = originalSubmit;
  let ticks = 0;
  const probe: any = Object.create(Object.getPrototypeOf(task));
  Object.assign(probe, task);
  probe.execute = () => { ticks++; };
  TaskManager.submit(probe);
  const afterSubmit = ticks; // submit runs the pre-movement check, as upstream does
  TaskManager.process();
  assert.strictEqual(ticks, afterSubmit, "the global task pass must not tick walk-to tasks");
  TaskManager.processWalkTo(player.getIndex());
  assert.strictEqual(ticks, afterSubmit + 1, "the owner's turn ticks its walk-to task");
  TaskManager.processRemainingWalkTo();
  assert.strictEqual(ticks, afterSubmit + 1, "the sweep must not double-tick a task already ticked this cycle");
  probe.stop();
  TaskManager.processWalkTo(player.getIndex());
} finally {
  (TaskManager as any).submit = originalSubmit;
  (PathFinder as any).calculateGroundItemRoute = originalCalculate;
  (PathFinder as any).rsmodRouteFinding = originalRouteFinding;
}

console.log("ground item pickup smoke test passed");
