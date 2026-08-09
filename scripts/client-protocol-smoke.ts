import assert = require("assert");
import { inflateSync } from "zlib";
import { parseCacheTarget } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import {
  decodeClientPacket,
  decodeClientPackets,
  encodeChatMessage,
  encodeContentData,
  createNpcSyncState,
  createPlayerSyncState,
  encodeGameframeBootstrap,
  encodeHandshake,
  encodeInventorySlot,
  encodeInventorySnapshot,
  encodeLoginResponse,
  encodeNpcSync,
  encodePlayJingle,
  encodePlaySong,
  encodeRunClientScript,
  encodeRunEnergy,
  encodeSkillsSnapshot,
  encodePlayerAppearance,
  encodePlayerSync,
  encodeProjectiles,
  encodeWelcome,
  encodeSound,
  encodeServerPacket,
  encodeDestination,
  encodeGroundItems,
  encodeGroundItemsDelta,
  encodeBankSnapshot,
  encodeLocAddChange,
  encodeRebuildNormal,
  encodeShopOpen,
  encodeTradeOpen,
  encodeVarbit,
  encodeVarp,
  encodeWidgetOpen,
  encodeWidgetOpenSub,
  encodeWidgetRunScript,
  encodeWidgetSetText,
} from "../src/main/typescript/elvarg/net/protocol/ClientProtocol";
import { ServerPacketId } from "../src/main/typescript/elvarg/net/protocol/ServerPackets";
import { Music } from "../src/main/typescript/elvarg/game/Music";
import { NPC } from "../src/main/typescript/elvarg/game/entity/impl/npc/NPC";
import { Direction } from "../src/main/typescript/elvarg/game/model/Direction";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { Sound } from "../src/main/typescript/elvarg/game/Sound";
import { FightType } from "../src/main/typescript/elvarg/game/content/combat/FightType";
import { MagicCombatMethod } from "../src/main/typescript/elvarg/game/content/combat/method/impl/MagicCombatMethod";
import { EquipPacketListener } from "../src/main/typescript/elvarg/net/packet/impl/EquipPacketListener";
import { Bank } from "../src/main/typescript/elvarg/game/model/container/impl/Bank";

assert.strictEqual(EquipPacketListener.resolveModernEquipmentSlot(387, 15), 0);
assert.strictEqual(EquipPacketListener.resolveModernEquipmentSlot(387, 25), 13);
assert.strictEqual(EquipPacketListener.resolveModernEquipmentSlot(84, 16), 7);
assert.strictEqual(EquipPacketListener.resolveModernEquipmentSlot(12, 15), -1);
assert.strictEqual(Bank.modernActionAmount("withdraw", 3, undefined, 100), 5);
assert.strictEqual(Bank.modernActionAmount("withdraw", 1, undefined, 100, 0, 2), 10);
assert.strictEqual(Bank.modernActionAmount("withdraw", 1, "Withdraw-All-but-1", 100), 99);
assert.strictEqual(Bank.modernActionAmount("deposit", 8, undefined, 100), 100);

for (let id = 0; id < 8; id++) {
  const npc = new NPC(-1, new Location(0, 0));
  npc.setFace(Direction.valueOf(id));
  assert.strictEqual(npc.getFace().getDirection().getId(), id);
}

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
assert.deepStrictEqual(decodeClientPacket(Buffer.from([44, 128, 0, 7])), {
  type: "player_option", index: 7, option: 1,
});
assert.deepStrictEqual(decodeClientPacket(Buffer.from([102, 128, 0xc4, 0x0d, 0x63, 0x03, 0x93, 0x0c])), {
  type: "ground_item_action", itemId: 995, x: 3091, y: 3524, optionIndex: 1,
});
const chat = Buffer.from([190, 7, 0, ...Buffer.from("hello\0", "latin1")]);
assert.deepStrictEqual(decodeClientPacket(chat), {
  type: "chat", text: "hello", messageType: "public",
});
assert.deepStrictEqual(decodeClientPacket(Buffer.from([55])), { type: "interface_close" });
assert.deepStrictEqual(decodeClientPackets(Buffer.concat([chat, Buffer.from([55])])).map(({ type }) => type), [
  "chat", "interface_close",
]);
assert.deepStrictEqual(decodeClientPacket(Buffer.from([252, 0, 0, 0, 42, 0, 3])), {
  type: "dialogue_continue", widgetId: 42, childIndex: 3,
});
assert.deepStrictEqual(decodeClientPacket(Buffer.from([192, 0, 0, 0, 10])), {
  type: "dialogue_amount", amount: 10,
});
assert.deepStrictEqual(decodeClientPacket(Buffer.from([194, 3, 111, 107, 0])), {
  type: "dialogue_input", value: "ok",
});
assert.deepStrictEqual([...encodeChatMessage("game", "Hi")], [
  120, 8, 72, 105, 0, 0, 0, 0, 255, 255,
]);
assert.deepStrictEqual([...encodeServerPacket(ServerPacketId.SHOP_CLOSE, Buffer.alloc(0))], [152]);
const content = encodeContentData("test", [{ key: "widgets", rows: [{ id: 1 }] }]);
assert.strictEqual(content[0], ServerPacketId.GAMEMODE_DATA);
assert.deepStrictEqual(JSON.parse(inflateSync(content.subarray(8)).toString()), {
  gamemodeId: "test",
  datasets: [{ key: "widgets", rows: [{ id: 1 }] }],
});
assert.throws(() => encodeServerPacket(ServerPacketId.RUN_ENERGY, Buffer.alloc(1)));
assert.deepStrictEqual([...encodeVarp(12, 3)], [40, 0, 12, 3]);
assert.deepStrictEqual([...encodeVarbit(12, 300)], [42, 0, 12, 0, 0, 1, 44]);
assert.deepStrictEqual([...encodeInventorySlot(2, 4151, 1)], [51, 5, 0, 2, 16, 56, 1]);
assert.strictEqual(encodeInventorySnapshot([{ slot: 0, itemId: -1, quantity: 0 }])[0], 50);
assert.strictEqual(encodeSkillsSnapshot([{
  id: 0, xp: 83, baseLevel: 2, virtualLevel: 2, boost: 0, currentLevel: 2,
}], 24, 3)[0], 70);
assert.deepStrictEqual([...encodeRunEnergy(65, true)], [81, 65, 1]);
assert.deepStrictEqual([...encodeDestination(3091, 3524)], [87, 12, 19, 13, 196]);
assert.strictEqual(encodeGroundItems(1, [{ id: 7, itemId: 995, quantity: 1, x: 3091, y: 3524, level: 0 }])[0], 54);
assert.strictEqual(encodeGroundItemsDelta(2, [], [7])[0], 55);
assert.strictEqual(encodeBankSnapshot(1410, [{ slot: 0, itemId: 995, quantity: 1000, tab: 0 }])[0], 52);
assert.deepStrictEqual([...encodeLocAddChange(1000, 3091, 3524, 0, 10, 2)], [134, 8, 3, 232, 12, 19, 13, 196, 0, 42]);
assert.strictEqual(encodeRebuildNormal(386, 440, true, [[1, 2, 3, 4]])[0], 141);
assert.strictEqual(encodeShopOpen("1", "Shop", 995, false, 1, 1, [
  { slot: 0, itemId: 4151, quantity: 1 },
])[0], 150);
assert.strictEqual(encodeTradeOpen("1:2", "offer", { offers: [] }, { offers: [] })[0], 155);
assert.deepStrictEqual([...encodeWidgetOpen(12)], [100, 0, 12, 1]);
assert.deepStrictEqual([...encodeWidgetSetText(42, "Hi")], [105, 0, 7, 0, 0, 0, 42, 72, 105, 0]);
assert.strictEqual(encodeWidgetOpenSub((161 << 16) | 7, 122)[0], 103);
assert.strictEqual(encodeWidgetRunScript(876, ["Toby", 1])[0], 110);
assert.deepStrictEqual([...encodeRunClientScript(626)], [170, 0, 3, 2, 114, 0]);
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
assert.deepStrictEqual([...encodeSound(2738)], [131, 8, 10, 178, 0, 1, 0, 0, 0, 0]);
assert.strictEqual(Sound.PICK_UP_ITEM.getId(), 2582);
assert.strictEqual(Sound.SHOOT_CROSSBOW.getId(), 2695);
assert.strictEqual(Sound.PRAYER_PROTECT_MELEE.getId(), 2676);
assert.strictEqual(FightType.UNARMED_KICK.getAttackSound().getId(), 2565);
assert.strictEqual((MagicCombatMethod as any).resolveCastSound(1152).getId(), 220);
assert.strictEqual((MagicCombatMethod as any).resolveImpactSound(12891).getId(), 168);
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

const forcedState = createPlayerSyncState(1, { x: 3089, y: 3521, level: 0 });
const forcedEnd = { x: 3089, y: 3524, level: 0 };
encodePlayerSync(1, 3040, 3472, 10, [{
  index: 1, x: 3089, y: 3521, level: 0, appearance,
  forcedMovement: {
    startDeltaX: 0, startDeltaY: 0, endDeltaX: 0, endDeltaY: 3,
    startCycleOffset: 0, endCycleOffset: 70, direction: 0,
  },
  forcedMovementEnd: forcedEnd,
}], forcedState);
assert.deepStrictEqual(forcedState.lastTiles.get(1), forcedEnd);
encodePlayerSync(1, 3040, 3472, 11, [{
  index: 1, x: 3089, y: 3521, level: 0, appearance, forcedMovementEnd: forcedEnd,
}], forcedState);
assert.deepStrictEqual(forcedState.lastTiles.get(1), forcedEnd);

const combatPlayerState = createPlayerSyncState(1, { x: 3090, y: 3524, level: 0 });
const combatPlayerFrame = encodePlayerSync(1, 3040, 3472, 11, [{
  index: 1,
  x: 3090,
  y: 3524,
  level: 0,
  appearance,
  forcedChat: "Ow",
  faceDirection: 1024,
  interactionIndex: 7,
  animation: { id: 123, delay: 2 },
  hits: [{ type: 16, damage: 5 }],
  health: { current: 5, max: 10 },
  graphic: { id: 456, height: 50, delay: 3 },
}], combatPlayerState);
assert.deepStrictEqual([...combatPlayerFrame.subarray(-31)], [
  235, 64, 1, 79, 119, 0, 0, 4, 0, 7, 0, 251, 0, 2,
  255, 16, 5, 0, 255, 0, 0, 0, 15, 129, 0, 1, 200, 0, 3, 0, 50,
]);

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

const npcCombatFrame = encodeNpcSync(11, { x: 3090, y: 3524, level: 0 }, [{
  index: 7,
  typeId: 1,
  x: 3091,
  y: 3524,
  level: 0,
  rotation: 4,
  walkDirection: -1,
  runDirection: -1,
  forcedChat: "Hi",
  interactionIndex: 0x8001,
  animation: { id: 200, delay: 0 },
  hits: [{ type: 17, damage: 4 }],
  health: { current: 6, max: 10 },
  graphic: { id: 300, height: 0, delay: 1 },
}], npcState);
assert.deepStrictEqual([...npcCombatFrame.subarray(-29)], [
  248, 64, 2, 129, 128, 128, 127, 17, 4, 0, 129, 0, 0, 0, 238,
  72, 105, 0, 1, 128, 44, 1, 0, 1, 0, 0, 0, 200, 0,
]);
const npcClearFaceFrame = encodeNpcSync(12, { x: 3090, y: 3524, level: 0 }, [{
  index: 7,
  typeId: 1,
  x: 3091,
  y: 3524,
  level: 0,
  rotation: 4,
  walkDirection: -1,
  runDirection: -1,
  interactionIndex: -1,
}], npcState);
assert.deepStrictEqual([...npcClearFaceFrame.subarray(-4)], [8, 127, 255, 127]);

const projectile = encodeProjectiles([{
  projectileId: 91,
  source: { x: 3090, y: 3524, level: 0 },
  target: { x: 3094, y: 3524, level: 0 },
  sourceHeight: 172,
  endHeight: 124,
  slope: 16,
  startPos: 64,
  startCycleOffset: 40,
  endCycleOffset: 57,
  targetActor: { kind: "npc", index: 7 },
}]);
assert.strictEqual(projectile[0], 84);
assert.strictEqual(projectile.readUInt16BE(1), 31);
assert.strictEqual(projectile.readUInt16BE(3), 1);
assert.strictEqual(projectile.readUInt16BE(5), 91);
assert.deepStrictEqual([...projectile.subarray(-3)], [2, 0, 7]);

console.log("cache, login, and client protocol smoke test passed");
