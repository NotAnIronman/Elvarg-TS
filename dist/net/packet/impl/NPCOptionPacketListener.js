"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NPCOptionPacketListener = void 0;
// import { World } from "../../../game/World";
const PacketConstants_1 = require("../PacketConstants");
class NPCOptionPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        if (player.busy()) {
            return;
        }
        let index = packet.readLEShortA();
        // if (index < 0 || index > World.getNpcs().capacityReturn()) {
        //     return;
        // }
        // const npc = World.getNpcs().get(index);
        // if (!npc) {
        //     return;
        // }
        // if (!player.getLocation().isWithinDistance(npc.getLocation(), 24)) {
        //     return;
        // }
        // if (player.getRights() == PlayerRights.DEVELOPER) {
        //     player.getPacketSender().sendMessage("InteractionInfo Id=" + npc.getId() + " " + npc.getLocation().toString());
        // }
        // player.setPositionToFace(npc.getLocation());
        if (packet.getOpcode() === PacketConstants_1.PacketConstants.ATTACK_NPC_OPCODE ||
            packet.getOpcode() === PacketConstants_1.PacketConstants.MAGE_NPC_OPCODE) {
            // if (!npc.getCurrentDefinition().isAttackable()) {
            //     return;
            // }
            // if (npc.getHitpoints() <= 0) {
            //     player.getMovementQueue().reset();
            //     return;
            // }
            if (packet.getOpcode() === PacketConstants_1.PacketConstants.MAGE_NPC_OPCODE) {
                let spellId = packet.readShortA();
                // let spell = CombatSpells.getCombatSpell(spellId);
                // if (!spell) {
                //     player.getMovementQueue().reset();
                //     return;
                // }
                // player.setPositionToFace(npc.getLocation());
                // player.getCombat().setCastSpell(spell);
            }
            // player.getCombat().attack(npc);
            return;
        }
        // player.getMovementQueue().walkToEntity(npc, () => this.handleInteraction(player, npc, packet));
    }
}
exports.NPCOptionPacketListener = NPCOptionPacketListener;
//# sourceMappingURL=NPCOptionPacketListener.js.map