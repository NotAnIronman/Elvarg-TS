import { PluginManager } from "../../../plugins/PluginManager";

const getInventoryCtor = () =>
  require("../../../game/model/container/impl/Inventory")
    .Inventory as typeof import("../../../game/model/container/impl/Inventory").Inventory;
const getEquipPacketListener = () =>
  require("./EquipPacketListener")
    .EquipPacketListener as typeof import("./EquipPacketListener").EquipPacketListener;

export class ItemActionPacketListener {
  public static handleAction(player: any, interfaceId: number, itemId: number, slot: number, clickType: number): void {
    if (clickType === 1) return this.handleFirstAction(player, interfaceId, itemId, slot);
    const item = player?.getInventory?.().getItems()[slot];
    if (!item || item.getId() !== itemId) return;
    PluginManager.emitItemAction({ player, interfaceId, item, itemId, slot, clickType, handled: false });
  }

  /**
   * Handles inventory first-click semantics once interface/id/slot are decoded.
   */
  public static handleFirstAction(
    player: any,
    interfaceId: number,
    itemId: number,
    slot: number
  ): void {
    if (!player) {
      return;
    }
    if (slot < 0 || slot >= player.getInventory().capacity()) {
      return;
    }
    if (player.getInventory().getItems()[slot].getId() != itemId) {
      return;
    }

    if (player.isTeleportingReturn() || player.getHitpoints() <= 0) {
      return;
    }

    const currentItem = player.getInventory().getItems()[slot];
    if (!currentItem || currentItem.getId() !== itemId) {
      return;
    }

    const pluginHandled = PluginManager.emitItemAction({
      player,
      interfaceId,
      item: currentItem,
      itemId,
      slot,
      clickType: 1,
      handled: false,
    });
    if (pluginHandled) {
      return;
    }

    // Left-click inventory action for wieldables should behave like clicking "Wield/Wear".
    const Inventory = getInventoryCtor();
    if (interfaceId === Inventory.INTERFACE_ID) {
      const item = player.getInventory().getItems()[slot];
      const equipSlot = item
        ?.getDefinition?.()
        ?.getEquipmentType?.()
        ?.getSlot?.();
      if (Number.isInteger(equipSlot) && equipSlot >= 0) {
        getEquipPacketListener().equip(player, itemId, slot, interfaceId);
        return;
      }
    }

    // Non-equipment item actions interrupt the current modal. Equipping has its own
    // interface guard so the equipment-stats screen can remain open like OSRS.
    player.getPacketSender().sendInterfaceRemoval();

    switch (itemId) {
      case 9520:
        player
          .getPacketSender()
          .sendMessage("You cannot use this in the Wilderness!");
        break;

      case 2542:
      case 2543:
      case 2544:
        if (player.busy()) {
          player.getPacketSender().sendMessage("You cannot do that right now.");
          return;
        }
        if (
          (itemId == 2542 && player.isPreserveUnlocked()) ||
          (itemId == 2543 && player.isRigourUnlocked()) ||
          (itemId == 2544 && player.getAuguryUnlocked())
        ) {
          player
            .getPacketSender()
            .sendMessage("You have already unlocked that prayer.");
          return;
        }

        break;
      case 2545:
        if (player.busy()) {
          player.getPacketSender().sendMessage("You cannot do that right now.");
          return;
        }
        if (player.isTargetTeleportUnlocked()) {
          player
            .getPacketSender()
            .sendMessage("You have already unlocked that teleport.");
          return;
        }
        break;
      case 12873:
      case 12875:
      case 12879:
      case 12881:
      case 12883:
      case 12877:
    }
  }
}
