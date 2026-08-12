import { MapObjects } from "../../../game/entity/impl/object/MapObjects";
import { Player } from "../../../game/entity/impl/player/Player";
import { Location } from "../../../game/model/Location";
import { PluginManager } from "../../../plugins/PluginManager";

export class ObjectActionPacketListener {
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

        console.warn(
          `[object-click-debug] unhandled id=${object.getId()} name="${object.getDefinition()?.getName() ?? "?"}" ` +
          `type=${object.getType()} face=${object.getFace()} loc=${object.getLocation().getX()},${object.getLocation().getY()},${object.getLocation().getZ()} ` +
          `action="${object.getDefinition()?.getInteractions()?.[clickType - 1] ?? "?"}"`
        );

        player.getArea()?.handleObjectClick(player, object, clickType);
      },
    });
  }
}
