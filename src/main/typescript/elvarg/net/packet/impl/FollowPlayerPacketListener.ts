import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";
import { World } from "../../../game/World";

export class FollowPlayerPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    if (player.busy()) {
      return;
    }

    const otherPlayersIndex = packet.readLEShort();
    if (
      otherPlayersIndex < 1 ||
      otherPlayersIndex >= World.getPlayers().capacityReturn()
    ) {
      return;
    }

    const leader = World.getPlayers().get(otherPlayersIndex);
    if (!leader || leader === player || !leader.isRegistered()) {
      return;
    }

    FollowPlayerPacketListener.follow(player, leader);
  }

  public static follow(player: any, leader: any) {
    let mobility = player.getMovementQueue().getMobility();
    if (!mobility.canMove()) {
      mobility.sendMessage(player);
      player.getMovementQueue().reset();
      return;
    }

    player.getMovementQueue().reset();
    player.getMovementQueue().walkToReset();

    // Following is separate from combat-following.
    player.setCombatFollowing(null);
    player.setFollowing(leader);
    player.setMobileInteraction(leader);
    player.setPositionToFace(leader.getLocation());
  }
}
