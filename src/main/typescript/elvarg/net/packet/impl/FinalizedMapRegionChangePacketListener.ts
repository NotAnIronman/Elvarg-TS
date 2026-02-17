import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class FinalizedMapRegionChangePacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    // Intentionally no-op, matching the Java server listener.
  }
}
