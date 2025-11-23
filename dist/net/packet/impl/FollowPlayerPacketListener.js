"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowPlayerPacketListener = void 0;
// import { Task } from '../../../game/task/Task';
// import { PathFinder } from '../../../game/model/movement/path/PathFinder';
// import { Location } from '../../../game/model/Location';
class FollowPlayerPacketListener {
    // execute(player: Player, packet: Packet): void {
    execute(player, packet) {
        if (player.busy()) {
            return;
        }
        // TaskManager.cancelTasks(player.getIndex());
        const otherPlayersIndex = packet.readLEShort();
        // if (otherPlayersIndex < 0 || otherPlayersIndex > World.getPlayers().capacityReturn())
        //     return;
        // const leader = World.getPlayers().get(otherPlayersIndex);
        // if (leader == null) {
        //     return;
        // }
        // FollowPlayerPacketListener.follow(player, leader);
    }
    // public static follow(player: Player, leader: Player) {
    static follow(player, leader) {
        let mobility = player.getMovementQueue().getMobility();
        if (!mobility.canMove()) {
            mobility.sendMessage(player);
            player.getMovementQueue().reset();
            return;
        }
        player.getMovementQueue().reset();
        player.getMovementQueue().walkToReset();
        player.setFollowing(leader);
        player.setMobileInteraction(leader);
    }
}
exports.FollowPlayerPacketListener = FollowPlayerPacketListener;
// class FollowTask extends Task {
class FollowTask {
}
//# sourceMappingURL=FollowPlayerPacketListener.js.map