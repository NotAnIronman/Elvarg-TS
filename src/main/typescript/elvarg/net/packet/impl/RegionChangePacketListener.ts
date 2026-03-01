import { RegionManager } from "../../../game/collision/RegionManager";
import { ItemOnGroundManager } from "../../../game/entity/impl/grounditem/ItemOnGroundManager";
import { NpcAggression } from "../../../game/entity/impl/npc/NpcAggression";
import { ObjectManager } from "../../../game/entity/impl/object/ObjectManager";
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class RegionChangePacketListener implements PacketExecutor {
  execute(player: any, packet: Packet) {
    if (player.isAllowRegionChangePacket()) {
      RegionManager.loadMapFiles(
        player.getLocation().getX(),
        player.getLocation().getY()
      );
      player.getPacketSender().deleteRegionalSpawns();
      ItemOnGroundManager.onRegionChange(player);
      ObjectManager.onRegionChange(player);
      player.getAggressionTolerance().start(NpcAggression.NPC_TOLERANCE_SECONDS);
      player.setAllowRegionChangePacket(false);
    }
  }
}
