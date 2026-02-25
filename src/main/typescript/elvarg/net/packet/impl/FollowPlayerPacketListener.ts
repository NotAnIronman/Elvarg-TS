import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { World } from "../../../game/World";
import { TaskManager } from "../../../game/task/TaskManager";
import { Task } from "../../../game/task/Task";
import { Location } from "../../../game/model/Location";
import { PathFinder } from "../../../game/model/movement/path/PathFinder";

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
    TaskManager.submit(new FollowPlayerTask(player, leader));
  }
}

class FollowPlayerTask extends Task {
  constructor(private readonly player: any, private readonly leader: any) {
    super(1, player.getIndex(), true);
  }

  execute(): void {
    if (this.player.getFollowing() == null) {
      this.player.setPositionToFace(null);
      this.stop();
      return;
    }

    if (
      this.leader.isTeleportingReturn() ||
      !this.leader.getLocation().isWithinDistance(this.player.getLocation(), 15)
    ) {
      this.player.setPositionToFace(null);
      this.stop();
      return;
    }

    const destX = this.leader.getMovementQueue().followX;
    const destY = this.leader.getMovementQueue().followY;
    if (
      (destX === -1 && destY === -1) ||
      new Location(destX, destY).equals(this.player.getLocation())
    ) {
      return;
    }

    this.player.getMovementQueue().reset();
    this.player.setPositionToFace(this.leader.getLocation());
    this.player.setMobileInteraction(this.leader);
    PathFinder.calculateWalkRoute(this.player, destX, destY);
  }
}
