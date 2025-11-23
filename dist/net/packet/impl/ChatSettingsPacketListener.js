"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSettingsPacketListener = void 0;
class ChatSettingsPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let publicMode = packet.readByte();
        let privateMode = packet.readByte();
        let tradeMode = packet.readByte();
        // if (privateMode > Object.keys(PrivateChatStatus).length / 2) {
        //     return;
        // }
        // let privateChatStatus = PrivateChatStatus[PrivateChatStatus[privateMode]];
        // if (player.getRelations().getStatus() != privateChatStatus) {
        //     player.getRelations().setStatus(privateChatStatus, true);
        // }
    }
}
exports.ChatSettingsPacketListener = ChatSettingsPacketListener;
//# sourceMappingURL=ChatSettingsPacketListener.js.map