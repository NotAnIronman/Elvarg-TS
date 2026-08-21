const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { CacheDefinitions } = require("../../src/main/typescript/elvarg/game/cache/CacheDefinitions");
const { ItemSearchIndex } = require("../../src/main/typescript/elvarg/game/cache/ItemSearchIndex");
const {
  GROUP_ID,
  ICON_START,
  SLOT_COUNT,
  uid,
  buildItemSpawnerWidgetGroup,
} = require("./itemSpawnerWidget");

const MAIN_MODAL_UID = (161 << 16) | 16;
const CLOSE_UID = uid(7);
const RESULT_UIDS = Array.from({ length: SLOT_COUNT }, (_, slot) => uid(ICON_START + slot));
const WIDGET_GROUP = buildItemSpawnerWidgetGroup();

const SEARCH_ENDPOINT = "items";
const SEARCH_RESULT_LIMIT = 250;

/**
 * Everything the client needs to build and run this interface: the widget group, which
 * component takes typing, where the rows come from, and how to lay them out. The client
 * has no idea it is spawning items - it types, fetches, scrolls and renders what this
 * describes. Served at /api/interfaces/30002 and fetched on first open.
 */
const INTERFACE_DEFINITION = {
  groupId: GROUP_ID,
  widgets: WIDGET_GROUP.widgets,
  search: {
    inputComponent: 4,
    backgroundComponent: 10,
    focusComponents: [4, 10],
    maxLength: 60,
    placeholder: "<col=8f7f66>Search items...</col>",
    caret: "<col=ffcf70>|</col>",
    textTemplate: "<col=e8ded0>%s</col>",
    focusColor: 0x3a3125,
    blurColor: 0x2b241b,
    blurHoverColor: 0x342b20,
    endpoint: `/api/${SEARCH_ENDPOINT}`,
    queryParam: "q",
    limit: SEARCH_RESULT_LIMIT,
  },
  list: {
    viewComponent: 8,
    scrollbarComponent: 9,
    slotCount: SLOT_COUNT,
    columns: 8,
    rowHeight: 44,
    iconStart: ICON_START,
    iconBaseY: 2,
    backgroundStart: 20,
    backgroundBaseY: 0,
    itemLabel: "<col=ffcf70>%name</col> <col=c5b79b>(id %id)</col>",
  },
  status: {
    component: 5,
    idle: "<col=c5b79b>Start typing to filter cache item names.</col>",
    empty: "<col=ff981f>No matches found in cache.</col>",
    matches: "Matches: <col=40ff40>%total</col>",
    truncated: "Matches: <col=40ff40>%total</col> <col=c5b79b>(showing %shown)</col>",
  },
  hint: {
    component: 6,
    text: "<col=c5b79b>Type to search cache items.</col>",
  },
};

const OP_SPAWN = 1;
const OP_SPAWN_X = 2;
// Item amounts are a signed 32-bit value; the container clamps stacks itself and
// stops adding non-stackables once the inventory is full.
const MAX_SPAWN_AMOUNT = 2147483647;

function isDeveloper(player) {
  return player?.getRights?.() === PlayerRights.DEVELOPER;
}

function isSpawnableItem(itemId) {
  return (
    Number.isInteger(itemId) &&
    itemId > 0 &&
    itemId < CacheDefinitions.getCounts().items
  );
}

function itemName(itemId) {
  const name = CacheDefinitions.getItem(itemId)?.name;
  return name && name !== "null" ? name : `item ${itemId}`;
}

function spawnItem(player, itemId, amount) {
  player.getInventory().adds(itemId, amount);
  player
    .getPacketSender()
    .sendMessage(`Spawned ${amount} x ${itemName(itemId)} (${itemId}).`);
}

module.exports = {
  name: "ItemSpawner",
  register(api) {
    // Item names come from the cache and are not player-specific, so they are served over
    // the content API rather than the game socket: a search is request/response shaped,
    // and this keeps a keystroke's worth of traffic off the tick loop.
    api.registerCustomInterface(INTERFACE_DEFINITION);

    api.registerContentEndpoint(SEARCH_ENDPOINT, (query) => {
      const requested = Number.parseInt(query.get("limit") ?? "", 10);
      const limit = Number.isInteger(requested)
        ? Math.max(1, Math.min(requested, SEARCH_RESULT_LIMIT))
        : SEARCH_RESULT_LIMIT;
      const { total, rows } = ItemSearchIndex.search(query.get("q") ?? "", limit);
      return { total, rows: rows.map((entry) => ({ id: entry.itemId, name: entry.name })) };
    });

    api.registerCommand("items", ({ player }) => {
      if (!isDeveloper(player)) {
        player.getPacketSender().sendMessage("You do not have permission to use this command.");
        return true;
      }
      const sender = player.getPacketSender();
      player.setInterfaceId(GROUP_ID);
      sender.sendSubInterface(MAIN_MODAL_UID, GROUP_ID, 0, {
        hiddenUids: [uid(2), uid(3)],
        postScripts: [
          { scriptId: 3737, args: [uid(1), "Item Spawner"] },
          { scriptId: 2424, args: [CLOSE_UID, 496, 0, "Close"] },
        ],
      });
      return true;
    });

    api.onInterfaceActionButton(CLOSE_UID, ({ player }) => {
      player.setInterfaceId(-1);
      player.getPacketSender().closeSubInterface(MAIN_MODAL_UID);
      return true;
    });

    api.onInterfaceActionButton(RESULT_UIDS, ({ player, itemId, action }) => {
      if (!isDeveloper(player) || !isSpawnableItem(itemId)) return true;

      if (action === OP_SPAWN_X) {
        player.setEnteredAmountAction({
          execute: (amount) => {
            // Re-checked on resume: the prompt is answered on a later tick, and
            // this is a privileged action.
            if (!isDeveloper(player) || !isSpawnableItem(itemId)) return;
            const requested = Math.floor(Number(amount));
            if (!Number.isFinite(requested) || requested < 1) return;
            spawnItem(player, itemId, Math.min(requested, MAX_SPAWN_AMOUNT));
          },
        });
        player
          .getPacketSender()
          .sendEnterAmountPrompt(`Enter the amount of ${itemName(itemId)} to spawn.`);
        return true;
      }

      if (action !== OP_SPAWN) return true;
      spawnItem(player, itemId, 1);
      return true;
    });
  },
};
