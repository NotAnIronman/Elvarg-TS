import { World } from "../../../game/World";
import { PluginManager } from "../../../plugins/PluginManager";
import { Packet } from "../Packet";
import { PacketConstants } from "../PacketConstants";
import { PacketExecutor } from "../PacketExecutor";

function opcodeToClickType(opcode: number): number {
  switch (opcode) {
    case PacketConstants.FIRST_CLICK_NPC_OPCODE:
      return 1;
    case PacketConstants.SECOND_CLICK_NPC_OPCODE:
      return 2;
    case PacketConstants.THIRD_CLICK_NPC_OPCODE:
      return 3;
    case PacketConstants.FOURTH_CLICK_NPC_OPCODE:
      return 4;
    default:
      return 0;
  }
}

export class NPCOptionPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet) {
    if (!player || player.getHitpoints?.() <= 0 || player.busy?.()) {
      return;
    }

    const clickType = opcodeToClickType(packet.getOpcode());
    if (clickType === 0) {
      return;
    }

    const index = packet.readLEShortA();
    if (index < 0 || index > World.getNpcs().capacityReturn()) {
      return;
    }

    const npc = World.getNpcs().get(index);
    if (!npc) {
      return;
    }

    if (!player.getLocation().isWithinDistance(npc.getLocation(), 24)) {
      return;
    }

    player.getMovementQueue().walkToEntity(npc, () => {
      player.setPositionToFace(npc.getLocation());
      const handled = PluginManager.emitNpcInteraction({
        player,
        npc,
        npcId: npc.getId(),
        npcIndex: index,
        clickType,
        location: {
          x: npc.getLocation().getX(),
          y: npc.getLocation().getY(),
          z: npc.getLocation().getZ(),
        },
        handled: false,
      });

      if (!handled) {
        player
          .getPacketSender()
          .sendMessage("Nothing interesting happens.");
      }
    });
  }
}
