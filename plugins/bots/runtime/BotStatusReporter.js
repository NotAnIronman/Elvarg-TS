const {
  createBotDiagnosticsSnapshot,
  renderBotDiagnosticsLines,
} = require("./BotDiagnosticsSnapshot");

class BotStatusReporter {
  constructor(options = {}) {
    this.api = options.api ?? null;
    this.botStatesByName = options.botStatesByName ?? new Map();
    this.recentBotLogsByUsername = options.recentBotLogsByUsername ?? new Map();
    this.peekMovementRequest = options.peekMovementRequest ?? (() => null);
    this.runtimeEventLoggingEnabled = options.runtimeEventLoggingEnabled === true;
    this.recentLogLines = Number.isFinite(options.recentLogLines)
      ? Math.max(1, Math.floor(options.recentLogLines))
      : 8;
  }

  sendStatus(viewer, bot) {
    if (!viewer || !bot) {
      return;
    }

    const viewerSender = viewer.getPacketSender?.();
    if (!viewerSender?.sendMessage) {
      return;
    }

    const username = bot.getUsername?.();
    const state = username ? this.botStatesByName.get(username) : null;
    const snapshot = createBotDiagnosticsSnapshot({
      bot,
      state,
      nowMs: Date.now(),
      peekMovementRequest: this.peekMovementRequest,
      recentBotLogsByUsername: this.recentBotLogsByUsername,
    });
    const lines = renderBotDiagnosticsLines({
      bot,
      snapshot,
      runtimeEventLoggingEnabled: this.runtimeEventLoggingEnabled,
      recentLogLines: this.recentLogLines,
    });
    for (const line of lines) {
      viewerSender.sendMessage(line);
    }

    this.api?.log?.("bot_status_requested", {
      requester: viewer.getUsername?.(),
      target: username ?? null,
      mode: state?.mode ?? null,
    });
  }
}

module.exports = {
  BotStatusReporter,
};
