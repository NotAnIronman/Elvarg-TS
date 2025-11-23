"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterInputPacketListener = void 0;
// import { Player } from "../../../game/entity/impl/player/Player";
const ByteBufUtils_1 = require("../../../net/ByteBufUtils");
const PacketConstants_1 = require("../../../net/packet/PacketConstants");
class EnterInputPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        if (player == null || player.getHitpoints() <= 0) {
            return;
        }
        switch (packet.getOpcode()) {
            case PacketConstants_1.PacketConstants.ENTER_SYNTAX_OPCODE:
                let name = ByteBufUtils_1.ByteBufUtils.readString(packet.getBuffer());
                if (name == null)
                    return;
                if (player.getEnteredSyntaxAction() != null) {
                    player.getEnteredSyntaxAction().execute(name);
                    player.setEnteredSyntaxAction(null);
                }
                break;
            case PacketConstants_1.PacketConstants.ENTER_AMOUNT_OPCODE:
                let amount = packet.readInt();
                if (amount <= 0)
                    return;
                if (player.getEnteredAmountAction() != null) {
                    player.getEnteredAmountAction().execute(amount);
                    player.setEnteredAmountAction(null);
                }
                break;
        }
    }
}
exports.EnterInputPacketListener = EnterInputPacketListener;
//# sourceMappingURL=EnterInputPacketListener.js.map