import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { Wilderness } from "../../../game/content/wilderness/Wilderness";
import { Location } from "../../../game/model/Location";

function formatWildernessLevelText(tile: { x: number; y: number }): string {
  const level = Wilderness.levelForY(tile.y);
  const combatTag = Wilderness.isMulti(tile.x, tile.y) ? "@red@M@whi@" : "@gre@S@whi@";
  return `${combatTag} Lvl ${level}`;
}

export class FinalizedMapRegionChangePacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    // The web client clears player options during gameplay-screen setup.
    // Re-send baseline options after the first finalized-map-region packet so
    // right-click interactions remain available.
    player?.getPacketSender?.()?.sendInteractionOption?.("Follow", 3, false);
    player?.getPacketSender?.()?.sendInteractionOption?.("Trade With", 4, false);

    const location = player?.getLocation?.();
    const tile = Location.readTile(location);
    if (!tile) {
      return;
    }

    const packetSender = player?.getPacketSender?.();
    if (!packetSender) {
      return;
    }

    const inWilderness = Wilderness.isInLocation(location);
    if (inWilderness) {
      const wildernessLevel = Wilderness.levelForY(tile.y);
      player?.setWildernessLevel?.(wildernessLevel);
      packetSender.sendInteractionOption?.("Attack", 2, true);
      packetSender.sendWalkableInterface?.(197);
      packetSender.sendString?.(formatWildernessLevelText(tile), 199);

      const multiIcon = Wilderness.isMulti(tile.x, tile.y) ? 1 : 0;
      player?.setMultiIcon?.(multiIcon);
      packetSender.sendMultiIcon?.(multiIcon);
      return;
    }

    player?.setWildernessLevel?.(0);
    player?.setMultiIcon?.(0);
    packetSender.sendWalkableInterface?.(-1);
    packetSender.sendInteractionOption?.("null", 2, true);
    packetSender.sendMultiIcon?.(0);
  }
}
