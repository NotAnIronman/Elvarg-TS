"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExamineItemPacketListener = void 0;
const Misc_1 = require("../../../util/Misc");
class ExamineItemPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let itemId = packet.readShort();
        let interfaceId = packet.readInt();
        if (itemId == 995 || itemId == 13307) {
            let amount = player.getInventory().getAmount(itemId);
            // if (interfaceId >= Bank.CONTAINER_START && interfaceId < Bank.CONTAINER_START + Bank.TOTAL_BANK_TABS) {
            //     let fromBankTab = interfaceId - Bank.CONTAINER_START;
            //     amount = player.getBank(fromBankTab).getAmount(itemId);
            // }
            player
                .getPacketSender()
                .sendMessage("@red@" + Misc_1.Misc.insertCommasToNumber("" + amount + "") + "x coins.");
            return;
        }
        if (itemId == 12926) {
            player
                .getPacketSender()
                .sendMessage("Fires Dragon darts while coating them with venom. Charges left: " +
                player.getBlowpipeScales());
            return;
        }
        // let itemDef = ItemDefinition.forId(itemId);
        // if (itemDef != null) {
        //     player.getPacketSender().sendMessage(itemDef.getExamine());
        // }
    }
}
exports.ExamineItemPacketListener = ExamineItemPacketListener;
//# sourceMappingURL=ExamineItemPacketListener.js.map