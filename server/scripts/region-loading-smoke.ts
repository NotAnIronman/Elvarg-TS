import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

const sourceRoot = path.resolve(process.cwd(), "src/main/typescript/elvarg");
const movement = fs.readFileSync(
  path.join(sourceRoot, "game/model/movement/MovementQueue.ts"),
  "utf8"
);
const packets = fs.readFileSync(path.join(sourceRoot, "net/packet/PacketSender.ts"), "utf8");
const session = fs.readFileSync(path.join(sourceRoot, "net/PlayerSession.ts"), "utf8");
const objects = fs.readFileSync(
  path.join(sourceRoot, "game/entity/impl/object/ObjectManager.ts"),
  "utf8"
);
const replacements = fs.readFileSync(
  path.join(sourceRoot, "game/collision/MapRegionReplacementManager.ts"),
  "utf8"
);

assert.doesNotMatch(movement, /regionChanged\s*\|\|\s*player\.getRegionHeight/);
assert.doesNotMatch(movement, /sendMapRegion|ObjectManager\.onRegionChange/);
assert.doesNotMatch(packets, /sendMapRegion|encodeRebuildNormal/);
assert.match(session, /replayedSceneLevel !== current\.level/);
assert.match(session, /replayedPrivateArea !== privateArea/);
assert.match(session, /sendVisibleReplacementsToPlayer\([\s\S]*?this\.sceneBaseX \+ 48/);
assert.match(session, /sendClientPacket\(playerSync\)[\s\S]*?ObjectManager\.onRegionChange/);
assert.match(objects, /SCENE_SIZE = 104/);
assert.doesNotMatch(objects, /isWithinDistance\(object\.getLocation\(\), 64\)/);
assert.match(replacements, /session\.sendClientPacket\(encodeRegionReplacement/);
assert.doesNotMatch(replacements, /PacketBuilder|PACKET_OPCODE/);

console.log("Region loading policy smoke test passed");
