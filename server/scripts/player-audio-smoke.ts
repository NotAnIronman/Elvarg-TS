import assert = require("assert");
import { Player } from "../src/main/typescript/elvarg/game/entity/impl/player/Player";

const player = new Player(null as any);
assert.deepStrictEqual(player.getAudioSettings(), { 18: 0, 168: 100, 169: 100, 872: 100, 3796: 100 });
assert.strictEqual(player.setAudioSetting(169, -1), true);
assert.strictEqual(player.setAudioSetting(3796, 101), true);
assert.strictEqual(player.setAudioSetting(999, 50), false);
assert.strictEqual(player.getAudioSettings()[169], 0);
assert.strictEqual(player.getAudioSettings()[3796], 100);
player.setAudioSettings({ 168: 25 });
assert.strictEqual(player.getAudioSettings()[168], 25);
assert.strictEqual(player.getAudioSettings()[169], 100);
console.log("player audio settings ok");
