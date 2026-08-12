// Add/remove friend and send-PM are client-protocol-blocked - xrsps-typescript's
// client has no way to send these actions at all (no message type exists for
// them). See docs/networking-protocol-gaps.md. The handlers used to be wired up
// via the dead registerAlivePacketListener/PACKETS dispatch, which never actually
// ran once elvarg switched to NetworkBuilder.ts's live dispatch; removed along
// with the rest of that dead system.

module.exports = {
  name: "FriendsList",
  register(api) {
    api.onPlayerLogin(({ player }) => {
      const relations = player?.getRelations?.();
      const sender = player?.getPacketSender?.();
      if (!relations) {
        return;
      }
      relations.setPrivateMessageId?.(1);
      relations.onLogin?.(player);
      sender?.sendFriendStatus?.(2);
      relations.updateLists?.(true);
    });
  },
};
