import { PlayerPunishment } from "../../../util/PlayerPunishment";
import { Misc } from "../../../util/Misc";
import { Packet } from "../Packet";
import { PacketConstants } from "../PacketConstants";
import { PacketExecutor } from "../../packet/PacketExecutor";

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

        if (!ChatPacketListener.allowChat(player, chatMessage)) {
          return;
        }
        if (player.getChatMessageQueue().length >= 5) {
          return;
        }
        break;
    }
  }
}
