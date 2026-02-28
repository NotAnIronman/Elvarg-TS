import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class FinalizedMapRegionChangePacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    // The web client clears player options during gameplay-screen setup.
    // Re-send baseline options after the first finalized-map-region packet so
    // right-click interactions remain available.
    player?.getPacketSender?.()?.sendInteractionOption?.("Follow", 3, false);
    player?.getPacketSender?.()?.sendInteractionOption?.("Trade With", 4, false);
  }
}
