import { World } from "../../../game/World";
import { CombatSpells } from "../../../game/content/combat/magic/CombatSpells";
import { NpcInteractionManager } from "../../../game/entity/impl/npc/NpcInteractionManager";
import { PluginManager } from "../../../plugins/PluginManager";

export class NPCOptionPacketListener {
  public executeOption(player: any, index: number, clickType: number): void {
    if (!player || player.getHitpoints?.() <= 0 || player.busy?.() || clickType < 1 || clickType > 5) return;
    if (index < 0 || index > World.getNpcs().capacityReturn()) return;
    const npc = World.getNpcs().get(index);
    if (!npc || !player.getLocation().isWithinDistance(npc.getLocation(), 24)) return;

    player.setPositionToFace(npc.getLocation());
    const option = npc.getCurrentDefinition?.()?.getActions?.()?.[clickType - 1]?.toLowerCase();
    if (option === "attack") {
      if (!npc.getCurrentDefinition?.()?.isAttackable?.() || npc.getHitpoints?.() <= 0) return;
      if (player.getCombat?.().getAutocastSpell?.() != null) player.getCombat().setCastSpell(null);
      player.getCombat().attack(npc);
      return;
    }

    player.getMovementQueue().walkToEntity(npc, () => {
      player.setPositionToFace(npc.getLocation());
      npc.setMobileInteraction?.(player);
      npc.setPositionToFace?.(player.getLocation());

      if (
        NpcInteractionManager.handle(
          player,
          npc,
          index,
          clickType
        )
      ) {
        return;
      }

      if (option === "bank") {
        player.getBank(player.getCurrentBankTab()).open();
        return;
      }

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

  public static castSpell(player: any, index: number, spellId: number): boolean {
    if (!player || player.getHitpoints?.() <= 0 || player.busy?.()) return false;
    if (index < 0 || index >= World.getNpcs().capacityReturn()) return false;
    const npc = World.getNpcs().get(index);
    const spell = CombatSpells.getCombatSpell(spellId);
    if (!npc || !spell || !player.getLocation().isWithinDistance(npc.getLocation(), 24) ||
        !npc.getCurrentDefinition?.()?.isAttackable?.() || npc.getHitpoints?.() <= 0) {
      player.getMovementQueue().reset();
      return false;
    }
    player.setPositionToFace(npc.getLocation());
    player.getCombat().castSpellOn(npc, spell);
    return true;
  }
}
