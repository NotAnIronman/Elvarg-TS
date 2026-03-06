const fs = require("fs");
const path = require("path");

function createBotPluginLogging(options = {}) {
  const api = options.api;
  const logPath = options.logPath;
  const runtimeEventLoggingEnabled = options.runtimeEventLoggingEnabled === true;
  const fileLogWritesEnabled = options.fileLogWritesEnabled === true;
  const recentLogLimit = Number.isFinite(options.recentLogLimit)
    ? Math.max(1, Math.floor(options.recentLogLimit))
    : 24;

  let botLogStream = null;
  const recentBotLogsByUsername = new Map();

  const rememberRecentBotLog = (username, line) => {
    if (!username || typeof line !== "string") {
      return;
    }
    const history = recentBotLogsByUsername.get(username) ?? [];
    history.push(line);
    if (history.length > recentLogLimit) {
      history.splice(0, history.length - recentLogLimit);
    }
    recentBotLogsByUsername.set(username, history);
  };

  const trackRecentBotLog = (message, extra, timestamp) => {
    const username = extra?.username;
    if (typeof username !== "string" || username.length === 0) {
      return;
    }
    const suffix =
      extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
    rememberRecentBotLog(username, `[${timestamp}] ${message}${suffix}`);
  };

  const writeBotLog = (message, extra) => {
    if (!runtimeEventLoggingEnabled) {
      return;
    }
    try {
      const timestamp = new Date().toISOString();
      const suffix =
        extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
      const line = `[${timestamp}] ${message}${suffix}\n`;
      if (fileLogWritesEnabled) {
        if (botLogStream) {
          botLogStream.write(line);
        } else if (logPath) {
          // Fallback path before stream init completes.
          fs.appendFileSync(logPath, line);
        }
      }
      trackRecentBotLog(message, extra, timestamp);
    } catch (_) {
      // Keep bot behavior running even if file logging fails.
    }
  };

  const botApi = Object.create(api ?? {});
  botApi.log = (message, extra) => {
    if (!runtimeEventLoggingEnabled) {
      return;
    }
    api?.log?.(message, extra);
    writeBotLog(message, extra);
  };

  if (runtimeEventLoggingEnabled && fileLogWritesEnabled && logPath) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, "");
      botLogStream = fs.createWriteStream(logPath, {
        flags: "a",
        encoding: "utf8",
      });
      writeBotLog("log_reset");
    } catch (err) {
      api?.log?.("bot_log_init_failed", {
        path: logPath,
        error: String(err?.message ?? err),
      });
    }
  }

  return {
    botApi,
    recentBotLogsByUsername,
  };
}

module.exports = {
  createBotPluginLogging,
};
