import { World } from "../../../game/World";
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { CombatSpells } from "../../../game/content/combat/magic/CombatSpells";

export class MagicOnPlayerPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet) {
    const playerIndex = packet.readShortA();
    const spellId = packet.readLEShort();
    MagicOnPlayerPacketListener.cast(player, playerIndex, spellId);
  }

  public static cast(player: any, playerIndex: number, spellId: number): boolean {
    if (!player || player.getHitpoints() <= 0) {
      return false;
    }

    if (playerIndex < 0 || playerIndex >= World.getPlayers().capacityReturn()) {
      return false;
    }
    if (spellId < 0) {
      return false;
    }

    const attacked = World.getPlayers().get(playerIndex);

    if (!attacked || attacked === player) {
      player.getMovementQueue().reset();
      return false;
    }

    if (attacked.getHitpoints() <= 0) {
      player.getMovementQueue().reset();
      return false;
    }

    const spell = CombatSpells.getCombatSpell(spellId);

    if (!spell) {
      player.getMovementQueue().reset();
      return false;
    }

    player.getCombat().castSpellOn(attacked, spell);
    return true;
  }
}
