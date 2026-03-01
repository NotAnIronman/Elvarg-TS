import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { PacketConstants } from "../PacketConstants";
import { World } from "../../../game/World";
import type { Player } from "../../../game/entity/impl/player/Player";

export class PlayerOptionPacketListener implements PacketExecutor {
  private static attack(player: any, packet: Packet) {
    const index: number = packet.readLEShort();
    if (index < 0 || index >= World.getPlayers().capacityReturn()) {
      return;
    }

    const attacked: Player = World.getPlayers().get(index);
    if (!attacked || attacked.getHitpoints() <= 0 || attacked.equals(player)) {
      player.getMovementQueue().reset();
      return;
    }

    // Plain attack packets should use the currently configured autocast spell,
    // not any stale manually-selected cast spell from an earlier magic-on-player click.
    if (player.getCombat?.().getAutocastSpell?.() != null) {
      player.getCombat().setCastSpell(null);
    }

    player.getCombat().attack(attacked);
  }

  /**
   * Manages the first option click on a player option menu.
   *
   * @param player The player clicking the other entity.
   * @param packet The packet to read values from.
   */
  private static option1(player: any, packet: Packet) {
    const id: number = packet.readShort() & 0xffff;
    if (id < 0 || id >= World.getPlayers().capacityReturn()) {
      return;
    }

    const player2: Player = World.getPlayers().get(id);
    if (!player2) {
      return;
    }

    player.getMovementQueue().walkToEntity(player2, () => {
      if (player.getArea() != null) {
        player.getArea().onPlayerRightClick(player, player2, 1);
      }
    });
  }

  /**
   * Manages the second option click on a player option menu.
   *
   * @param player The player clicking the other entity.
   * @param packet The packet to read values from.
   */
  private static option2(player: any, packet: Packet) {
    const id: number = packet.readShort() & 0xffff;
    if (id < 0 || id >= World.getPlayers().capacityReturn()) {
      return;
    }

    const player2: Player = World.getPlayers().get(id);
    if (!player2) {
      return;
    }

    player.getMovementQueue().walkToEntity(player2, () => {
      if (player.getArea() != null) {
        player.getArea().onPlayerRightClick(player, player2, 2);
      }
    });
  }

  private static option3(player: any, packet: Packet) {
    const id: number = packet.readLEShortA() & 0xffff;
    if (id < 0 || id >= World.getPlayers().capacityReturn()) {
      return;
    }

    const player2: Player = World.getPlayers().get(id);
    if (!player2) {
      return;
    }

    player.getMovementQueue().walkToEntity(player2, () => {
      if (player.getArea() != null) {
        player.getArea().onPlayerRightClick(player, player2, 3);
      }
    });
  }

  execute(player: any, packet: Packet): void {
    if (player == null || player.getHitpoints() <= 0) {
      return;
    }

    if (player.busy()) {
      return;
    }

    switch (packet.getOpcode()) {
      case PacketConstants.ATTACK_PLAYER_OPCODE:
        PlayerOptionPacketListener.attack(player, packet);
        break;
      case PacketConstants.PLAYER_OPTION_1_OPCODE:
        PlayerOptionPacketListener.option1(player, packet);
        break;
      case PacketConstants.PLAYER_OPTION_2_OPCODE:
        PlayerOptionPacketListener.option2(player, packet);
        break;
      case PacketConstants.PLAYER_OPTION_3_OPCODE:
        PlayerOptionPacketListener.option3(player, packet);
        break;
    }
  }
}
