import { PacketExecutor } from "../PacketExecutor";
import { Packet } from "../Packet";
import { Item } from "../../../game/model/Item";
import { Sound } from "../../../game/Sound";
import { Inventory } from "../../../game/model/container/impl/Inventory";
import { ItemOnGroundManager } from "../../../game/entity/impl/grounditem/ItemOnGroundManager";
import { Sounds } from "../../../game/Sounds";
import { PlayerRights } from "../../../game/model/rights/PlayerRights";
import { Wilderness } from "../../../game/content/wilderness/Wilderness";
import { PluginManager } from "../../../plugins/PluginManager";
import { PluginItemDropEvent } from "../../../plugins/PluginTypes";

export class DropItemPacketListener implements PacketExecutor {
  public static destroyItemInterface(player: any, item: any) {
    player.setDestroyItem(item.getId());
    let info: { [key: string]: string }[] = [
      { "Are you sure you want to discard this item?": "14174" },
      { "Yes.": "14175" },
      { "No.": "14176" },
      { "": "14177" },
      { "This item will vanish once it hits the floor.": "14182" },
      { "You cannot get it back if discarded.": "14183" },
      { [item.getDefinition().getName()]: "14184" },
    ];
    player.getPacketSender().sendItemOnInterface(14171, item.getId(), 0, item.getAmount());
    for (let i = 0; i < info.length; i++)
      player.getPacketSender().sendString(info[i][0], parseInt(info[i][1]));
    player.getPacketSender().sendChatboxInterface(14170);
  }

  public execute(player: any, packet: Packet) {
    let id = packet.readUnsignedShortA();
    let interfaceId = packet.readUnsignedShort();
    let itemSlot = packet.readUnsignedShortA();

    if (player == null || player.getHitpoints() <= 0) {
      return;
    }

    if (interfaceId != Inventory.INTERFACE_ID) {
      return;
    }

    if (player.getHitpoints() <= 0) return;

    if (itemSlot < 0 || itemSlot >= player.getInventory().capacity()) return;

    if (player.busy()) {
      player.getPacketSender().sendInterfaceRemoval();
    }

    let item = player.getInventory().getItems()[itemSlot];
    if (item == null) return;
    if (item.getId() != id || item.getAmount() <= 0) {
      return;
    }

    if (player.getRights() == PlayerRights.DEVELOPER) {
      player.getPacketSender().sendMessage("Drop item: " + item.getId().toString() + ".");
    }

    player.getPacketSender().sendInterfaceRemoval();

    // Stop skilling..
    player.getSkillManager().stopSkillable();

    const dropEvent: PluginItemDropEvent = {
      player,
      interfaceId,
      item,
      itemId: id,
      slot: itemSlot,
      dropToGround: true,
      handled: false,
    };
    const pluginHandled = PluginManager.emitItemDropPolicy(dropEvent);
    if (pluginHandled) {
      Sounds.sendSound(player, Sound.DROP_ITEM);
      return;
    }

    if (item.getDefinition().isDropable()) {
      if (dropEvent.dropToGround !== false) {
        const toFloor = new Item(item.getId(), item.getAmount());
        if (Wilderness.isIn(player)) {
          ItemOnGroundManager.registerGlobal(player, toFloor);
        } else {
          ItemOnGroundManager.registers(player, toFloor);
        }
      }

      player.getInventory().setItem(itemSlot, new Item(-1, 0)).refreshItems();
      Sounds.sendSound(player, Sound.DROP_ITEM);
    } else {
      DropItemPacketListener.destroyItemInterface(player, item);
    }
  }
}
