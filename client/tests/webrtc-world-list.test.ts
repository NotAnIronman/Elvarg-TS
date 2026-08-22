import assert from "node:assert/strict";

import { getWebRtcRelayConfig } from "../config/clientEnv";
import { relayWorldEntries, replaceRelayWorlds } from "../game/login/renderer/serverList";

(globalThis as any).window = { location: { hostname: "localhost" } };
assert.deepEqual(getWebRtcRelayConfig(), {
    signalUrl: "ws://127.0.0.1:8787",
    iceServers: [],
});
delete (globalThis as any).window;

const discovered = relayWorldEntries("ws://127.0.0.1:8787", [], {
    worlds: [{ worldId: "toby" }, { worldId: "alice" }, { worldId: "invalid world" }],
});
assert.deepEqual(discovered.map((world) => world.worldId), ["toby", "alice"]);
assert.equal(discovered[0].transport, "webrtc");
assert.equal(discovered[0].playerCount, -1);

const configured = {
    ...discovered[0],
    name: "Toby's World",
    relayDiscovered: false,
};
const refreshed = replaceRelayWorlds([configured, { ...discovered[1], worldId: "stale" }], discovered);
assert.deepEqual(refreshed.map((world) => world.worldId), ["toby", "alice"]);
assert.equal(refreshed[0].name, "Toby's World");

console.log("WebRTC relay world discovery test passed");
