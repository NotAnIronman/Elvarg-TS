// import { Player } from '../../../game/entity/impl/player/Player';
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class PlayerInactivePacketListener implements PacketExecutor {
  execute(player: any, packet: Packet) {
    if (!player || player.getHitpoints?.() <= 0) {
      return;
    }
    if (player.canLogout?.()) {
      player.requestLogout?.();
    }
  }
}
