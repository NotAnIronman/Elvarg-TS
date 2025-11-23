"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialAttackPacketListener = void 0;
// import { CombatSpecial } from "../../../game/content/combat/CombatSpecial";
class SpecialAttackPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let specialBarButton = packet.readInt();
        if (player.getHitpoints() <= 0) {
            return;
        }
        // CombatSpecial.activate(player);
    }
}
exports.SpecialAttackPacketListener = SpecialAttackPacketListener;
//# sourceMappingURL=SpecialAttackPacketListener.js.map