import { PacketExecutor } from "../PacketExecutor";
import { Packet } from "../Packet";
import { World } from "../../../game/World";
import { PlayerStatus } from "../../../game/model/PlayerStatus";
import { PluginManager } from "../../../plugins/PluginManager";

export class TradeRequestPacketListener implements PacketExecutor {
  execute(player: any, packet: Packet): void {
    const index = packet.readLEShort();

    if (index < 0 || index >= World.getPlayers().capacityReturn()) {
      return;
    }

    const target = World.getPlayers().get(index);
    if (!target) {
      return;
    }

    if (!target.getLocation().isWithinDistance(player.getLocation(), 20)) {
      return;
    }

    if (
      player.getHitpoints() <= 0 ||
      !player.isRegistered() ||
      target.getHitpoints() <= 0 ||
      !target.isRegistered()
    ) {
      return;
    }

    player
      .getMovementQueue()
      .walkToEntity(target, () =>
        TradeRequestPacketListener.sendRequest(player, target)
      );
  }

  static sendRequest(player: any, target: any) {
    if (player.busy()) {
      player.getPacketSender().sendMessage("You cannot do that right now.");
      return;
    }

    if (target.busy()) {
      let msg = "That player is currently busy.";

      if (target.getStatus() === PlayerStatus.TRADING) {
        msg = "That player is currently trading with someone else.";
      }

      player.getPacketSender().sendMessage(msg);
      return;
    }

    const pluginCanTrade = PluginManager.emitCanTrade(player, target);
    if (pluginCanTrade === false) {
      player.getPacketSender().sendMessage("You cannot trade here.");
      return;
    }
    if (
      pluginCanTrade == null &&
      player.getArea() != null &&
      !player.getArea().canTrade(player, target)
    ) {
      player.getPacketSender().sendMessage("You cannot trade here.");
      return;
    }

    if (player.getLocalPlayers().indexOf(target) !== -1) {
      player.getTrading().requestTrade(target);
    }
  }
}
