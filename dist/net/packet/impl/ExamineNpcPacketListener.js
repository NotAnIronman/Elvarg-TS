"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExamineNpcPacketListener = void 0;
// import { NpcDefinition } from "../../../game/definition/NpcDefinition";
class ExamineNpcPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let npcId = packet.readShort();
        if (npcId <= 0) {
            return;
        }
        // let npcDef = NpcDefinition.forId(npcId);
        // if (npcDef != null) {
        //     player.getPacketSender().sendMessage(npcDef.getExamine());
        // }
    }
}
exports.ExamineNpcPacketListener = ExamineNpcPacketListener;
//# sourceMappingURL=ExamineNpcPacketListener.js.map