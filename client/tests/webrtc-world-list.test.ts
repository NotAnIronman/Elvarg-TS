import assert from "node:assert/strict";

import { getWebRtcRelayConfig } from "../config/clientEnv";
import { handleServerListClick } from "../game/login/renderer/input/mouseClick";
import { forumProfileUrl, relayWorldEntries, replaceRelayWorlds } from "../game/login/renderer/serverList";

assert.deepEqual(getWebRtcRelayConfig(), {
    signalUrl: "wss://worlds.rsps.app",
    iceServers: [{ urls: "stun:stun.rsps.app:3478" }],
});

const discovered = relayWorldEntries("ws://127.0.0.1:8787", [], {
    worlds: [
        { worldId: "toby", name: "TobyScape", ownerUsername: "toby", playerCount: 12 },
        { worldId: "alice" },
        { worldId: "invalid world", name: "Ignored" },
    ],
});
assert.deepEqual(discovered.map((world) => world.worldId), ["toby", "alice"]);
assert.equal(discovered[0].transport, "webrtc");
assert.equal(discovered[0].playerCount, 12);
assert.equal(discovered[0].name, "TobyScape");
assert.equal(discovered[0].ownerUsername, "toby");
assert.equal(forumProfileUrl("toby"), "https://rsps.app/public/u/toby");

const opened: string[] = [];
(globalThis as any).window = { open: (url: string) => opened.push(url) };
const clickHost = {
    probed: true,
    serverList: [{ ownerUsername: "toby" }],
    canvasWidth: 800,
    canvasHeight: 600,
    contentScale: 1,
    layoutConfig: { isTouch: false, minTouchTarget: 44 },
    fontPlain12: { measure: (text: string) => text.length * 6 },
} as any;
assert.equal(handleServerListClick(clickHost, {} as any, 365, 310), undefined);
assert.deepEqual(opened, ["https://rsps.app/public/u/toby"]);
assert.deepEqual(handleServerListClick(clickHost, {} as any, 400, 310), { type: "select_server", index: 0 });
delete (globalThis as any).window;

const configured = {
    ...discovered[0],
    name: "Toby's World",
    relayDiscovered: false,
};
const refreshed = replaceRelayWorlds([configured, { ...discovered[1], worldId: "stale" }], discovered);
assert.deepEqual(refreshed.map((world) => world.worldId), ["toby", "alice"]);
assert.equal(refreshed[0].name, "Toby's World");

console.log("WebRTC relay world discovery test passed");
