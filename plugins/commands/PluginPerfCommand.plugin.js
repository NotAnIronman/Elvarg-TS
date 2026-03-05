const fs = require("fs");
const path = require("path");
const { World } = require("../../src/main/typescript/elvarg/game/World");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { PluginManager } = require("../../src/main/typescript/elvarg/plugins/PluginManager");

const PLUGIN_PERF_LOG_FILE = path.join(process.cwd(), "logs", "plugin-performance.log");
const DEFAULT_LIMIT = 5;
const DEFAULT_INTERVAL_MS = 10000;
const MAX_LIMIT = 15;
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60000;

const pluginPerfStreams = new Map();

function parseIntArg(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function adminOrAbove(player) {
  return PlayerRights.hasAdminRights(player);
}

function stopPluginPerfStream(username) {
  const existing = pluginPerfStreams.get(username);
  if (existing) {
    clearInterval(existing);
    pluginPerfStreams.delete(username);
  }
}

function appendPluginPerfLog(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return;
  }
  fs.mkdirSync(path.dirname(PLUGIN_PERF_LOG_FILE), { recursive: true });
  fs.appendFileSync(PLUGIN_PERF_LOG_FILE, `${lines.join("\n")}\n`, "utf8");
}

function streamPluginPerfToPlayer(player, limit = DEFAULT_LIMIT) {
  const rows = PluginManager.getPluginPerformanceSnapshot(limit);
  const timestamp = new Date().toISOString();
  const logLines = [];

  if (!rows.length) {
    player.getPacketSender().sendMessage("[pluginperf] No samples yet.");
    logLines.push(`${timestamp} [pluginperf] No samples yet.`);
    appendPluginPerfLog(logLines);
    return;
  }

  player.getPacketSender().sendMessage(
    `[pluginperf] Top ${rows.length} plugins (total/avg/max ms)`
  );
  logLines.push(`${timestamp} [pluginperf] Top ${rows.length} plugins (total/avg/max ms)`);

  for (const row of rows) {
    const line = `[pluginperf] ${row.pluginName}: ${row.totalMs.toFixed(1)}/${row.avgMs.toFixed(3)}/${row.maxMs.toFixed(3)} calls=${row.calls} top=${row.topEventName}(${row.topEventTotalMs.toFixed(1)}ms)`;
    player.getPacketSender().sendMessage(line);
    logLines.push(`${timestamp} ${line}`);
  }

  appendPluginPerfLog(logLines);
}

module.exports = {
  name: "PluginPerfCommand",
  register(api) {
    api.onPlayerDisconnect(({ username }) => {
      if (username) {
        stopPluginPerfStream(username);
      }
    });

    api.onPlayerLogout(({ username }) => {
      if (username) {
        stopPluginPerfStream(username);
      }
    });

    api.registerCommand("pluginperf", ({ player, parts }) => {
      if (!adminOrAbove(player)) {
        player.getPacketSender().sendMessage("You do not have permission to use this command.");
        return true;
      }

      const sub = (parts[1] || "once").toLowerCase();
      const limitArg = parseIntArg(parts[2]);
      const intervalArg = parseIntArg(parts[3]);
      const limit = limitArg && limitArg > 0 ? Math.min(limitArg, MAX_LIMIT) : DEFAULT_LIMIT;
      const intervalMs =
        intervalArg && intervalArg >= MIN_INTERVAL_MS
          ? Math.min(intervalArg, MAX_INTERVAL_MS)
          : DEFAULT_INTERVAL_MS;
      const username = player.getUsername();

      if (sub === "reset") {
        PluginManager.resetPluginPerformanceStats();
        player.getPacketSender().sendMessage("[pluginperf] Stats reset.");
        return true;
      }

      if (sub === "off") {
        stopPluginPerfStream(username);
        if (pluginPerfStreams.size === 0) {
          PluginManager.setPluginPerformanceProfilingEnabled(false);
        }
        player
          .getPacketSender()
          .sendMessage(
            `[pluginperf] Live stream disabled. profiling=${PluginManager.isPluginPerformanceProfilingEnabled()}`
          );
        return true;
      }

      if (sub === "on") {
        PluginManager.setPluginPerformanceProfilingEnabled(true);
        stopPluginPerfStream(username);
        const timer = setInterval(() => {
          if (!World.isPlayerSessionConnected(player)) {
            stopPluginPerfStream(username);
            if (pluginPerfStreams.size === 0) {
              PluginManager.setPluginPerformanceProfilingEnabled(false);
            }
            return;
          }
          streamPluginPerfToPlayer(player, limit);
        }, intervalMs);
        timer.unref?.();
        pluginPerfStreams.set(username, timer);
        player
          .getPacketSender()
          .sendMessage(
            `[pluginperf] Live stream enabled every ${intervalMs}ms (limit=${limit}).`
          );
        return true;
      }

      if (sub === "once") {
        PluginManager.setPluginPerformanceProfilingEnabled(true);
        streamPluginPerfToPlayer(player, limit);
        return true;
      }

      player
        .getPacketSender()
        .sendMessage("Usage: ::pluginperf [once|on|off|reset] [limit] [intervalMs]");
      return true;
    });
  },
};
