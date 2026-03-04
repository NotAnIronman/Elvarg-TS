
import { Server } from '../Server';
import { MobileList } from '../game/entity/impl/MobileList'
import { ItemOnGround } from './entity/impl/grounditem/ItemOnGround';
import { ItemOnGroundManager } from './entity/impl/grounditem/ItemOnGroundManager';
import { NPC } from './entity/impl/npc/NPC';
import { GameObject } from './entity/impl/object/GameObject';
import { MapObjects } from './entity/impl/object/MapObjects';
import { Player } from './entity/impl/player/Player';
import { NPCUpdating } from '../game/entity/updating/NPCUpdating'
import { PlayerUpdating } from './entity/updating/PlayerUpdating';
import { GameSyncExecutor } from './entity/updating/sync/GameSyncExecutor';
import { Graphic } from './model/Graphic';
import { Location } from './model/Location';
import { TaskManager } from './task/TaskManager';
import { GameConstants } from '../game/GameConstants'
import { Misc } from '../util/Misc';
import { List } from 'list'
import { TreeMap } from 'treemap'
import { Task } from './task/Task';
import { GameSyncTask } from './entity/updating/sync/GameSyncTask';
import { PluginManager } from '../plugins/PluginManager';

interface GameSyncTaskInterface {
    isParallel: boolean;
    isPlayerTask: boolean;
    execute(index: number): void;
}

export class World {
    private static readonly MAX_PLAYERS = 500;
    private static readonly NPC_ACTIVE_REGION_RADIUS = 1;
    private static players: MobileList<Player> = new MobileList<Player>(World.MAX_PLAYERS);
    // TODO: Wire player bot storage back in when bot support is restored.
    private static playerBots: Map<string, any> = new Map<string, any>();
    private static npcs: MobileList<NPC> = new MobileList<NPC>(5000);
    private static items: ItemOnGround[] = [];
    private static playerArray: Player[] = []
    private static activeNpcsForUpdate: NPC[] = [];

    /**
     * The collection of active {@link GameObject}s..
     */
    private static objects: GameObject[] = [];

    /**
     * The collection of removed {@link GameObject}s..
     */
    private static removedObjects: GameObject[] = [];

    /**
     * The collection of {@link Players}s waiting to be added to the game.
     */
    private static addPlayerQueue = new Array<Player>();

    /**
     * The collection of {@link Players}s waiting to be removed from the game.
     */
    private static removePlayerQueue = new Array<Player>();

    /**
     * The collection of {@link Players}s waiting to be added to the game.
     */
    public static addNPCQueue = new Array<NPC>();

    /**
     * The collection of {@link Players}s waiting to be removed from the game.
     */
    private static removeNPCQueue = new Array<NPC>();

    /**
     * The manager for game synchronization.
     */
    private static executor = new GameSyncExecutor();

    public players = new MobileList<Player>(0);
    public npcs = new MobileList<NPC>(0);
    public playerBots = new Map<string, any>();
    public items = new Array<ItemOnGround>();
    public objects = new Array<GameObject>();
    public removedObjects = new Set<GameObject>();
    public addPlayerQueue = new Array<Player>();
    public removePlayerQueue = new Array<Player>();
    public addNPCQueue = new Array<NPC>();
    public removeNPCQueue = new Array<NPC>();

    public static getPlayerById(id: number): Player | undefined {
        return this.playerArray.find(player => player.id === id);
    }

    public static getPlayerByName(username: string): Player | undefined {
        return this.players.search(p => p && p.getUsername && p.getUsername() === Misc.formatText(username));
    }

    public static isPlayerSessionConnected(player: Player): boolean {
        if (!player) {
            return false;
        }
        const channel: any = player.getSession?.()?.getChannel?.();
        if (!channel) {
            return false;
        }
        if (typeof channel.readyState === "number") {
            // ws WebSocket: 1 = OPEN
            return channel.readyState === 1;
        }
        if (typeof channel.connected === "boolean") {
            // socket.io Socket
            return channel.connected;
        }
        return true;
    }

    /**
    * Broadcasts a message to all players in the game.
    *
    * @param message
    *            The message to broadcast.
    */
    public static sendMessage(message: string) {
        World.players.forEach(p => p.getPacketSender().sendMessage(message));
    }

    /**
    * Broadcasts a message to all staff-members in the game.
    *
    * @param message
    *            The message to broadcast.
    */
    public static sendStaffMessage(message: string) {
        const players = [];
        World.players.forEach(p => {
            if (p && p.isStaff()) {
                players.push(p);
            }
        });
        players.forEach(p => p.getPacketSender().sendMessage(message));
    }

    /**
    * Saves all players in the game.
    */
    public static savePlayers() {
        let saved = 0;
        let failed = 0;
        this.players.forEach(player => {
            if (!player) {
                return;
            }
            try {
                GameConstants.PLAYER_PERSISTENCE.save(player);
                saved++;
            } catch (err) {
                failed++;
                console.error(`[world] Failed to save player ${player.getUsername?.() ?? "unknown"}`, err);
            }
        });
        if (saved > 0 || failed > 0) {
            console.info(`[world] savePlayers complete: saved=${saved}, failed=${failed}`);
        }
    }

    public static getPlayers(): MobileList<Player> {
        return this.players;
    }

    public static getNpcs(): MobileList<NPC> {
        return this.npcs;
    }

    public static getActiveNpcsForUpdate(): NPC[] {
        return this.activeNpcsForUpdate;
    }

    private static getRegionKey(x: number, y: number, z: number): string {
        return `${z}:${x >> 6}:${y >> 6}`;
    }

    private static buildActiveNpcRegionKeys(): Set<string> {
        const keys = new Set<string>();
        World.players.forEach((player) => {
            if (!player) {
                return;
            }
            const loc = player.getLocation();
            const baseRegionX = loc.getX() >> 6;
            const baseRegionY = loc.getY() >> 6;
            const z = loc.getZ();
            for (let dx = -World.NPC_ACTIVE_REGION_RADIUS; dx <= World.NPC_ACTIVE_REGION_RADIUS; dx++) {
                for (let dy = -World.NPC_ACTIVE_REGION_RADIUS; dy <= World.NPC_ACTIVE_REGION_RADIUS; dy++) {
                    keys.add(`${z}:${baseRegionX + dx}:${baseRegionY + dy}`);
                }
            }
        });
        return keys;
    }

    private static shouldProcessNpc(npc: NPC, activeRegionKeys: Set<string> | null): boolean {
        if (!npc) {
            return false;
        }

        if (!GameConstants.PROCESS_NPCS_BY_ACTIVE_REGIONS) {
            return true;
        }

        // Keep active combat/death flows alive even if temporarily out of region focus.
        if (npc.getInteractingMobile() != null || npc.isDyingFunction?.()) {
            return true;
        }

        if (!activeRegionKeys || activeRegionKeys.size === 0) {
            return false;
        }

        const loc = npc.getLocation();
        return activeRegionKeys.has(World.getRegionKey(loc.getX(), loc.getY(), loc.getZ()));
    }

    public static getPlayerBots(): TreeMap<string, any> {
        // TODO: Re-enable player bot map once bot lifecycle is implemented again.
        return this.playerBots;
    }

    public static getItems(): ItemOnGround[] {
        return this.items;
    }

    public static getObjects(): GameObject[] {
        return this.objects;
    }

    public static getRemovedObjects(): GameObject[] {
        return this.removedObjects;
    }

    public static getAddPlayerQueue(): Player[] {
        return this.addPlayerQueue;
    }
    public static getRemovePlayerQueue(): Player[] {
        return this.removePlayerQueue;
    }

    public static getAddNPCQueue(): NPC[] {
        return this.addNPCQueue;
    }

    public static getRemoveNPCQueue(): NPC[] {
        return this.removeNPCQueue;
    }

    public findSpawnedObject(id: number, loc: Location): GameObject | undefined {
        return World.objects.find(i => i.getId() === id && i.getLocation().equals(loc));
    }

    public static findCacheObject(player: Player, id: number, loc: Location): GameObject {
        return MapObjects.getPrivateArea(player, id, loc);
    }


    public static sendLocalGraphics(id: number, position: Location): void {
        for (const player of World.players) {
            if (player && player.getLocation().isWithinDistance(position, 32)) {
                player.getPacketSender().sendGraphic(new Graphic(id), position);
            }
        }
    }



    public getPlayerByName(username: string): Player | undefined {
        return World.players.search(p => p != null && p.getUsername().toLowerCase() === username.toLowerCase());
    }

    public sendMessage(message: string) {
        World.players.forEach(p => p.getPacketSender().sendMessage(message));
    }

    public sendStaffMessage(message: string): void {
        World.players.forEach(p => {
            if (p && p !== null && p.isStaff()) {
                p.getPacketSender().sendMessage(message);
            }
        });
    }

    public savePlayers() {
        World.players.forEach((p) => {
            if (p) {
                GameConstants.PLAYER_PERSISTENCE.save(p);
            }
        });
    }

    public static process() {
        World.activeNpcsForUpdate = [];

        // Process all active {@link Task}s..
        try {
            TaskManager.process();
        } catch (e) {
            console.error("[World] TaskManager.process failure", e);
        }

        // Process all ground items..
        try {
            ItemOnGroundManager.process();
        } catch (e) {
            console.error("[World] ItemOnGroundManager.process failure", e);
        }

        // Add pending players..
        for (let i = 0; i < GameConstants.QUEUED_LOOP_THRESHOLD; i++) {
            let player = World.addPlayerQueue.shift();
            if (!player)
                break;
            // Kick any copies before adding the new player
            let existingPlayer = World.getPlayerByName(player.username);
            if (existingPlayer) {
                existingPlayer.requestLogout();
            }
            World.players.add(player);
        }

        // Deregister queued players.
        // If a player's transport is already closed, force removal immediately.
        let amount = 0;
        for (let index = World.removePlayerQueue.length - 1; index >= 0; index--) {
            if (amount >= GameConstants.QUEUED_LOOP_THRESHOLD) {
                break;
            }
            const player = World.removePlayerQueue[index];
            if (!player) {
                World.removePlayerQueue.splice(index, 1);
                continue;
            }
            const disconnected = !World.isPlayerSessionConnected(player);
            if (disconnected || player.canLogout() || player.forcedLogoutTimer.finished() || Server.isUpdating()) {
                World.players.remove(player);
                World.removePlayerQueue.splice(index, 1);
            }
            amount++;
        }
        // Add pending Npcs..
        for (let i = 0; i < GameConstants.QUEUED_LOOP_THRESHOLD; i++) {
            let npc = World.addNPCQueue.shift();
            if (!npc)
                break;
            const added = World.npcs.add(npc);
            if (!added) {
                console.warn("[world:npc] add_queue_failed", {
                    npcId: typeof npc.getId === "function" ? npc.getId() : null,
                    npcIndex: typeof npc.getIndex === "function" ? npc.getIndex() : null,
                    registered: typeof npc.isRegistered === "function" ? npc.isRegistered() : null,
                    worldNpcCount: World.npcs.sizeReturn(),
                    worldNpcCapacity: World.npcs.capacityReturn(),
                    addNpcQueueSize: World.addNPCQueue.length,
                });
                continue;
            }
            if (typeof npc.isPet === "function" && npc.isPet()) {
                const owner: any = typeof npc.getOwner === "function" ? npc.getOwner() : null;
                const ownerName = owner && typeof owner.getUsername === "function"
                    ? owner.getUsername()
                    : null;
                console.info("[world:npc] add_queue_pet", {
                    owner: ownerName,
                    npcId: typeof npc.getId === "function" ? npc.getId() : null,
                    npcIndex: typeof npc.getIndex === "function" ? npc.getIndex() : null,
                    addNpcQueueSize: World.addNPCQueue.length,
                });
            }
        }

        // Removing pending npcs..
        for (let i = 0; i < GameConstants.QUEUED_LOOP_THRESHOLD; i++) {
            let npc = World.removeNPCQueue.shift();
            if (!npc)
                break;
            const wasRegistered =
                typeof npc.isRegistered === "function" ? npc.isRegistered() : null;
            const indexBefore = typeof npc.getIndex === "function" ? npc.getIndex() : null;
            World.npcs.remove(npc);
            if (typeof npc.isPet === "function" && npc.isPet()) {
                const owner: any = typeof npc.getOwner === "function" ? npc.getOwner() : null;
                const ownerName = owner && typeof owner.getUsername === "function"
                    ? owner.getUsername()
                    : null;
                console.info("[world:npc] remove_queue_pet", {
                    owner: ownerName,
                    npcId: typeof npc.getId === "function" ? npc.getId() : null,
                    npcIndex: indexBefore,
                    wasRegistered,
                    nowRegistered:
                        typeof npc.isRegistered === "function" ? npc.isRegistered() : null,
                    removeNpcQueueSize: World.removeNPCQueue.length,
                });
            } else if (wasRegistered === false) {
                console.warn("[world:npc] remove_queue_unregistered", {
                    npcId: typeof npc.getId === "function" ? npc.getId() : null,
                    npcIndex: indexBefore,
                    removeNpcQueueSize: World.removeNPCQueue.length,
                });
            }
        }

        // Sequential processing to avoid null-slot crashes during bring-up.
        World.players.forEach((player) => {
            try {
                player.process();
                PluginManager.emitPlayerProcess({ player });
            } catch (e) {
                console.error(e);
                player.requestLogout();
            }
        });

        const activeNpcRegions = GameConstants.PROCESS_NPCS_BY_ACTIVE_REGIONS
            ? World.buildActiveNpcRegionKeys()
            : null;
        World.npcs.forEach((npc) => {
            try {
                if (!World.shouldProcessNpc(npc, activeNpcRegions)) {
                    return;
                }
                World.activeNpcsForUpdate.push(npc);
                npc.process();
            } catch (e) {
                console.error(e);
            }
        });

        // Enable player movement updates only. (NPC updating remains disabled for now.)
        World.players.forEach((player) => {
            try {
                PlayerUpdating.update(player);
                NPCUpdating.update(player);
            } catch (e) {
                console.error("[World] Player/NPC updating failure", e);
                player.requestLogout();
            }
        });

        World.players.forEach((player) => {
            try {
                player.resetUpdating();
                player.setCachedUpdateBlock(null);
                player.getSession().flush();
            } catch (e) {
                console.log(e);
                player.requestLogout();
            }
        });

        World.npcs.forEach((npc) => {
            try {
                npc.resetUpdating();
            } catch (e) {
                console.log(e);
            }
        });
    }

}

class NPCSyncTask implements GameSyncTaskInterface {
    isParallel: boolean;
    isPlayerTask: boolean;

    constructor(isParallel: boolean, isPlayerTask: boolean) {
        this.isParallel = isParallel;
        this.isPlayerTask = isPlayerTask;
    }

    execute(index: number) {
        let npc = World.getNpcs().get(index);
        try {
            npc.process();
        } catch (e) {
            console.error("Erro ao processar NPC: ", e);
            throw new Error("Erro ao processar NPC");
        }
    }
}

class PlayerSyncTask implements GameSyncTaskInterface {
    isParallel: boolean;
    isPlayerTask: boolean;

    constructor(isPlayerTask: boolean) {
        this.isParallel = true;
        this.isPlayerTask = isPlayerTask;
    }

    execute(index: number) {
        let player = World.getPlayers().get(index);
        try {
            PlayerUpdating.update(player);
            NPCUpdating.update(player);
        } catch (e) {
            console.error("Erro ao atualizar jogador: ", e);
            player.onLogout();
            throw new Error("Erro ao atualizar jogador");
        }
    }
}

export class GameTask extends GameSyncTask {
    constructor(b: boolean, private readonly execFunc: Function, c?: boolean) {
        super(b, c)
    }
    execute(): void {
        this.execFunc();
    }

}
