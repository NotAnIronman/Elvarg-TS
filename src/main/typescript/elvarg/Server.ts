// Provide minimal browser globals for libs that expect window (e.g., phaser).
(global as any).window = (global as any).window ?? {};
(global as any).document = (global as any).document ?? { documentElement: {}, createElement: () => ({ canPlayType: () => "", getContext: () => ({ fillRect: () => {}, drawImage: () => {}, getImageData: () => ({ data: [0,0,0,0] }), putImageData: () => {} }) }) };
if (typeof (global as any).navigator === "undefined") {
(global as any).navigator = {};
}
(global as any).Image = (global as any).Image ?? function () { return {}; };
(global as any).HTMLCanvasElement = (global as any).HTMLCanvasElement ?? function () {};
import * as path from "path";
import { GameBuilder } from "./game/GameBuilder";
// import { GameConstants } from "./game/GameConstants";
import { World } from "./game/World";
import { NetworkBuilder } from "./net/NetworkBuilder";
import { NetworkConstants } from "./net/NetworkConstants";
import { PluginManager } from "./plugins/PluginManager";
import { Flooder } from "./util/flood/Flooder";
import { ServerLogger } from "./util/ServerLogger";

export class Server {
  private static flooder: Flooder = new Flooder();
  public static PRODUCTION = false;
  private static DEBUG_LOGGING = false;
  private static logger = {
    debug: (...args: any[]) => console.debug(...args),
    info: (...args: any[]) => console.info(...args),
    warn: (...args: any[]) => console.warn(...args),
    error: (...args: any[]) => console.error(...args),
  };
  private static updating = false;
  private static consolePatched = false;
  private static shuttingDown = false;
  private static gracefulHandlersInstalled = false;

  private static setupFileLogging() {
    if (Server.consolePatched) return;
    ServerLogger.install(path.join(process.cwd(), "logs", "server.log"));
    Server.consolePatched = true;
  }

  private static installGlobalCrashHandlers() {
    process.on("uncaughtException", (err) => {
      console.error("[fatal] uncaughtException", err);
    });
    process.on("unhandledRejection", (reason) => {
      console.error("[fatal] unhandledRejection", reason);
    });
  }

  private static installGracefulShutdownHandlers() {
    if (Server.gracefulHandlersInstalled) {
      return;
    }
    Server.gracefulHandlersInstalled = true;

    process.on("SIGINT", () => {
      Server.gracefulShutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      Server.gracefulShutdown("SIGTERM");
    });
    process.once("SIGUSR2", () => {
      Server.gracefulShutdown("SIGUSR2", "restart");
    });
  }

  private static gracefulShutdown(
    signal: NodeJS.Signals,
    mode: "exit" | "restart" = "exit"
  ) {
    if (Server.shuttingDown) {
      console.info(`[shutdown] ${signal} ignored: shutdown already in progress`);
      return;
    }
    Server.shuttingDown = true;

    try {
      const onlinePlayers = World.getPlayers().sizeReturn();
      console.info(
        `[shutdown] ${signal} received. Persisting ${onlinePlayers} online players...`
      );
      PluginManager.emitServerShutdown({ timestamp: Date.now() });
      World.savePlayers();
      console.info("[shutdown] Player persistence completed.");
    } catch (err) {
      console.error("[shutdown] Player persistence failed.", err);
    }

    if (mode === "restart") {
      console.info("[shutdown] Continuing nodemon restart (SIGUSR2).");
      process.kill(process.pid, "SIGUSR2");
      return;
    }

    process.exit(0);
  }

  public static main(args: string[]) {
    try {
      Server.setupFileLogging();
      Server.installGlobalCrashHandlers();
      Server.installGracefulShutdownHandlers();

      const productionArg = args.find((arg) => arg === "0" || arg === "1");
      if (productionArg) {
        Server.PRODUCTION = productionArg === "1";
      }
      const disablePlayerBots = args.includes("--disablePlayerBots");
      if (disablePlayerBots) {
        process.env.DISABLE_PLAYER_BOTS = "1";
        console.info("[Server] --disablePlayerBots enabled");
      }

      PluginManager.loadFromDirectory(path.join(process.cwd(), "plugins"));

      console.info(
        `Initializing Name in ${
          Server.PRODUCTION ? "production" : "non-production"
        } mode..`
      );
      // Start game logic (schedules GameEngine ticks, loads definitions, etc.)
      new GameBuilder().initialize();
      new NetworkBuilder().initialize(NetworkConstants.GAME_PORT);
      console.log("Start");
      // console.info(`${GameConstants.NAME} is now online!`);
    } catch (e) {
      console.log(e, "error");
      console.error(`An error occurred while binding the Bootstrap: ${e}`);
      process.exit(1);
    }
  }

  public static logDebug(logMessage: string) {
    if (!Server.DEBUG_LOGGING) {
      return;
    }

    Server.logger.info(logMessage);
  }

  public static getLogger() {
    return Server.logger;
  }

  public static isUpdating() {
    return Server.updating;
  }

  public static setUpdating(isUpdating: boolean) {
    Server.updating = isUpdating;
  }

  public static getFlooder() {
    return Server.flooder;
  }
}

if (require.main === module) {
  Server.main(process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["1"]);
}
