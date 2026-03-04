function registerBotEvents(options) {
  const {
    api,
    botApi,
    runtime,
    playerPersistence,
    manualControlPacketOpcodes,
    followBackTrigger,
    pathBlockedHandler,
  } = options;

  api.onPlayerDisconnect(({ player, username }) => {
    if (player && player.isPlayerBot?.()) {
      try {
        playerPersistence.save(player);
      } catch (err) {
        botApi.log("bot_persistence_save_failed_disconnect", {
          username,
          error: String(err?.message ?? err),
        });
      }
    }
    const removed = runtime.handleDisconnect(player, username);
    if (removed) {
      botApi.log("botme_auto_disabled_disconnect", { username });
    }
  });

  api.onEstablishedPacket((event) => {
    const nowMs = Date.now();
    followBackTrigger.handleEstablishedPacket(event, nowMs);

    const { opcode, player } = event;
    if (!manualControlPacketOpcodes.has(opcode)) {
      return;
    }

    const username = player.getUsername?.();
    if (!username || !runtime.botmeUsernames.has(username)) {
      return;
    }

    const disabled = runtime.disableControllerForPlayer(player);
    if (!disabled) {
      return;
    }
    player
      .getPacketSender()
      .sendMessage("botme auto-disabled due to manual input.");
    botApi.log("botme_auto_disabled_manual_input", { username, opcode });
  });

  api.onPlayerPathBlocked((event) => {
    pathBlockedHandler.handle(event, Date.now());
  });
}

module.exports = {
  registerBotEvents,
};
