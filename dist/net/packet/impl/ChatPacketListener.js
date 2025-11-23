"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPacketListener = void 0;
const PlayerPunishment_1 = require("../../../util/PlayerPunishment");
const Misc_1 = require("../../../util/Misc");
const PacketConstants_1 = require("../PacketConstants");
class ChatPacketListener {
    // private static allowChat(player: Player, text: string) {
    static allowChat(player, text) {
        if (!text || text.length === 0) {
            return false;
        }
        if (PlayerPunishment_1.PlayerPunishment.muted(player.getUsername()) ||
            PlayerPunishment_1.PlayerPunishment.IPMuted(player.getHostAddress())) {
            player.getPacketSender().sendMessage("You are muted and cannot chat.");
            return false;
        }
        if (Misc_1.Misc.blockedWord(text)) {
            player
                .getPacketSender()
                .sendMessage("Your message did not make it past the filter.");
            return false;
        }
        return true;
    }
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        switch (packet.getOpcode()) {
            case PacketConstants_1.PacketConstants.CLAN_CHAT_OPCODE:
                let clanMessage = packet.readString();
                if (!ChatPacketListener.allowChat(player, clanMessage)) {
                    return;
                }
                // ClanChatManager.sendMessage(player, clanMessage);
                break;
            case PacketConstants_1.PacketConstants.REGULAR_CHAT_OPCODE:
                let size = packet.getSize() - 2;
                let color = packet.readByteS();
                let effect = packet.readByteS();
                let text = packet.readReversedBytesA(size);
                let chatMessage = Misc_1.Misc.ucFirst(Misc_1.Misc.textUnpack(text, size).toLowerCase());
                if (!ChatPacketListener.allowChat(player, chatMessage)) {
                    return;
                }
                if (player.getChatMessageQueue().length >= 5) {
                    return;
                }
                // player.getChatMessageQueue().push(new ChatMessage(color, effect, text));
                break;
        }
    }
}
exports.ChatPacketListener = ChatPacketListener;
//# sourceMappingURL=ChatPacketListener.js.map