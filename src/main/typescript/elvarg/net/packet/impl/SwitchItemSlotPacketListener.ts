import { PacketExecutor } from "../PacketExecutor";
import { Packet } from "../Packet";

const getBankCtor = () =>
  require("../../../game/model/container/impl/Bank")
    .Bank as typeof import("../../../game/model/container/impl/Bank").Bank;
const getInventoryCtor = () =>
  require("../../../game/model/container/impl/Inventory")
    .Inventory as typeof import("../../../game/model/container/impl/Inventory").Inventory;
const getEquipmentCtor = () =>
  require("../../../game/model/container/impl/Equipment")
    .Equipment as typeof import("../../../game/model/container/impl/Equipment").Equipment;

export class SwitchItemSlotPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet) {
    if (player.getHitpoints() <= 0) return;
    const interfaceId = packet.readInt();
    packet.readByteC();
    const fromSlot = packet.readLEShortA();
    const toSlot = packet.readLEShort();
    SwitchItemSlotPacketListener.move(player, interfaceId, fromSlot, toSlot);
  }

  public static move(player: any, interfaceId: number, fromSlot: number, toSlot: number): void {
    if (player == null || player.getHitpoints() <= 0) {
      return;
    }

    const Bank = getBankCtor();
    if (
      interfaceId >= Bank.CONTAINER_START &&
      interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS
    ) {
      const tab = player.isSearchingBank()
        ? Bank.BANK_SEARCH_TAB_INDEX
        : interfaceId - Bank.CONTAINER_START;

      if (
        fromSlot >= 0 &&
        fromSlot < player.getBank(tab).capacity() &&
        toSlot >= 0 &&
        toSlot < player.getBank(tab).capacity() &&
        toSlot !== fromSlot
      ) {
        Bank.rearrange(player, player.getBank(tab), fromSlot, toSlot);
      }
      return;
    }

    const Inventory = getInventoryCtor();
    const Equipment = getEquipmentCtor();
    switch (interfaceId) {
      case Inventory.INTERFACE_ID:
      case Bank.INVENTORY_INTERFACE_ID:
      case Equipment.INVENTORY_INTERFACE_ID:
        if (
          fromSlot >= 0 &&
          fromSlot < player.getInventory().capacity() &&
          toSlot >= 0 &&
          toSlot < player.getInventory().capacity() &&
          toSlot !== fromSlot
        ) {
          player.getInventory().swap(fromSlot, toSlot).refreshItems();
        }
        break;
    }
  }
}
