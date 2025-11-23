// Auto-generated no-op listener for unhandled client packets
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class NOPPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    return;
  }
}
