"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerRelationPacketListener = void 0;
const PacketConstants_1 = require("../PacketConstants");
class PlayerRelationPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        try {
            let username = packet.readLong();
            if (username < 0) {
                return;
            }
            switch (packet.getOpcode()) {
                case PacketConstants_1.PacketConstants.ADD_FRIEND_OPCODE:
                    player.getRelations().addFriend(username);
                    break;
                case PacketConstants_1.PacketConstants.ADD_IGNORE_OPCODE:
                    player.getRelations().addIgnore(username);
                    break;
                case PacketConstants_1.PacketConstants.REMOVE_FRIEND_OPCODE:
                    player.getRelations().deleteFriend(username);
                    break;
                case PacketConstants_1.PacketConstants.REMOVE_IGNORE_OPCODE:
                    player.getRelations().deleteIgnore(username);
                    break;
                case PacketConstants_1.PacketConstants.SEND_PM_OPCODE:
                    let size = packet.getSize();
                    let message = packet.readBytes(size);
                    // let friend = World.getPlayerByName(Misc.formatText(Misc.longToString(username)).replace("_", " "));
                    // if (friend) {
                    //     player.getRelations().message(friend, new Uint8Array(message), size);
                    // } else {
                    player.getPacketSender().sendMessage("That player is offline.");
                    // }
                    break;
            }
        }
        catch (e) {
            console.log(e);
        }
    }
}
exports.PlayerRelationPacketListener = PlayerRelationPacketListener;
//# sourceMappingURL=PlayerRelationPacketListener.js.map