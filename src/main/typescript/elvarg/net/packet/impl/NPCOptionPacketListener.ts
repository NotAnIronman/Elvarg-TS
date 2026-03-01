import { World } from "../../../game/World";
import { CombatSpells } from "../../../game/content/combat/magic/CombatSpells";
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

    const opcode = packet.getOpcode();

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

    player.setPositionToFace(npc.getLocation());

    if (
      opcode === PacketConstants.ATTACK_NPC_OPCODE ||
      opcode === PacketConstants.MAGE_NPC_OPCODE
    ) {
      if (!npc.getCurrentDefinition?.()?.isAttackable?.()) {
        return;
      }
      if (npc.getHitpoints?.() <= 0) {
        player.getMovementQueue().reset();
        return;
      }

      if (opcode === PacketConstants.MAGE_NPC_OPCODE) {
        const spellId = packet.readShortA();
        const spell = CombatSpells.getCombatSpell(spellId);
        if (!spell) {
          player.getMovementQueue().reset();
          return;
        }
        player.getCombat().setCastSpell(spell);
      } else if (player.getCombat?.().getAutocastSpell?.() != null) {
        // Plain attack packets should use current autocast and discard stale manual casts.
        player.getCombat().setCastSpell(null);
      }

      player.getCombat().attack(npc);
      return;
    }

    const clickType = opcodeToClickType(opcode);
    if (clickType === 0) {
      return;
    }

    player.getMovementQueue().walkToEntity(npc, () => {
      player.setPositionToFace(npc.getLocation());
      npc.setMobileInteraction?.(player);
      npc.setPositionToFace?.(player.getLocation());

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
