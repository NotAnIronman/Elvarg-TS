// import { Player } from "../../../game/entity/impl/player/Player";
// import { Command } from "../../../game/model/commands/Command";
// import { CommandManager } from "../../../game/model/commands/CommandManager";
import { World } from "../../../game/World";
import { Packet } from "../Packet";
import { PacketExecutor } from "../PacketExecutor";

export class CommandPacketListener implements PacketExecutor {
  public static readonly OP_CODE = 103;

  // execute(player: Player, packet: Packet) {
  execute(player: any, packet: Packet) {
    if (player.getHitpoints() <= 0) {
      return;
    }
    const command = packet.readString().trim();
    if (!command.length) {
      return;
    }
    const parts = command.split(/\s+/);
    const baseCommand = parts[0].toLowerCase();

    if (baseCommand === "players" || baseCommand === "online" || baseCommand === "who") {
      const connectedNames: string[] = [];
      for (const worldPlayer of World.getPlayers()) {
        if (!worldPlayer || !World.isPlayerSessionConnected(worldPlayer)) {
          continue;
        }
        connectedNames.push(worldPlayer.getUsername());
      }
      connectedNames.sort((a, b) => a.localeCompare(b));
      player
        .getPacketSender()
        .sendMessage(`Online players (${connectedNames.length}):`);
      if (connectedNames.length === 0) {
        player.getPacketSender().sendMessage("none");
        return;
      }
      let line = "";
      for (const name of connectedNames) {
        const next = line.length === 0 ? name : `${line}, ${name}`;
        if (next.length > 180) {
          player.getPacketSender().sendMessage(line);
          line = name;
        } else {
          line = next;
        }
      }
      if (line.length > 0) {
        player.getPacketSender().sendMessage(line);
      }
      return;
    }

    // let c: Command | undefined = CommandManager.commands.get(parts[0]);
    // if (c) {
    //     if (c.canUse(player)) {
    //         c.execute(player, command, parts);
    //     } else {
    //         // do something if player can't use command
    //     }
    // } else {
    player.getPacketSender().sendMessage("This command does not exist. Try ::players.");
    // }
  }
}
