// import { Player } from '../../../game/entity/impl/player/Player';
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class CreationMenuPacketListener implements PacketExecutor {
  // execute(player: Player, packet: Packet) {
  execute(player: any, packet: Packet) {
    const itemId = packet.readInt();
    const amount = packet.readUnsignedByte();
    const menu = player.getCreationMenu?.();
    if (menu != null) {
      menu.execute(itemId, amount);
      player.setCreationMenu?.(null);
    }
  }
}
