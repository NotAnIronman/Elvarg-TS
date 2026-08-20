const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { CacheDefinitions } = require("../../src/main/typescript/elvarg/game/cache/CacheDefinitions");
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
    api.registerCommand("items", ({ player }) => {
      if (!isDeveloper(player)) {
        player.getPacketSender().sendMessage("You do not have permission to use this command.");
        return true;
      }
      const sender = player.getPacketSender();
      sender.sendContentData("core.items", [{ key: "customWidgets", rows: [WIDGET_GROUP] }]);
      player.setInterfaceId(GROUP_ID);
      sender.sendSubInterface(MAIN_MODAL_UID, GROUP_ID, 0, {
        hiddenUids: [uid(2), uid(3)],
        postScripts: [
          { scriptId: 3737, args: [uid(1), "Item Spawner"] },
          { scriptId: 2424, args: [CLOSE_UID, 496, 0, "Close"] },
        ],
      });
      sender
        .sendString("<col=c5b79b>Type to search cache items.</col>", uid(6))
        .sendString("<col=c5b79b>Start typing to filter cache item names.</col>", uid(5));
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
