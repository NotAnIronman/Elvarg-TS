import { PlayerPunishment } from "../../../util/PlayerPunishment";
import { Misc } from "../../../util/Misc";
import { CommandPacketListener } from "./CommandPacketListener";

export class ChatPacketListener {
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
      CommandPacketListener.execute(player, text.slice(2));
      return;
    }
    if (!ChatPacketListener.allowChat(player, text)) return;
    player.forceChat(text);

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
}
