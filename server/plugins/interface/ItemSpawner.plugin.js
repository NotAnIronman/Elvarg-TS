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

function isDeveloper(player) {
  return player?.getRights?.() === PlayerRights.DEVELOPER;
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

    api.onInterfaceActionButton(RESULT_UIDS, ({ player, itemId }) => {
      if (!isDeveloper(player) || !Number.isInteger(itemId)) return true;
      const count = CacheDefinitions.getCounts().items;
      if (itemId <= 0 || itemId >= count) return true;
      player.getInventory().adds(itemId, 1);
      player.getPacketSender().sendMessage(`Spawned item ${itemId}.`);
      return true;
    });
  },
};
