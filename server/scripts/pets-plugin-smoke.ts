import { strict as assert } from "node:assert";

const npcPath = require.resolve(
  "../src/main/typescript/elvarg/game/entity/impl/npc/NPC",
);

class FakeNpc {
  private readonly attributes = new Map<object, unknown>();

  constructor(private readonly id: number, private readonly location: unknown) {}

  getId() {
    return this.id;
  }

  getLocation() {
    return this.location;
  }

  getIndex() {
    return -1;
  }

  isRegistered() {
    return false;
  }

  setPet() {}
  setAttribute(key: object, value: unknown) { this.attributes.set(key, value); }
  getAttribute(key: object) { return this.attributes.get(key); }
  setOwner() {}
  setFollowing() {}
  setMobileInteraction() {}
  setArea() {}
}

require.cache[npcPath] = {
  exports: {
    NPC: {
      create: (id: number, location: unknown) => new FakeNpc(id, location),
    },
  },
} as NodeModule;

const { Pets } = require("../plugins/npcs/Pets.plugin.js");

type AddedNpc = { getId(): number };

function createPlayer() {
  let currentPet: AddedNpc | null = null;
  const messages: string[] = [];
  const addedItems: Array<[number, number]> = [];

  const player = {
    getUsername: () => "pets-smoke",
    getCurrentPet: () => currentPet,
    setCurrentPet: (pet: AddedNpc | null) => { currentPet = pet; },
    getArea: () => null,
    outterTiles: () => [],
    getLocation: () => ({ clone: () => ({}) }),
    getInventory: () => ({
      isFull: () => false,
      adds: (itemId: number, amount: number) => { addedItems.push([itemId, amount]); },
    }),
    getPacketSender: () => ({ sendMessage: (message: string) => messages.push(message) }),
  };

  return { player, getCurrentPet: () => currentPet, messages, addedItems };
}

const api = {
  getWorld: () => ({
    getNpcs: () => ({ add: () => true }),
    getAddNPCQueue: () => [],
    getRemoveNPCQueue: () => [],
  }),
  getRegionManager: () => ({ blocked: () => false }),
  getItemOnGroundManager: () => ({}),
  log: () => undefined,
  onItemDropPolicy: () => undefined,
  onNpcFirstClick: () => undefined,
  onNpcSecondClick: () => undefined,
  onNpcThirdClick: () => undefined,
  onPlayerLogout: () => undefined,
  onPlayerDisconnect: () => undefined,
  onPlayerLogin: () => undefined,
};

const plugin = require("../plugins/npcs/Pets.plugin.js");
plugin.register(api);

for (const [itemId, expectedNpcId] of [
  [20661, 7335], // Tangleroot
  [20663, 7336], // Rocky
  [12647, 6637], // Kalphite princess variant
  [12939, 2130], // Snakeling variant
  [19730, 6296], // Bloodhound
] as const) {
  const state = createPlayer();
  assert.equal(Pets.drop(state.player, itemId, true), true);
  assert.equal(state.getCurrentPet()?.getId(), expectedNpcId);
  assert.deepEqual(state.messages, ["You have a funny feeling like you're being followed."]);
  assert.deepEqual(state.addedItems, []);
}

console.log("Pets plugin smoke test passed");
