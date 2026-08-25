import { strict as assert } from "assert";
import { World } from "../src/main/typescript/elvarg/game/World";
import { PlayerRights } from "../src/main/typescript/elvarg/game/model/rights/PlayerRights";
import { encodeHandshake } from "../src/main/typescript/elvarg/net/protocol/ClientProtocol";
import { ChatPacketListener } from "../src/main/typescript/elvarg/net/packet/impl/ChatPacketListener";

const StaffCrowns = require("../plugins/interface/StaffCrowns.plugin");

let login: ((event: any) => void) | undefined;
StaffCrowns.register(new Proxy<any>({
  onPlayerLogin: (handler: any) => { login = handler; },
}, {
  get: (target, property) => target[property] ?? (() => undefined),
}));

assert.ok(login, "plugin must consume the player login hook");

function iconsFor(rights: PlayerRights): number[] {
  let icons: number[] = [];
  login!({
    player: {
      getRights: () => rights,
      setChatIcons: (value: readonly number[]) => { icons = [...value]; },
    },
  });
  return icons;
}

assert.deepEqual(iconsFor(PlayerRights.NONE), []);
assert.deepEqual(iconsFor(PlayerRights.MODERATOR), [0]);
assert.deepEqual(iconsFor(PlayerRights.ADMINISTRATOR), [1]);
assert.deepEqual(iconsFor(PlayerRights.DEVELOPER), [1]);

const handshake = encodeHandshake(7, "Developer", true, undefined, [1]);
const payload = handshake.subarray(2);
let offset = 4;
while (payload[offset++] !== 0) {}
assert.equal(payload[offset++], 0, "test handshake must omit appearance");
assert.equal(payload[offset++], 1, "handshake must carry one chat icon");
assert.equal(payload[offset++], 1, "handshake must carry the gold staff crown");

let overhead = "";
let publicChat: { text: string; from: string; playerId: number } | undefined;
const player = {
  getChatIcons: () => [0],
  getHostAddress: () => "127.0.0.1",
  getIndex: () => 7,
  getLocalPlayers: () => [],
  getPacketSender: () => ({
    sendPublicChat: (text: string, from: string, playerId: number) => {
      publicChat = { text, from, playerId };
    },
  }),
  getRelations: () => ({ canReceivePublicChatFrom: () => true }),
  getUsername: () => "Moderator",
  forceChat: (text: string) => { overhead = text; },
};

const originalNearbyPlayers = World.getNearbyPlayersForUpdate;
(World as any).getNearbyPlayersForUpdate = () => [];
try {
  ChatPacketListener.handleText(player, "Hello");
} finally {
  (World as any).getNearbyPlayersForUpdate = originalNearbyPlayers;
}

assert.equal(overhead, "<img=0>Hello");
assert.deepEqual(publicChat, {
  text: "Hello",
  from: "<img=0>Moderator",
  playerId: 7,
});

console.log("staff crowns plugin ok");
