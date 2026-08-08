import { MapObjects } from "../../../game/entity/impl/object/MapObjects";
import { World } from "../../../game/World";
import { Location } from "../../../game/model/Location";
import { PluginManager } from "../../../plugins/PluginManager";
import { Packet } from "../Packet";
import { PacketConstants } from "../PacketConstants";
import { PacketExecutor } from "../PacketExecutor";

export class UseItemPacketListener implements PacketExecutor {
  public static itemOnItem(player: any, usedItemSlot: number, usedWithSlot: number): void {
    if (
      usedWithSlot < 0 ||
      usedItemSlot < 0 ||
      usedItemSlot >= player.getInventory().capacity() ||
      usedWithSlot >= player.getInventory().capacity()
    ) {
      return;
    }

    const usedItem = player.getInventory().getItems()[usedItemSlot];
    const usedWithItem = player.getInventory().getItems()[usedWithSlot];
    if (!usedItem || !usedWithItem) {
      return;
    }

    PluginManager.emitItemOnItem({
      player,
      usedItem,
      usedItemId: usedItem.getId(),
      usedItemSlot,
      usedWithItem,
      usedWithItemId: usedWithItem.getId(),
      usedWithItemSlot: usedWithSlot,
      handled: false,
    });
  }

  private static itemOnObject(player: any, packet: Packet): void {
    const interfaceType = packet.readShort();
    const objectId = packet.readShort();
    const objectY = packet.readLEShortA();
    const itemSlot = packet.readLEShort();
    const objectX = packet.readLEShortA();
    const itemId = packet.readShort();

    if (itemSlot < 0 || itemSlot >= player.getInventory().capacity()) {
      return;
    }

    const item = player.getInventory().getItems()[itemSlot];
    if (!item || item.getId() !== itemId) {
      return;
    }

    const position = new Location(objectX, objectY, player.getLocation().getZ());
    const object = MapObjects.getPrivateArea(player, objectId, position);
    if (!object) {
      return;
    }

    player.getMovementQueue().walkToObject(object, {
      execute: () => {
        player.getMovementQueue().reset();
        player.getMovementQueue().walkToReset();
        player.setPositionToFace(object.getLocation());

        const handled = PluginManager.emitItemOnObject({
          player,
          object,
          objectId: object.getId(),
          item,
          itemId,
          itemSlot,
          interfaceType,
          location: {
            x: object.getLocation().getX(),
            y: object.getLocation().getY(),
            z: object.getLocation().getZ(),
          },
          handled: false,
        });

        if (!handled) {
          player.getPacketSender().sendMessage("Nothing interesting happens.");
        }
      },
    });
  }

  public static itemOnGroundItem(player: any, inventoryItemId: number, groundItemId: number, x: number, y: number, inventorySlot?: number): void {
    if (!player.getInventory().contains(inventoryItemId)) {
      return;
    }

    const inventoryItem = Number.isInteger(inventorySlot)
      ? player.getInventory().getItems()[inventorySlot!]
      : player.getInventory().getItems().find((it: any) => it && it.getId() === inventoryItemId);
    if (!inventoryItem || inventoryItem.getId() !== inventoryItemId) {
      return;
    }

    PluginManager.emitItemOnGroundItem({
      player,
      inventoryItem,
      inventoryItemId,
      groundItemId,
      location: { x, y, z: player.getLocation().getZ() },
      handled: false,
    });
  }

  public static itemOnPlayer(player: any, interfaceId: number, targetIndex: number, itemId: number, slot: number): void {
    if (slot < 0 || slot >= player.getInventory().capacity()) {
      return;
    }

    const target = World.getPlayers().get(targetIndex);
    if (!target) {
      return;
    }

    const item = player.getInventory().getItems()[slot];
    if (!item || item.getId() !== itemId) {
      return;
    }

    player.getMovementQueue().walkToEntity(target, () => {
      player.setPositionToFace(target.getLocation());
      PluginManager.emitItemOnPlayer({
        player,
        target,
        targetIndex,
        interfaceId,
        item,
        itemId,
        slot,
        handled: false,
      });
    });
  }

  public execute(player: any, packet: Packet) {
    if (!player || player.getHitpoints?.() <= 0) {
      return;
    }

    switch (packet.getOpcode()) {
      case PacketConstants.ITEM_ON_ITEM: {
        const usedWithSlot = packet.readUnsignedShort();
        const usedItemSlot = packet.readUnsignedShortA();
        UseItemPacketListener.itemOnItem(player, usedItemSlot, usedWithSlot);
        break;
      }
      case PacketConstants.ITEM_ON_OBJECT:
        UseItemPacketListener.itemOnObject(player, packet);
        break;
      case PacketConstants.ITEM_ON_GROUND_ITEM:
        packet.readLEShort();
        const inventoryItemId = packet.readShortA();
        const groundItemId = packet.readShort();
        const y = packet.readShortA();
        const inventorySlot = packet.readLEShortA();
        UseItemPacketListener.itemOnGroundItem(player, inventoryItemId, groundItemId, packet.readShort(), y, inventorySlot);
        break;
      case PacketConstants.ITEM_ON_PLAYER:
        UseItemPacketListener.itemOnPlayer(
          player, packet.readUnsignedShortA(), packet.readUnsignedShort(),
          packet.readUnsignedShort(), packet.readLEShort()
        );
        break;
      default:
        break;
    }
  }
}
