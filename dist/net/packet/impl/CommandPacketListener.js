"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandPacketListener = void 0;
class CommandPacketListener {
    // execute(player: Player, packet: Packet) {
    execute(player, packet) {
        if (player.getHitpoints() <= 0) {
            return;
        }
        let command = packet.readString();
        let parts = command.split(" ");
        parts[0] = parts[0].toLowerCase();
        // let c: Command | undefined = CommandManager.commands.get(parts[0]);
        // if (c) {
        //     if (c.canUse(player)) {
        //         c.execute(player, command, parts);
        //     } else {
        //         // do something if player can't use command
        //     }
        // } else {
        player.getPacketSender().sendMessage("This command does not exist.");
        // }
    }
}
exports.CommandPacketListener = CommandPacketListener;
CommandPacketListener.OP_CODE = 103;
//# sourceMappingURL=CommandPacketListener.js.map