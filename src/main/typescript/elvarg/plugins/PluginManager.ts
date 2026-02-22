import * as fs from "fs";
import * as path from "path";
import { GameConstants } from "../game/GameConstants";
import { PacketExecutor } from "../net/packet/PacketExecutor";
import {
  PluginApi,
  PluginCanAttackEvent,
  PluginCanDrinkEvent,
  PluginCanEatEvent,
  PluginCanEquipEvent,
  PluginCanTeleportEvent,
  PluginItemActionEvent,
  PluginModule,
  PluginItemOnGroundItemEvent,
  PluginItemOnItemEvent,
  PluginItemOnObjectEvent,
  PluginNpcDeathEvent,
  PluginNpcAggressionToleranceEvent,
  PluginNpcInteractionEvent,
  PluginObjectInteractionEvent,
  PluginPlayerDefeatedEvent,
  PluginPathBlockedEvent,
  PluginPlayerProcessEvent,
  PluginPlayerPathBlockedEvent,
  PluginPacketEvent,
  PluginCommandEvent,
  PluginPlayerDisconnectEvent,
  PluginPlayerLoginEvent,
  PluginRegionLoadedEvent,
  PluginSpellDisabledEvent,
  PluginCanTradeEvent,
  PluginCombatEngine,
  PluginCombatMethodResolver,
  PluginNpcCombatMethodProvider,
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
  private static playerProcessHooks: PluginHook<PluginPlayerProcessEvent>[] = [];
  private static regionLoadedHooks: PluginHook<PluginRegionLoadedEvent>[] = [];
  private static pathBlockedHooks: PluginHook<PluginPathBlockedEvent>[] = [];
  private static objectInteractionHooks: PluginHook<PluginObjectInteractionEvent>[] = [];
  private static npcInteractionHooks: PluginHook<PluginNpcInteractionEvent>[] = [];
  private static npcDeathHooks: PluginHook<PluginNpcDeathEvent>[] = [];
  private static canAttackHooks: PluginHook<PluginCanAttackEvent>[] = [];
  private static canTeleportHooks: PluginHook<PluginCanTeleportEvent>[] = [];
  private static canEatHooks: PluginHook<PluginCanEatEvent>[] = [];
  private static canDrinkHooks: PluginHook<PluginCanDrinkEvent>[] = [];
  private static canTradeHooks: PluginHook<PluginCanTradeEvent>[] = [];
  private static canEquipHooks: PluginHook<PluginCanEquipEvent>[] = [];
  private static spellDisabledHooks: PluginHook<PluginSpellDisabledEvent>[] = [];
  private static npcAggressionToleranceHooks: PluginHook<PluginNpcAggressionToleranceEvent>[] = [];
  private static playerDefeatedHooks: PluginHook<PluginPlayerDefeatedEvent>[] = [];
  private static itemOnObjectHooks: PluginHook<PluginItemOnObjectEvent>[] = [];
  private static itemOnItemHooks: PluginHook<PluginItemOnItemEvent>[] = [];
  private static itemOnGroundItemHooks: PluginHook<PluginItemOnGroundItemEvent>[] =
    [];
  private static itemActionHooks: PluginHook<PluginItemActionEvent>[] = [];
  private static commandHooks: PluginHook<PluginCommandEvent>[] = [];
  private static commandHandlersByBase = new Map<
    string,
    PluginHook<PluginCommandEvent>[]
  >();
  private static slayerAssignHooks: Array<{
    pluginName: string;
    handler: (player: any) => boolean;
  }> = [];
  private static packetListeners = new Map<number, RegisteredPacketListener>();
  private static combatEngine: PluginCombatEngine | null = null;
  private static combatEngineOwner: string | null = null;
  private static combatMethodResolvers: PluginCombatMethodResolver[] = [];
  private static npcCombatMethodProviders: PluginNpcCombatMethodProvider[] = [];

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

  public static emitPlayerProcess(event: PluginPlayerProcessEvent): void {
    for (const hook of PluginManager.playerProcessHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] player_process hook failed (${hook.pluginName})`,
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

  public static emitNpcInteraction(event: PluginNpcInteractionEvent): boolean {
    for (const hook of PluginManager.npcInteractionHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] npc_interaction hook failed (${hook.pluginName})`,
          err
        );
      }
    }
    return event.handled === true;
  }

  public static emitNpcDeath(event: PluginNpcDeathEvent): void {
    for (const hook of PluginManager.npcDeathHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] npc_death hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitCanAttack(
    attacker: any,
    target: any
  ): boolean | null {
    const event: PluginCanAttackEvent = { attacker, target, allow: null };
    for (const hook of PluginManager.canAttackHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] can_attack hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.allow !== null) {
        return event.allow;
      }
    }
    return null;
  }

  public static emitCanTeleport(player: any): boolean | null {
    const event: PluginCanTeleportEvent = { player, allow: null };
    for (const hook of PluginManager.canTeleportHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] can_teleport hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.allow !== null) {
        return event.allow;
      }
    }
    return null;
  }

  public static emitCanEat(player: any, itemId: number): boolean | null {
    const event: PluginCanEatEvent = { player, itemId, allow: null };
    for (const hook of PluginManager.canEatHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] can_eat hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.allow !== null) {
        return event.allow;
      }
    }
    return null;
  }

  public static emitCanDrink(player: any, itemId: number): boolean | null {
    const event: PluginCanDrinkEvent = { player, itemId, allow: null };
    for (const hook of PluginManager.canDrinkHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] can_drink hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.allow !== null) {
        return event.allow;
      }
    }
    return null;
  }

  public static emitCanTrade(player: any, target: any): boolean | null {
    const event: PluginCanTradeEvent = { player, target, allow: null };
    for (const hook of PluginManager.canTradeHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] can_trade hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.allow !== null) {
        return event.allow;
      }
    }
    return null;
  }

  public static emitCanEquip(player: any, slot: number, item: any): boolean | null {
    const event: PluginCanEquipEvent = { player, slot, item, allow: null };
    for (const hook of PluginManager.canEquipHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] can_equip hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.allow !== null) {
        return event.allow;
      }
    }
    return null;
  }

  public static emitSpellDisabled(
    player: any,
    spellbook: any,
    spellId: number
  ): boolean | null {
    const event: PluginSpellDisabledEvent = {
      player,
      spellbook,
      spellId,
      disabled: null,
    };
    for (const hook of PluginManager.spellDisabledHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] spell_disabled hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.disabled !== null) {
        return event.disabled;
      }
    }
    return null;
  }

  public static emitNpcAggressionTolerance(
    player: any,
    npc: any
  ): boolean | null {
    const event: PluginNpcAggressionToleranceEvent = {
      player,
      npc,
      override: null,
    };
    for (const hook of PluginManager.npcAggressionToleranceHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] npc_aggression_tolerance hook failed (${hook.pluginName})`,
          err
        );
      }
      if (event.override !== null) {
        return event.override;
      }
    }
    return null;
  }

  public static emitPlayerDefeated(killer: any, victim: any): void {
    const event: PluginPlayerDefeatedEvent = { killer, victim };
    for (const hook of PluginManager.playerDefeatedHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] player_defeated hook failed (${hook.pluginName})`,
          err
        );
      }
    }
  }

  public static emitSlayerAssignRequest(player: any): boolean {
    for (const hook of PluginManager.slayerAssignHooks) {
      try {
        if (hook.handler(player) === true) {
          return true;
        }
      } catch (err) {
        console.error(
          `[plugins] slayer_assign hook failed (${hook.pluginName})`,
          err
        );
      }
    }
    return false;
  }

  public static emitItemOnObject(event: PluginItemOnObjectEvent): boolean {
    for (const hook of PluginManager.itemOnObjectHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] item_on_object hook failed (${hook.pluginName})`,
          err
        );
      }
    }
    return event.handled === true;
  }

  public static emitItemOnItem(event: PluginItemOnItemEvent): boolean {
    for (const hook of PluginManager.itemOnItemHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] item_on_item hook failed (${hook.pluginName})`,
          err
        );
      }
    }
    return event.handled === true;
  }

  public static emitItemOnGroundItem(
    event: PluginItemOnGroundItemEvent
  ): boolean {
    for (const hook of PluginManager.itemOnGroundItemHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] item_on_ground_item hook failed (${hook.pluginName})`,
          err
        );
      }
    }
    return event.handled === true;
  }

  public static emitItemAction(event: PluginItemActionEvent): boolean {
    for (const hook of PluginManager.itemActionHooks) {
      try {
        hook.handler(event);
      } catch (err) {
        console.error(
          `[plugins] item_action hook failed (${hook.pluginName})`,
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
    const registerObjectClickHook = (
      clickType: number,
      objectIds: number | number[],
      handler: (event: PluginObjectInteractionEvent) => void | boolean,
      label = "object"
    ): void => {
      const normalized = Array.isArray(objectIds) ? objectIds : [objectIds];
      if (!normalized.length) {
        console.warn(
          `[plugins] ${pluginName} attempted invalid ${label} click hook registration objectIds=[]`
        );
        return;
      }

      const validIds = normalized.filter(
        (id) => Number.isInteger(id) && id >= 0
      ) as number[];
      if (validIds.length !== normalized.length || typeof handler !== "function") {
        console.warn(
          `[plugins] ${pluginName} attempted invalid ${label} click hook registration objectIds=${JSON.stringify(objectIds)}`
        );
        return;
      }

      const objectIdSet = new Set(validIds);

      PluginManager.objectInteractionHooks.push({
        pluginName,
        handler: (event) => {
          if (!event || event.handled || event.clickType !== clickType) {
            return;
          }
          if (!objectIdSet.has(event.objectId)) {
            return;
          }

          const result = handler(event);
          if (result !== false) {
            event.handled = true;
          }
        },
      });
    };

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
        PluginManager.loginHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.player || !event.username) {
              return;
            }
            handler(event);
          },
        });
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
      onPlayerProcess: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.playerProcessHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.player) {
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
        PluginManager.regionLoadedHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              !Number.isInteger(event.regionId) ||
              !Number.isInteger(event.absX) ||
              !Number.isInteger(event.absY)
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onPathBlocked: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.pathBlockedHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.entity || !event.from || !event.to) {
              return;
            }
            handler(event);
          },
        });
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
        PluginManager.objectInteractionHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled || !event.player || !event.object) {
              return;
            }
            handler(event);
          },
        });
      },
      onNpcInteraction: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.npcInteractionHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled || !event.player || !event.npc) {
              return;
            }
            handler(event);
          },
        });
      },
      onNpcDeath: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.npcDeathHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.killer || !event.npc) {
              return;
            }
            handler(event);
          },
        });
      },
      onCanAttack: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.canAttackHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.attacker || !event.target) {
              return;
            }
            handler(event);
          },
        });
      },
      onCanTeleport: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.canTeleportHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.player) {
              return;
            }
            handler(event);
          },
        });
      },
      onCanEat: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.canEatHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              !event.player ||
              !Number.isInteger(event.itemId)
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onCanDrink: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.canDrinkHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              !event.player ||
              !Number.isInteger(event.itemId)
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onCanTrade: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.canTradeHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.player || !event.target) {
              return;
            }
            handler(event);
          },
        });
      },
      onCanEquip: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.canEquipHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              !event.player ||
              !event.item ||
              !Number.isInteger(event.slot)
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onSpellDisabled: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.spellDisabledHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              !event.player ||
              !Number.isInteger(event.spellId)
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onNpcAggressionTolerance: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.npcAggressionToleranceHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.player || !event.npc) {
              return;
            }
            handler(event);
          },
        });
      },
      onPlayerDefeated: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.playerDefeatedHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || !event.victim) {
              return;
            }
            handler(event);
          },
        });
      },
      onSlayerAssignRequest: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.slayerAssignHooks.push({ pluginName, handler });
      },
      onNpcClick: (npcId, clickType, handler) => {
        if (
          !Number.isInteger(npcId) ||
          npcId < 0 ||
          !Number.isInteger(clickType) ||
          clickType < 1 ||
          clickType > 4 ||
          typeof handler !== "function"
        ) {
          console.warn(
            `[plugins] ${pluginName} attempted invalid npc click hook registration npcId=${npcId} clickType=${clickType}`
          );
          return;
        }

        PluginManager.npcInteractionHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled) {
              return;
            }
            if (event.npcId !== npcId || event.clickType !== clickType) {
              return;
            }

            const result = handler(event);
            if (result !== false) {
              event.handled = true;
            }
          },
        });
      },
      onNpcSecondClick: (npcId, handler) => {
        if (
          !Number.isInteger(npcId) ||
          npcId < 0 ||
          typeof handler !== "function"
        ) {
          console.warn(
            `[plugins] ${pluginName} attempted invalid second-click npc hook registration npcId=${npcId}`
          );
          return;
        }

        PluginManager.npcInteractionHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled) {
              return;
            }
            if (event.npcId !== npcId || event.clickType !== 2) {
              return;
            }

            const result = handler(event);
            if (result !== false) {
              event.handled = true;
            }
          },
        });
      },
      onItemOnObject: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.itemOnObjectHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled || !event.player || !event.object) {
              return;
            }
            handler(event);
          },
        });
      },
      onItemOnItem: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.itemOnItemHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              event.handled ||
              !event.player ||
              !event.usedItem ||
              !event.usedWithItem
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onItemOnGroundItem: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.itemOnGroundItemHooks.push({
          pluginName,
          handler: (event) => {
            if (!event || event.handled || !event.player || !event.inventoryItem) {
              return;
            }
            handler(event);
          },
        });
      },
      onItemAction: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.itemActionHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              event.handled ||
              !event.player ||
              !event.item ||
              !Number.isInteger(event.slot) ||
              !Number.isInteger(event.itemId) ||
              !Number.isInteger(event.clickType)
            ) {
              return;
            }
            handler(event);
          },
        });
      },
      onItemFirstAction: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.itemActionHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              event.handled ||
              event.clickType !== 1 ||
              !event.player ||
              !event.item
            ) {
              return;
            }
            const result = handler(event);
            if (result !== false) {
              event.handled = true;
            }
          },
        });
      },
      onCommand: (handler) => {
        if (typeof handler !== "function") {
          return;
        }
        PluginManager.commandHooks.push({
          pluginName,
          handler: (event) => {
            if (
              !event ||
              event.handled ||
              !event.player ||
              typeof event.raw !== "string" ||
              typeof event.base !== "string" ||
              !Array.isArray(event.parts)
            ) {
              return;
            }
            handler(event);
          },
        });
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
      onObjectClick: (objectIds, clickType, handler) => {
        if (!Number.isInteger(clickType) || clickType < 1 || clickType > 5) {
          console.warn(
            `[plugins] ${pluginName} attempted invalid object click hook registration objectIds=${JSON.stringify(objectIds)} clickType=${clickType}`
          );
          return;
        }

        registerObjectClickHook(clickType, objectIds, handler, "object");
      },
      onObjectFirstClick: (objectIds, handler) => {
        registerObjectClickHook(1, objectIds, handler, "first");
      },
      onObjectSecondClick: (objectIds, handler) => {
        registerObjectClickHook(2, objectIds, handler, "second");
      },
      onObjectThirdClick: (objectIds, handler) => {
        registerObjectClickHook(3, objectIds, handler, "third");
      },
      onObjectFourthClick: (objectIds, handler) => {
        registerObjectClickHook(4, objectIds, handler, "fourth");
      },
      onObjectFifthClick: (objectIds, handler) => {
        registerObjectClickHook(5, objectIds, handler, "fifth");
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
      setCombatEngine: (engine) => {
        if (!engine || typeof engine.getMethod !== "function") {
          console.warn(
            `[plugins] ${pluginName} attempted invalid combat engine registration`
          );
          return;
        }
        PluginManager.setCombatEngineInternal(pluginName, engine);
      },
      registerCombatMethodResolver: (resolver) => {
        if (!resolver || typeof resolver.resolve !== "function") {
          console.warn(
            `[plugins] ${pluginName} attempted invalid combat method resolver registration`
          );
          return;
        }
        PluginManager.registerCombatMethodResolverInternal(pluginName, resolver);
      },
      registerNpcCombatMethodProvider: (provider) => {
        if (!provider || typeof provider.provide !== "function") {
          console.warn(
            `[plugins] ${pluginName} attempted invalid NPC combat method provider registration`
          );
          return;
        }
        PluginManager.registerNpcCombatMethodProviderInternal(pluginName, provider);
      },
      log: (message, extra) => {

        if (extra && Object.keys(extra).length > 0) {
        //  console.log(`[plugin:${pluginName}] ${message}`, extra);
        } else {
        //  console.log(`[plugin:${pluginName}] ${message}`);
        }
      },
    };
  }

  public static getCombatEngine(): PluginCombatEngine | null {
    return PluginManager.combatEngine;
  }

  public static getCombatMethodResolvers(): PluginCombatMethodResolver[] {
    return PluginManager.combatMethodResolvers.slice();
  }

  public static getNpcCombatMethodProviders(): PluginNpcCombatMethodProvider[] {
    return PluginManager.npcCombatMethodProviders.slice();
  }

  private static setCombatEngineInternal(
    pluginName: string,
    engine: PluginCombatEngine
  ): void {
    if (!engine) {
      return;
    }
    if (PluginManager.combatEngine) {
      console.warn(
        `[plugins] combat engine overridden (${PluginManager.combatEngineOwner ?? "unknown"} -> ${pluginName})`
      );
    }
    PluginManager.combatEngine = engine;
    PluginManager.combatEngineOwner = pluginName;
  }

  private static registerCombatMethodResolverInternal(
    pluginName: string,
    resolver: PluginCombatMethodResolver
  ): void {
    PluginManager.combatMethodResolvers.push(resolver);
  }

  private static registerNpcCombatMethodProviderInternal(
    pluginName: string,
    provider: PluginNpcCombatMethodProvider
  ): void {
    PluginManager.npcCombatMethodProviders.push(provider);
  }
}
