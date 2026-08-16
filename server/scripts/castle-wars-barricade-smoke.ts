import { strict as assert } from "assert";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { ItemIdentifiers } from "../src/main/typescript/elvarg/util/ItemIdentifiers";
import { NpcIdentifiers } from "../src/main/typescript/elvarg/util/NpcIdentifiers";

const weaponInterfacesPath = require.resolve(
  "../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces"
);
require.cache[weaponInterfacesPath] = {
  exports: { WeaponInterfaces: { assign: () => undefined } },
} as NodeModule;
const npcPath = require.resolve(
  "../src/main/typescript/elvarg/game/entity/impl/npc/NPC"
);
require.cache[npcPath] = {
  exports: {
    NPC: class {
      constructor(private readonly id: number, private readonly location: Location) {}
      getId() { return this.id; }
      getLocation() { return this.location; }
      getPrivateArea() { return null; }
    },
  },
} as NodeModule;
const CastleWars = require("../plugins/minigames/CastleWars.plugin");

async function main() {
  let itemAction: ((event: any) => void) | undefined;
  let deletedSlot = -1;
  const addedNpcs: any[] = [];
  const clipping: any[][] = [];
  const api = new Proxy<any>({
    getAreaManager: () => ({ areas: [] }),
    getBonusManager: () => ({}),
    getObjectManager: () => ({ existsLocation: () => false }),
    getRegionManager: () => ({
      BLOCKED_TILE: 0x200000,
      blocked: () => false,
      addClipping: (...args: any[]) => clipping.push(args),
    }),
    getTaskManager: () => ({}),
    getWorld: () => ({
      getAddNPCQueue: () => addedNpcs,
      getRemoveNPCQueue: () => [],
      isNpcOccupyingTile: () => false,
    }),
    onItemAction: (handler: (event: any) => void) => {
      itemAction = handler;
    },
  }, {
    get: (target, property) => target[property] ?? (() => undefined),
  });

  CastleWars.register(api);
  assert.ok(itemAction, "Castle Wars must register the barricade item action");

  const location = new Location(2400, 3100, 0);
  const player = {
    getLocation: () => location,
    getPrivateArea: () => null,
    getInventory: () => ({ deleteAtSlot: (slot: number) => { deletedSlot = slot; } }),
    getPacketSender: () => ({ sendMessage: () => undefined }),
  };
  const event = { player, itemId: ItemIdentifiers.BARRICADE, slot: 7, clickType: 2, handled: false };
  itemAction!(event);
  assert.equal(event.handled, true);
  assert.equal(deletedSlot, 7);
  assert.equal(addedNpcs[0].getId(), NpcIdentifiers.BARRICADE);
  assert.equal(clipping[0][3], 0x200000);

  console.log("Castle Wars barricade setup passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
