// import { ClanChatManager } from "../../../game/content/clan/ClanChatManager";
// import { Bank } from "../../../game/model/container/impl/Bank";
// import { Presetables } from "../../../game/content/presets/Presetables";
// import { TeleportHandler } from "../../../game/model/teleportation/TeleportHandler";
// import { Player } from "../../../game/entity/impl/player/Player";
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { PluginManager } from "../../../plugins/PluginManager";

export class InterfaceActionClickOpcode implements PacketExecutor {
  // execute(player: Player, packet: Packet) {
  execute(player: any, packet: Packet) {
    let interfaceId = packet.readInt();
    let action = packet.readByte();

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
        handled: false,
      })
    ) {
      return;
    }

    // if (Bank.handleButton(player, interfaceId, action)) {
    //     return;
    // }

    // if (ClanChatManager.handleButton(player, interfaceId, action)) {
    //     return;
    // }

    // if (Presetables.handleButton(player, interfaceId)) {
    //     return;
    // }

    // if (TeleportHandler.handleButton(player, interfaceId, action)) {
    //     return;
    // }
  }
}
