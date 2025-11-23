"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DialoguePacketListener = void 0;
class DialoguePacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        player.getDialogueManager().advance();
    }
}
exports.DialoguePacketListener = DialoguePacketListener;
//# sourceMappingURL=DialoguePacketListener.js.map