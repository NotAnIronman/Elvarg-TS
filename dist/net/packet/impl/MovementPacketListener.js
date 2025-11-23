"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MovementPacketListener = void 0;
class MovementPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        if (player.getHitpoints() <= 0) {
            return;
        }
        let mobility = player.getMovementQueue().getMobility();
        if (!mobility.canMove()) {
            mobility.sendMessage(player);
            return;
        }
        let absoluteX = packet.readShort();
        let absoluteY = packet.readShort();
        let plane = packet.readUnsignedByte();
        // let destination = new Location(absoluteX, absoluteY, plane);
        // if (!player.getMovementQueue().checkDestination(destination)) {
        //     return;
        // }
        if (player.getInterfaceId() !=
            MovementPacketListener.FLOATING_WORLD_MAP_INTERFACE) {
            // Close all interfaces except for floating world map
            player.getPacketSender().sendInterfaceRemoval();
        }
        // Make sure to reset any previous movement steps
        player.getMovementQueue().reset();
        player.getMovementQueue().walkToReset();
        // PathFinder.calculateWalkRoute(player, absoluteX, absoluteY);
    }
}
exports.MovementPacketListener = MovementPacketListener;
MovementPacketListener.FLOATING_WORLD_MAP_INTERFACE = 54000;
//# sourceMappingURL=MovementPacketListener.js.map