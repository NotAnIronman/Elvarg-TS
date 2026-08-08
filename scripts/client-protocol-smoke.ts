import assert = require("assert");
import { parseCacheTarget } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import {
  decodeClientPacket,
  decodeClientPackets,
  encodeChatMessage,
  createNpcSyncState,
  createPlayerSyncState,
  encodeGameframeBootstrap,
  encodeHandshake,
  encodeLoginResponse,
  encodeNpcSync,
  encodePlayJingle,
  encodePlaySong,
  encodePlayerAppearance,
  encodePlayerSync,
  encodeWelcome,
  encodeSound,
  encodeServerPacket,
} from "../src/main/typescript/elvarg/net/protocol/ClientProtocol";
import { ServerPacketId } from "../src/main/typescript/elvarg/net/protocol/ServerPackets";
import { Music } from "../src/main/typescript/elvarg/game/Music";

const loginPayload = Buffer.alloc(4);
loginPayload.writeInt32BE(237);
const body = Buffer.concat([Buffer.from("toby\0secret\0", "latin1"), loginPayload]);
const frame = Buffer.concat([
  Buffer.from([204, body.length >> 8, body.length & 0xff]),
  body,
]);

assert.deepStrictEqual(decodeClientPacket(frame), {
  type: "login",
  username: "toby",
  password: "secret",
  revision: 237,
});
assert.deepStrictEqual(
  decodeClientPacket(Buffer.from([16, 0x0d, 0x43, 0xff, 0x0c, 0x93, 0x80, 0x00])),
  { type: "move", worldX: 3091, worldY: 3523, modifierFlags: 1 }
);
const npcClick = Buffer.from([76, 0, 0, 135]);
const objectClick = Buffer.from([96, 0x93, 0x0c, 0xc4, 0x0d, 0, 3, 0x68]);
assert.deepStrictEqual(decodeClientPacket(npcClick), {
  type: "npc_option", index: 7, clickType: 1,
});
assert.deepStrictEqual(decodeClientPacket(objectClick), {
  type: "object_option", id: 1000, x: 3091, y: 3524, clickType: 1,
});
assert.deepStrictEqual(decodeClientPackets(Buffer.concat([npcClick, objectClick])), [
  { type: "npc_option", index: 7, clickType: 1 },
  { type: "object_option", id: 1000, x: 3091, y: 3524, clickType: 1 },
]);
const chat = Buffer.from([190, 7, 0, ...Buffer.from("hello\0", "latin1")]);
assert.deepStrictEqual(decodeClientPacket(chat), {
  type: "chat", text: "hello", messageType: "public",
});
assert.deepStrictEqual(decodeClientPacket(Buffer.from([55])), {
  type: "raw", opcode: 55, payload: Buffer.alloc(0),
});
assert.deepStrictEqual(decodeClientPackets(Buffer.concat([chat, Buffer.from([55])])).map(({ type }) => type), [
  "chat", "raw",
]);
assert.deepStrictEqual([...encodeChatMessage("game", "Hi")], [
  120, 8, 72, 105, 0, 0, 0, 0, 255, 255,
]);
assert.deepStrictEqual([...encodeServerPacket(ServerPacketId.SHOP_CLOSE, Buffer.alloc(0))], [152]);
assert.throws(() => encodeServerPacket(ServerPacketId.RUN_ENERGY, Buffer.alloc(1)));
assert.deepStrictEqual(parseCacheTarget("osrs-237_2026-03-25"), {
  revision: 237,
  date: "2026-03-25",
});
assert.throws(() => parseCacheTarget("latest"));
assert.strictEqual(encodeWelcome(600, Date.now()).length, 9);
assert.strictEqual(encodeLoginResponse(true)[0], 3);
assert.strictEqual(encodeHandshake(1, "Toby", true)[0], 2);
assert.deepStrictEqual([...encodeSound(2395, { x: 3090, y: 3524, radius: 5 })], [
  131, 13, 9, 91, 1, 12, 18, 13, 196, 0, 1, 0, 0, 5, 0,
]);
assert.deepStrictEqual([...encodePlayJingle(42, 0x010203)], [132, 0, 42, 1, 3, 2]);
assert.deepStrictEqual([...encodePlaySong(76)], [133, 0, 76, 0, 0, 0, 100, 0, 100, 0, 0]);
assert.strictEqual(Music.forRegion(12850), 76);
const gameframe = encodeGameframeBootstrap("Toby");
assert.deepStrictEqual(gameframe.map((packet) => packet[0]), [
  170, 102, 103, 103, 103, 103, 103, 103, 103, 103, 103, 103,
  103, 103, 103, 103, 103, 103, 103, 103, 103, 110,
]);
assert.deepStrictEqual([...gameframe[0]], [170, 0, 3, 2, 114, 0]);
assert.deepStrictEqual([...gameframe[1]], [102, 0, 161]);
assert.strictEqual(gameframe[2].readInt32BE(3), (161 << 16) | 96);
assert.strictEqual(gameframe[2].readUInt16BE(7), 162);
const appearance = encodePlayerAppearance(
  { gender: 0, colors: [2, 14, 5, 4, 0], kits: [3, 14, 18, 26, 34, 38, 42], equip: [] },
  "Toby",
  3,
  32,
  [808, 823, 819, 820, 821, 822, 824]
);
const playerState = createPlayerSyncState(1, { x: 3089, y: 3524, level: 0 });
const playerFrame = encodePlayerSync(1, 3040, 3472, 10, [
  { index: 1, x: 3090, y: 3524, level: 0, appearance },
  { index: 2, x: 3091, y: 3524, level: 0, appearance },
], playerState);
assert.strictEqual(playerFrame[0], 20);
assert.deepStrictEqual(playerState.active, [1, 2]);

const npcState = createNpcSyncState();
const npcFrame = encodeNpcSync(10, { x: 3090, y: 3524, level: 0 }, [{
  index: 7,
  typeId: 1,
  x: 3091,
  y: 3524,
  level: 0,
  rotation: 4,
  walkDirection: -1,
  runDirection: -1,
}], npcState);
assert.strictEqual(npcFrame[0], 21);
assert.deepStrictEqual(npcState.indices, [7]);

console.log("cache, login, and client protocol smoke test passed");
