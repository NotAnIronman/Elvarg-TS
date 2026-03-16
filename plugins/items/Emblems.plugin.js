const { Emblem } = require("../../src/main/typescript/elvarg/game/content/combat/bountyhunter/Emblem");
const { ItemDefinition } = require("../../src/main/typescript/elvarg/game/definition/ItemDefinition");
const { ItemOnGroundManager } = require("../../src/main/typescript/elvarg/game/entity/impl/grounditem/ItemOnGroundManager");
const { Item } = require("../../src/main/typescript/elvarg/game/model/Item");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

const EMBLEM_IDS = new Set([
  Emblem.MYSTERIOUS_EMBLEM_1.id,
  Emblem.MYSTERIOUS_EMBLEM_2.id,
  Emblem.MYSTERIOUS_EMBLEM_3.id,
  Emblem.MYSTERIOUS_EMBLEM_4.id,
  Emblem.MYSTERIOUS_EMBLEM_5.id,
  Emblem.MYSTERIOUS_EMBLEM_6.id,
  Emblem.MYSTERIOUS_EMBLEM_7.id,
  Emblem.MYSTERIOUS_EMBLEM_8.id,
  Emblem.MYSTERIOUS_EMBLEM_9.id,
  Emblem.MYSTERIOUS_EMBLEM_10.id,
]);

const EMBLEM_TIER_1_ID = Emblem.MYSTERIOUS_EMBLEM_1.id;
const EMBLEM_TIER_2_ID = Emblem.MYSTERIOUS_EMBLEM_2.id;

function isEmblemItemId(itemId) {
  return Number.isInteger(itemId) && EMBLEM_IDS.has(itemId);
}

function resolveDowngradedEmblemId(itemId) {
  if (!isEmblemItemId(itemId) || itemId === EMBLEM_TIER_1_ID) {
    return null;
  }
  return itemId === EMBLEM_TIER_2_ID ? itemId - 2 : itemId - 1;
}

function toLocation(rawLocation, fallbackLocation) {
  if (rawLocation && typeof rawLocation.getX === "function") {
    return rawLocation;
  }
  if (
    rawLocation &&
    Number.isInteger(rawLocation.x) &&
    Number.isInteger(rawLocation.y)
  ) {
    return new Location(rawLocation.x, rawLocation.y, rawLocation.z ?? 0);
  }
  return fallbackLocation ?? null;
}

module.exports = {
  name: "Emblems",
  register(api) {
    api.onShouldKeepItemOnDeath((event) => {
      const itemId = event.item?.getId?.();
      if (!isEmblemItemId(itemId)) {
        return;
      }
      event.keep = false;
    });

    api.onPlayerDeathItemDrop((event) => {
      const itemId = event.item?.getId?.();
      if (!isEmblemItemId(itemId)) {
        return;
      }

      // Prevent default death-drop flow for emblems; this plugin owns it.
      event.handled = true;

      const downgradedEmblemId = resolveDowngradedEmblemId(itemId);
      if (
        !event.shouldDropItems ||
        !event.killer ||
        !Number.isInteger(downgradedEmblemId)
      ) {
        return;
      }

      const dropLocation = toLocation(
        event.location,
        event.player?.getLocation?.()?.clone?.()
      );
      if (!dropLocation) {
        return;
      }

      ItemOnGroundManager.registerNonGlobals(
        event.killer,
        new Item(downgradedEmblemId),
        dropLocation
      );

      const droppedName =
        ItemDefinition.forId(downgradedEmblemId)?.getName?.() ?? "Mysterious emblem";
      event.killer
        ?.getPacketSender?.()
        ?.sendMessage?.(
          `@red@${event.player?.getUsername?.() ?? "A player"} dropped a ${droppedName}!`
        );
    });

    api.log("registered", { emblemCount: EMBLEM_IDS.size });
  },
};
