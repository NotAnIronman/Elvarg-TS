"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EquipPacketListener = void 0;
// import { DuelRule } from "../../../game/content/Duelling";
// import { GameConstants } from "../../../game/GameConstants";
// import { Flag } from "../../../game/model/Flag";
// import { BonusManager } from "../../../game/model/equipment/BonusManager";
class EquipPacketListener {
    // public static resetWeapon(player: Player, deactivateSpecialAttack: boolean) {
    static resetWeapon(player, deactivateSpecialAttack) {
        if (deactivateSpecialAttack) {
            player.setSpecialActivated(false);
        }
        player.getPacketSender().sendSpecialAttackState(false);
        // WeaponInterfaces.assign(player);
    }
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let id = packet.readShort();
        let slot = packet.readShortA();
        let interfaceId = packet.readShortA();
        // EquipPacketListener.equip(player, id, slot, interfaceId);
    }
    // public static equipFromInventory(player: Player, itemInSlot: ItemInSlot) {
    // 	EquipPacketListener.equip(player, itemInSlot.getId(), itemInSlot.getSlot(), Inventory.INTERFACE_ID);
    // }
    // Placeholder to satisfy callers during porting.
    static equipFromInventory(_player, _itemInSlot) {
        return;
    }
}
exports.EquipPacketListener = EquipPacketListener;
//# sourceMappingURL=EquipPacketListener.js.map