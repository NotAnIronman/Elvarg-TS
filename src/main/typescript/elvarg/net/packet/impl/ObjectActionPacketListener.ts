import { MapObjects } from "../../../game/entity/impl/object/MapObjects";
import { Player } from "../../../game/entity/impl/player/Player";
import { Location } from "../../../game/model/Location";
import { PluginManager } from "../../../plugins/PluginManager";
import { Packet } from "../Packet";
import { PacketConstants } from "../PacketConstants";
import { PacketExecutor } from "../PacketExecutor";
import { Bank } from "../../../game/model/container/impl/Bank";

type ParsedObjectAction = {
  id: number;
  x: number;
  y: number;
  clickType: number;
};

export class ObjectActionPacketListener implements PacketExecutor {
  public execute(player: Player, packet: Packet): void {
    const parsed = this.parseObjectAction(packet);
    if (parsed) this.executeAction(player, parsed.id, parsed.x, parsed.y, parsed.clickType);
  }

  public executeAction(
    player: Player,
    id: number,
    x: number,
    y: number,
    clickType = 0,
    action?: string
  ): void {
    if (!player || player.getHitpoints() <= 0 || player.busy()) {
      return;
    }
    const objectLocation = new Location(
      x,
      y,
      player.getLocation().getZ()
    );
    const sourceLocation = player.getLocation().clone();
    const object = MapObjects.getPrivateArea(player, id, objectLocation);
    if (!object) {
      return;
    }
    if (clickType < 1 || clickType > 5) {
      const normalized = action?.trim().toLowerCase();
      clickType = normalized
        ? (object.getDefinition()?.getInteractions()?.findIndex((option) => option?.toLowerCase() === normalized) ?? -1) + 1
        : 0;
    }
    if (clickType < 1 || clickType > 5) return;

    player.getMovementQueue().walkToObject(object, {
      execute: () => {
        player.getMovementQueue().reset();
        player.getMovementQueue().walkToReset();
        player.setPositionToFace(object.getLocation());

        const option = object.getDefinition()?.getInteractions()?.[clickType - 1]?.toLowerCase();
        if (option === "bank") {
          player.getBank(player.getCurrentBankTab()).open();
          return;
        }

        const pluginHandled = PluginManager.emitObjectInteraction({
          player,
          object,
          objectId: object.getId(),
          clickType,
          location: {
            x: object.getLocation().getX(),
            y: object.getLocation().getY(),
            z: object.getLocation().getZ(),
          },
          sourceLocation: {
            x: sourceLocation.getX(),
            y: sourceLocation.getY(),
            z: sourceLocation.getZ(),
          },
          handled: false,
        });
        if (pluginHandled) {
          return;
        }

        player.getArea()?.handleObjectClick(player, object, clickType);
      },
    });
  }

  private parseObjectAction(packet: Packet): ParsedObjectAction | null {
    switch (packet.getOpcode()) {
      case PacketConstants.OBJECT_FIRST_CLICK_OPCODE: {
        const x = packet.readLEShortA();
        const id = packet.readUnsignedShort();
        const y = packet.readUnsignedShortA();
        return { id, x, y, clickType: 1 };
      }
      case PacketConstants.OBJECT_SECOND_CLICK_OPCODE: {
        const id = packet.readLEShortA();
        const y = packet.readLEShort();
        const x = packet.readUnsignedShortA();
        return { id, x, y, clickType: 2 };
      }
      case PacketConstants.OBJECT_THIRD_CLICK_OPCODE: {
        const x = packet.readLEShort();
        const y = packet.readShort();
        const id = packet.readLEShortA();
        return { id, x, y, clickType: 3 };
      }
      case PacketConstants.OBJECT_FOURTH_CLICK_OPCODE: {
        const x = packet.readLEShortA();
        const id = packet.readUnsignedShortA();
        const y = packet.readLEShortA();
        return { id, x, y, clickType: 4 };
      }
      default:
        return null;
    }
  }
}
