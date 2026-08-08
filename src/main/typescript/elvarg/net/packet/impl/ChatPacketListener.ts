import { PlayerPunishment } from "../../../util/PlayerPunishment";
import { Misc } from "../../../util/Misc";
import { Packet } from "../Packet";
import { PacketConstants } from "../PacketConstants";
import { PacketExecutor } from "../../packet/PacketExecutor";
import { CommandPacketListener } from "./CommandPacketListener";

export class ChatPacketListener implements PacketExecutor {
  private static allowChat(player: any, text: string) {
    if (!text || text.length === 0) {
      return false;
    }
    if (
      PlayerPunishment.muted(player.getUsername()) ||
      PlayerPunishment.IPMuted(player.getHostAddress())
    ) {
      player.getPacketSender().sendMessage("You are muted and cannot chat.");
      return false;
    }
    if (Misc.blockedWord(text)) {
      player
        .getPacketSender()
        .sendMessage("Your message did not make it past the filter.");
      return false;
    }
    return true;
  }

  public static handleText(player: any, value: string): void {
    const text = String(value ?? "").replace(/[<>]/g, "").trim().slice(0, 80);
    if (text.startsWith("::")) {
      new CommandPacketListener().execute(
        player,
        new Packet(CommandPacketListener.OP_CODE, Buffer.from(`${text.slice(2)}\n`, "latin1"))
      );
      return;
    }
    if (!ChatPacketListener.allowChat(player, text)) return;

    const recipients = [player, ...player.getLocalPlayers()];
    const sent = new Set<number>();
    for (const recipient of recipients) {
      if (
        !recipient ||
        sent.has(recipient.getIndex()) ||
        recipient.getRelations?.().hasIgnore?.(player.getLongUsername())
      ) continue;
      sent.add(recipient.getIndex());
      recipient.getPacketSender().sendPublicChat(text, player.getUsername(), player.getIndex());
    }
  }

  execute(player: any, packet: Packet) {
    switch (packet.getOpcode()) {
      case PacketConstants.REGULAR_CHAT_OPCODE:
        let size = packet.getSize() - 2;
        let color = packet.readByteS();
        let effect = packet.readByteS();
        let text = packet.readReversedBytesA(size);
        let chatMessage = Misc.ucFirst(
          Misc.textUnpack(text, size).toLowerCase()
        );

        ChatPacketListener.handleText(player, chatMessage);
        break;
    }
  }
}
