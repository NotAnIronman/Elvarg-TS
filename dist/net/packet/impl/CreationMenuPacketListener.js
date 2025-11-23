"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreationMenuPacketListener = void 0;
class CreationMenuPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let itemId = packet.readInt();
        let amount = packet.readUnsignedByte();
        if (player.getCreationMenu() != null) {
            player.getCreationMenu().execute(itemId, amount);
        }
    }
}
exports.CreationMenuPacketListener = CreationMenuPacketListener;
//# sourceMappingURL=CreationMenuPacketListener.js.map