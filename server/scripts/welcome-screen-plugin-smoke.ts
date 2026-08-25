import { strict as assert } from "assert";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { encodeGameframeBootstrap } from "../src/main/typescript/elvarg/net/protocol/ClientProtocol";

const WelcomeScreen = require("../plugins/interface/WelcomeScreen.plugin");

const WELCOME_SCREEN_GROUP_ID = 378;
const PLAY_BUTTON_UID = (WELCOME_SCREEN_GROUP_ID << 16) | 72;

let login: ((event: any) => void) | undefined;
let disconnect: ((event: any) => void) | undefined;
let logout: ((event: any) => void) | undefined;
let play: ((event: any) => boolean | void) | undefined;

WelcomeScreen.register(new Proxy<any>({
  onPlayerLogin: (handler: any) => { login = handler; },
  onPlayerDisconnect: (handler: any) => { disconnect = handler; },
  onPlayerLogout: (handler: any) => { logout = handler; },
  onInterfaceActionButton: (buttonId: number, handler: any) => {
    assert.equal(buttonId, PLAY_BUTTON_UID);
    play = handler;
  },
}, {
  get: (target, property) => target[property] ?? (() => undefined),
}));

assert.ok(login && disconnect && logout && play, "plugin must register its hooks");

function playerAt(location: Location) {
  const roots: number[] = [];
  const flags: Array<[number, number]> = [];
  const packets: Buffer[] = [];
  const sender = {
    sendRootInterface: (groupId: number) => { roots.push(groupId); return sender; },
    sendInterfaceFlags: (uid: number, value: number) => { flags.push([uid, value]); return sender; },
  };
  const player = {
    getLocation: () => location,
    getUsername: () => "welcome-test",
    getPacketSender: () => sender,
    getSession: () => ({ sendClientPacket: (packet: Buffer) => packets.push(packet) }),
  };
  return { player, roots, flags, packets };
}

async function main() {
  const outside = playerAt(new Location(3200, 3200, 0));
  login!({ player: outside.player });
  assert.deepEqual(outside.roots, [], "on-login must wait until the normal gameframe is bootstrapped");
  await Promise.resolve();
  assert.deepEqual(outside.roots, [WELCOME_SCREEN_GROUP_ID]);
  assert.deepEqual(outside.flags, [[PLAY_BUTTON_UID, 1 << 1]]);

  play!({ player: outside.player });
  assert.deepEqual(outside.packets, encodeGameframeBootstrap("welcome-test"));
  outside.packets.length = 0;
  assert.equal(play!({ player: outside.player }), false, "Play must only work while the welcome screen is active");
  assert.equal(outside.packets.length, 0);

  const wilderness = playerAt(new Location(3100, 3600, 0));
  login!({ player: wilderness.player });
  await Promise.resolve();
  assert.deepEqual(wilderness.roots, [], "Wilderness logins must skip the welcome screen");
  assert.deepEqual(wilderness.flags, [], "Wilderness logins must not change interface flags");
  assert.deepEqual(wilderness.packets, [], "Wilderness logins must not replace the normal gameframe");
  assert.equal(play!({ player: wilderness.player }), false);

  const disconnected = playerAt(new Location(3200, 3200, 0));
  login!({ player: disconnected.player });
  disconnect!({ player: disconnected.player });
  await Promise.resolve();
  assert.deepEqual(disconnected.roots, []);

  const loggedOut = playerAt(new Location(3200, 3200, 0));
  login!({ player: loggedOut.player });
  logout!({ player: loggedOut.player });
  await Promise.resolve();
  assert.deepEqual(loggedOut.roots, []);

  console.log("welcome screen plugin ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
