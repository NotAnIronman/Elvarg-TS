import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { PluginManager } from "../../../plugins/PluginManager";

export class InterfaceActionClickOpcode implements PacketExecutor {
  execute(player: any, packet: Packet) {
    InterfaceActionClickOpcode.handle(player, packet.readInt(), packet.readByte());
  }

  public static handle(
    player: any,
    interfaceId: number,
    action: number,
    metadata: { itemId?: number; slot?: number; option?: string } = {}
  ): void {

    if (
      player == null ||
      player.getHitpoints() <= 0 ||
      player.isTeleportingReturn()
    ) {
      return;
    }

    if (
      PluginManager.emitInterfaceActionClick({
        player,
        buttonId: interfaceId,
        action,
        ...metadata,
        handled: false,
      })
    ) {
      return;
    }
  }
}
