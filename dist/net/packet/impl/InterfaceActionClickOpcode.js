"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterfaceActionClickOpcode = void 0;
class InterfaceActionClickOpcode {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        let interfaceId = packet.readInt();
        let action = packet.readByte();
        if (player == null ||
            player.getHitpoints() <= 0 ||
            player.isTeleportingReturn()) {
            return;
        }
        // if (Bank.handleButton(player, interfaceId, action)) {
        //     return;
        // }
        // if (ClanChatManager.handleButton(player, interfaceId, action)) {
        //     return;
        // }
        // if (Presetables.handleButton(player, interfaceId)) {
        //     return;
        // }
        // if (TeleportHandler.handleButton(player, interfaceId, action)) {
        //     return;
        // }
    }
}
exports.InterfaceActionClickOpcode = InterfaceActionClickOpcode;
//# sourceMappingURL=InterfaceActionClickOpcode.js.map