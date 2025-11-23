"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseInterfacePacketListener = void 0;
class CloseInterfacePacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        player.getPacketSender().sendInterfaceRemoval();
    }
}
exports.CloseInterfacePacketListener = CloseInterfacePacketListener;
//# sourceMappingURL=CloseInterfacePacketListener.js.map