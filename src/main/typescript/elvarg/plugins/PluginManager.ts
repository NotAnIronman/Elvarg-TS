import * as fs from "fs";
import * as path from "path";
import { GameConstants } from "../game/GameConstants";
import { PacketExecutor } from "../net/packet/PacketExecutor";
import {
  PluginApi,
  PluginModule,
  PluginObjectInteractionEvent,
  PluginPathBlockedEvent,
  PluginPlayerPathBlockedEvent,
  PluginPacketEvent,
  PluginCommandEvent,
  PluginPlayerDisconnectEvent,
  PluginPlayerLoginEvent,
  PluginRegionLoadedEvent,
} from "./PluginTypes";

type PluginHook<T> = {
  pluginName: string;
  handler: (event: T) => void;
};

type RegisteredPacketListener = {
  pluginName: string;
  listener: PacketExecutor;
};

export class PluginManager {
  private static readonly MAX_PLUGIN_DEPTH = 2;
  private static initialized = false;
  private static loadedPlugins: string[] = [];
  private static packetHooks: PluginHook<PluginPacketEvent>[] = [];
  private static loginHooks: PluginHook<PluginPlayerLoginEvent>[] = [];
  private static disconnectHooks: PluginHook<PluginPlayerDisconnectEvent>[] = [];
  private static regionLoadedHooks: PluginHook<PluginRegionLoadedEvent>[] = [];
  private static pathBlockedHooks: PluginHook<PluginPathBlockedEvent>[] = [];
  private static objectInteractionHooks: PluginHook<PluginObjectInteractionEvent>[] = [];
  private static commandHooks: PluginHook<PluginCommandEvent>[] = [];
  private static commandHandlersByBase = new Map<
    string,
    PluginHook<PluginCommandEvent>[]
  >();
  private static packetListeners = new Map<number, RegisteredPacketListener>();

  public static loadFromDirectory(
    pluginDirectory = path.join(process.cwd(), "plugins")
  ): void {
    if (PluginManager.initialized) {
      return;
    }
    PluginManager.initialized = true;

    if (
      !fs.existsSync(pluginDirectory) ||
      !fs.statSync(pluginDirectory).isDirectory()
    ) {
      console.info(
        `[plugins] directory not found at ${pluginDirectory}; continuing without plugins`
      );
      return;
    }

    const pluginFiles = PluginManager.discoverPluginFiles(
      pluginDirectory,
      PluginManager.MAX_PLUGIN_DEPTH
    );

    if (pluginFiles.length === 0) {
      console.info(
        `[plugins] no plugin files found in ${pluginDirectory} (max depth ${PluginManager.MAX_PLUGIN_DEPTH})`
      );
      return;
    }

    for (const pluginPath of pluginFiles) {
      PluginManager.loadPlugin(pluginPath);
    }

    if (PluginManager.loadedPlugins.length === 0) {
      console.warn(
        `[plugins] no valid plugins loaded from ${pluginDirectory}`
      );
      return;
    }

    console.info(
      `[plugins] loaded ${PluginManager.loadedPlugins.length}: ${PluginManager.loadedPlugins.join(
        ", "
      )}`
    );
  }

  public static getPacketListener(opcode: number): PacketExecutor | undefined {
    return PluginManager.packetListeners.get(opcode)?.listener;
  }

  public static emitPacketReceived(event: PluginPacketEvent): void {
    for (const hook of PluginManager.packetHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] packet hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitPlayerLogin(event: PluginPlayerLoginEvent): void {
    for (const hook of PluginManager.loginHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] login hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitPlayerDisconnect(event: PluginPlayerDisconnectEvent): void {
    for (const hook of PluginManager.disconnectHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] disconnect hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitRegionLoaded(event: PluginRegionLoadedEvent): void {
    for (const hook of PluginManager.regionLoadedHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] region_loaded hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitPathBlocked(event: PluginPathBlockedEvent): void {
    for (const hook of PluginManager.pathBlockedHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] path_blocked hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitObjectInteraction(
    event: PluginObjectInteractionEvent
  ): boolean {
    for (const hook of PluginManager.objectInteractionHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] object_interaction hook failed (${hook.pluginName})`,
          err
        );
      }
    }
    return event.handled === true;
  }

  public static emitCommand(event: PluginCommandEvent): boolean {
    for (const hook of PluginManager.commandHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] command hook failed (${hook.pluginName})`,
          err
        );
      }
    }

    if (event.handled) {
      return true;
    }

    const baseHandlers = PluginManager.commandHandlersByBase.get(event.base);
    if (!baseHandlers) {
      return event.handled;
    }

    for (const hook of baseHandlers) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] command hook failed (${hook.pluginName})`,
          err
        );
      }
    }

    return event.handled;
  }

  private static validatePacketListenerRegistration(
    pluginName: string,
    opcode: number,
    listener: PacketExecutor
  ): boolean {
    if (
      !Number.isInteger(opcode) ||
      opcode < 0 ||
      opcode > 255 ||
      !listener ||
      typeof (listener as any).execute !== "function"
    ) {
      console.warn(
        `[plugins] ${pluginName} attempted invalid packet listener registration for opcode=${opcode}`
      );
      return false;
    }
    return true;
  }

  private static registerPacketListenerInternal(
    pluginName: string,
    opcode: number,
    listener: PacketExecutor
  ): void {
    const existing = PluginManager.packetListeners.get(opcode);
    if (existing) {
      console.warn(
        `[plugins] packet listener opcode ${opcode} overridden: ${existing.pluginName} -> ${pluginName}`
      );
    }

    PluginManager.packetListeners.set(opcode, { pluginName, listener });
  }

  private static discoverPluginFiles(
    pluginDirectory: string,
    maxDepth: number
  ): string[] {
    const pluginPaths: string[] = [];

    const walk = (directory: string, depth: number) => {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (depth < maxDepth) {
            walk(fullPath, depth + 1);
          }
          continue;
        }

        const lowerName = entry.name.toLowerCase();
        if (lowerName.endsWith(".plugin.js")) {
          pluginPaths.push(fullPath);
        }
      }
    };

    walk(pluginDirectory, 0);
    pluginPaths.sort((a, b) => a.localeCompare(b));
    return pluginPaths;
  }

  private static loadPlugin(pluginPath: string): void {
    try {
      const imported = require(pluginPath);
      const plugin = (imported?.default ?? imported) as PluginModule;

      if (!plugin || typeof plugin.register !== "function") {
        console.warn(
          `[plugins] skipped ${path.basename(
            pluginPath
          )}: missing register(api) export`
        );
        return;
      }

      const fallbackName = path.basename(pluginPath, path.extname(pluginPath));
      const pluginName =
        typeof plugin.name === "string" && plugin.name.trim().length > 0
          ? plugin.name.trim()
          : fallbackName;

      plugin.register(PluginManager.createApi(pluginName));
      PluginManager.loadedPlugins.push(pluginName);
    } catch (err) {
      console.error(
        `[plugins] failed to load ${path.basename(pluginPath)}`,
        err
      );
    }
  }

  private static createApi(pluginName: string): PluginApi {
    return {
      onPacketReceived: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.packetHooks.push({ pluginName, handler });
      },
      onEstablishedPacket: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.packetHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.stage !== "ESTABLISHED" || !event.player) {
              return;
            }
            handler(event);
          },
        });
      },
      onPlayerLogin: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.loginHooks.push({ pluginName, handler });
      },
      onPlayerDisconnect: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.disconnectHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.player || !event.username) {
              return;
            }
            handler(event);
          },
        });
      },
      onRegionLoaded: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.regionLoadedHooks.push({ pluginName, handler });
      },
      onPathBlocked: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.pathBlockedHooks.push({ pluginName, handler });
      },
      onPlayerPathBlocked: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.pathBlockedHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.isPlayer || !event.entity || !event.username) {
              return;
            }
            handler(event as PluginPlayerPathBlockedEvent);
          },
        });
      },
      onObjectInteraction: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.objectInteractionHooks.push({ pluginName, handler });
      },
      onCommand: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.commandHooks.push({ pluginName, handler });
      },
      registerCommand: (command, handler) => {
        if (typeof command !== "string" || typeof handler !== "function") {
          return;
        }
        const normalized = command.trim().toLowerCase();
        if (!normalized.length) {
          return;
        }

        const wrapper: PluginHook<PluginCommandEvent> = {
          pluginName,
          handler: (event) => {
            if (!event || event.handled) {
              return;
            }
            const result = handler(event);
            if (result !== false) {
              event.handled = true;
            }
          },
        };

        const existing =
          PluginManager.commandHandlersByBase.get(normalized) ?? [];
        existing.push(wrapper);
        PluginManager.commandHandlersByBase.set(normalized, existing);
      },
      onObjectClick: (objectId, clickType, handler) => {
        if (
          !Number.isInteger(objectId) ||
          objectId < 0 ||
          !Number.isInteger(clickType) ||
          clickType < 1 ||
          clickType > 5 ||
          typeof handler !== "function"
        ) {
          console.warn(
            `[plugins] ${pluginName} attempted invalid object click hook registration objectId=${objectId} clickType=${clickType}`
          );
          return;
        }

        PluginManager.objectInteractionHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled) {
              return;
            }
            if (event.objectId !== objectId || event.clickType !== clickType) {
              return;
            }

            const result = handler(event);
            if (result !== false) {
              event.handled = true;
            }
          },
        });
      },
      onObjectFirstClick: (objectId, handler) => {
        if (
          !Number.isInteger(objectId) ||
          objectId < 0 ||
          typeof handler !== "function"
        ) {
          console.warn(
            `[plugins] ${pluginName} attempted invalid first-click object hook registration objectId=${objectId}`
          );
          return;
        }

        PluginManager.objectInteractionHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled) {
              return;
            }
            if (event.objectId !== objectId || event.clickType !== 1) {
              return;
            }

            const result = handler(event);
            if (result !== false) {
              event.handled = true;
            }
          },
        });
      },
      registerPacketListener: (opcode, listener) => {
        if (
          !PluginManager.validatePacketListenerRegistration(
            pluginName,
            opcode,
            listener
          )
        ) {
          return;
        }
        PluginManager.registerPacketListenerInternal(pluginName, opcode, listener);
      },
      registerAlivePacketListener: (opcode, listener) => {
        if (
          !PluginManager.validatePacketListenerRegistration(
            pluginName,
            opcode,
            listener
          )
        ) {
          return;
        }

        const guardedListener: PacketExecutor = {
          execute(player, packet) {
            if (!player || player.getHitpoints?.() <= 0) {
              return;
            }
            listener.execute(player, packet);
          },
        };

        PluginManager.registerPacketListenerInternal(
          pluginName,
          opcode,
          guardedListener
        );
      },
      setPlayerPersistence: (persistence) => {
        if (
          !persistence ||
          typeof (persistence as any).load !== "function" ||
          typeof (persistence as any).save !== "function" ||
          typeof (persistence as any).exists !== "function"
        ) {
          console.warn(
            `[plugins] ${pluginName} attempted invalid player persistence registration`
          );
          return;
        }

        const previousName =
          GameConstants.PLAYER_PERSISTENCE?.constructor?.name ?? "unknown";
        const nextName = (persistence as any).constructor?.name ?? "unknown";
        GameConstants.setPlayerPersistence(persistence);
        console.info(
          `[plugins] player persistence set by ${pluginName}: ${previousName} -> ${nextName}`
        );
      },
      log: (message, extra) => {
        if (extra && Object.keys(extra).length > 0) {
          console.log(`[plugin:${pluginName}] ${message}`, extra);
        } else {
          console.log(`[plugin:${pluginName}] ${message}`);
        }
      },
    };
  }
}
