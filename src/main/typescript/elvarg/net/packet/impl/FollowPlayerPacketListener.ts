import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { World } from "../../../game/World";
import { TaskManager } from "../../../game/task/TaskManager";

export class FollowPlayerPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    if (player.busy()) {
      return;
    }

    // Keep parity with Java FollowPlayerPacketListener and clear prior follow tasks.
    TaskManager.cancelTasks(player.getIndex());

    const otherPlayersIndex = packet.readLEShort();
    if (
      otherPlayersIndex < 0 ||
      otherPlayersIndex > World.getPlayers().capacityReturn()
    ) {
      return;
    }

    const leader = World.getPlayers().get(otherPlayersIndex);
    if (!leader || leader === player) {
      return;
    }

    FollowPlayerPacketListener.follow(player, leader);
  }

  public static follow(player: any, leader: any) {
    const mobility = player.getMovementQueue().getMobility();
    if (!mobility.canMove()) {
      mobility.sendMessage(player);
      player.getMovementQueue().reset();
      return;
    }

    player.getMovementQueue().reset();
    player.getMovementQueue().walkToReset();

    player.setFollowing(leader);
    player.setMobileInteraction(leader);
    player.setPositionToFace(leader.getLocation());
  }
}
