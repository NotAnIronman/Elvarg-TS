
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
import { Graphic } from './model/Graphic';
import { Location } from './model/Location';
import { TaskManager } from './task/TaskManager';
import { GameConstants } from '../game/GameConstants'
import { Misc } from '../util/Misc';
import { List } from 'list'
import { TreeMap } from 'treemap'
import { PluginManager } from '../plugins/PluginManager';
import { ServerPerf } from '../util/ServerPerf';
import { ActiveRegionIndex, ActiveRegionSnapshot } from './ActiveRegionIndex';
import { ShopManager } from './model/container/shop/ShopManager';
import { HitQueue } from './content/combat/hit/HitQueue';

const ATTR_SKIP_PERSISTENCE = "botSkipPersistence";

export class World {
    private static readonly MAX_PLAYERS = 1024;
    private static readonly MAX_NPCS = 32768;
    private static readonly IDLE_BOT_PROCESS_STRIDE = 2;
    private static readonly BOT_PROCESS_LOD_CHUNK_SIZE_TILES = 32;
    private static readonly BOT_PROCESS_LOD_NEAR_DISTANCE_TILES = 15;
    private static readonly BOT_PROCESS_LOD_MEDIUM_DISTANCE_TILES = 48;
    private static readonly BOT_PROCESS_LOD_NEAR_STRIDE = 1;
    private static readonly BOT_PROCESS_LOD_MEDIUM_STRIDE = 2;
    private static readonly BOT_PROCESS_LOD_FAR_STRIDE = 12;
    private static readonly UPDATE_BUCKET_RADIUS = 2;
    private static players: MobileList<Player> = new MobileList<Player>(World.MAX_PLAYERS);
    // TODO: Wire player bot storage back in when bot support is restored.
    private static playerBots: Map<string, any> = new Map<string, any>();
    private static npcs: MobileList<NPC> = new MobileList<NPC>(World.MAX_NPCS);
    private static items: ItemOnGround[] = [];
    private static playerArray: Player[] = []
    private static activeNpcsForUpdate: NPC[] = [];
    private static npcTileOccupants: Map<string, NPC[]> = new Map();
    private static activeRegionIndex: ActiveRegionIndex = new ActiveRegionIndex(1);
    private static realPlayerObserverBuckets: Map<string, Array<{ x: number; y: number; z: number }>> = new Map();
    private static realPlayerObserverCount = 0;
    private static playerUpdateBuckets: Map<string, Player[]> = new Map();
    private static npcUpdateBuckets: Map<string, NPC[]> = new Map();

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

    private static processCycle = 0;

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

    public static forEachNetworkPlayer(consumer: (player: Player) => void): void {
        if (typeof consumer !== "function") {
            return;
        }
        World.players.forEach((player) => {
            if (!World.shouldRunNetworkUpdates(player)) {
                return;
            }
            consumer(player);
        });
    }

    /**
    * Broadcasts a message to all players in the game.
    *
    * @param message
    *            The message to broadcast.
    */
    public static sendMessage(message: string) {
        World.forEachNetworkPlayer((player) =>
            player.getPacketSender().sendMessage(message)
        );
    }

    /**
    * Broadcasts a message to all staff-members in the game.
    *
    * @param message
    *            The message to broadcast.
    */
    public static sendStaffMessage(message: string) {
        World.forEachNetworkPlayer((player) => {
            if (player.isStaff()) {
                player.getPacketSender().sendMessage(message);
            }
        });
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
            if (player.getAttribute?.(ATTR_SKIP_PERSISTENCE) === true) {
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
            console.info(`[world] savePlayers queued: saved=${saved}, failed=${failed}`);
        }
    }

    public static getPlayers(): MobileList<Player> {
        return this.players;
    }

    public static getProcessCycle(): number {
        return this.processCycle;
    }

    public static getNpcs(): MobileList<NPC> {
        return this.npcs;
    }

    public static getActiveNpcsForUpdate(): NPC[] {
        return this.activeNpcsForUpdate;
    }

    public static getActiveRegionSnapshot(): ActiveRegionSnapshot {
        return World.activeRegionIndex.getSnapshot();
    }

    public static markActiveRegionsDirty(): void {
        World.refreshActiveRegions();
    }

    private static getRegionKey(x: number, y: number, z: number): string {
        return `${z}:${x >> 6}:${y >> 6}`;
    }

    private static getUpdateBucketKey(x: number, y: number, z: number): string {
        return `${z}:${x >> 3}:${y >> 3}`;
    }

    private static getNpcTileKey(x: number, y: number, z: number): string {
        return `${z}:${x}:${y}`;
    }

    private static getBotProcessObserverBucketKey(x: number, y: number, z: number): string {
        return `${z}:${Math.floor(x / World.BOT_PROCESS_LOD_CHUNK_SIZE_TILES)}:${Math.floor(y / World.BOT_PROCESS_LOD_CHUNK_SIZE_TILES)}`;
    }

    private static addNpcToTileOccupants(npc: NPC, location: Location | null | undefined): void {
        if (!npc || !location) {
            return;
        }
        const key = World.getNpcTileKey(location.getX(), location.getY(), location.getZ());
        const bucket = World.npcTileOccupants.get(key);
        if (bucket) {
            if (!bucket.includes(npc)) {
                bucket.push(npc);
            }
            return;
        }
        World.npcTileOccupants.set(key, [npc]);
    }

    private static removeNpcFromTileOccupants(npc: NPC, location: Location | null | undefined): void {
        if (!npc || !location) {
            return;
        }
        const key = World.getNpcTileKey(location.getX(), location.getY(), location.getZ());
        const bucket = World.npcTileOccupants.get(key);
        if (!bucket || bucket.length === 0) {
            return;
        }
        const nextBucket = bucket.filter((candidate) => candidate !== npc);
        if (nextBucket.length === 0) {
            World.npcTileOccupants.delete(key);
            return;
        }
        World.npcTileOccupants.set(key, nextBucket);
    }

    public static registerNpcPosition(npc: NPC, location: Location | null | undefined = npc?.getLocation?.()): void {
        World.addNpcToTileOccupants(npc, location);
    }

    public static unregisterNpcPosition(npc: NPC, location: Location | null | undefined = npc?.getLocation?.()): void {
        World.removeNpcFromTileOccupants(npc, location);
    }

    public static onNpcMoved(
        npc: NPC,
        previousLocation: Location | null | undefined,
        nextLocation: Location | null | undefined
    ): void {
        if (!npc || !previousLocation || !nextLocation) {
            return;
        }
        if (previousLocation.equals(nextLocation)) {
            return;
        }
        World.removeNpcFromTileOccupants(npc, previousLocation);
        World.addNpcToTileOccupants(npc, nextLocation);
    }

    public static isNpcOccupyingTile(
        location: Location | null | undefined,
        ignoredNpc: NPC | null = null
    ): boolean {
        if (!location) {
            return false;
        }
        const key = World.getNpcTileKey(location.getX(), location.getY(), location.getZ());
        const bucket = World.npcTileOccupants.get(key);
        if (!bucket || bucket.length === 0) {
            return false;
        }
        for (const npc of bucket) {
            if (!npc || npc === ignoredNpc) {
                continue;
            }
            return true;
        }
        return false;
    }

    private static addToUpdateBucket<T extends { getLocation(): Location }>(
        buckets: Map<string, T[]>,
        entity: T
    ): void {
        const loc = entity.getLocation();
        const key = World.getUpdateBucketKey(loc.getX(), loc.getY(), loc.getZ());
        const bucket = buckets.get(key);
        if (bucket) {
            bucket.push(entity);
            return;
        }
        buckets.set(key, [entity]);
    }

    private static rebuildUpdateBuckets(): void {
        World.npcUpdateBuckets.clear();
        World.playerUpdateBuckets.clear();
        World.players.forEach((player) => {
            if (!player) {
                return;
            }
            World.addToUpdateBucket(World.playerUpdateBuckets, player);
        });
        for (const npc of World.activeNpcsForUpdate) {
            if (!npc || !npc.isVisible?.()) {
                continue;
            }
            World.addToUpdateBucket(World.npcUpdateBuckets, npc);
        }
    }

    private static rebuildRealPlayerObserverBuckets(): void {
        World.realPlayerObserverBuckets.clear();
        World.realPlayerObserverCount = 0;
        World.players.forEach((candidate) => {
            if (!candidate || candidate.isPlayerBot?.() === true) {
                return;
            }
            if (!World.isPlayerSessionConnected(candidate)) {
                return;
            }
            const location = candidate.getLocation?.();
            if (!location) {
                return;
            }
            const observer = {
                x: location.getX(),
                y: location.getY(),
                z: location.getZ(),
            };
            const key = World.getBotProcessObserverBucketKey(
                observer.x,
                observer.y,
                observer.z
            );
            const bucket = World.realPlayerObserverBuckets.get(key);
            if (bucket) {
                bucket.push(observer);
            } else {
                World.realPlayerObserverBuckets.set(key, [observer]);
            }
            World.realPlayerObserverCount++;
        });
    }

    private static collectFromBuckets<T>(
        buckets: Map<string, T[]>,
        location: Location
    ): T[] {
        const results: T[] = [];
        const baseChunkX = location.getX() >> 3;
        const baseChunkY = location.getY() >> 3;
        const z = location.getZ();
        for (let dx = -World.UPDATE_BUCKET_RADIUS; dx <= World.UPDATE_BUCKET_RADIUS; dx++) {
            for (let dy = -World.UPDATE_BUCKET_RADIUS; dy <= World.UPDATE_BUCKET_RADIUS; dy++) {
                const bucket = buckets.get(`${z}:${baseChunkX + dx}:${baseChunkY + dy}`);
                if (!bucket || bucket.length === 0) {
                    continue;
                }
                results.push(...bucket);
            }
        }
        return results;
    }

    public static getBucketNearbyPlayersForUpdate(player: Player): Player[] {
        const nearby = World.collectFromBuckets(World.playerUpdateBuckets, player.getLocation());
        nearby.sort((a, b) => a.getIndex() - b.getIndex());
        return nearby;
    }

    public static getNearbyPlayersForUpdate(player: Player): Player[] {
        return World.getBucketNearbyPlayersForUpdate(player);
    }

    public static getNearbyNpcsForUpdate(player: Player): NPC[] {
        const nearby = World.collectFromBuckets(World.npcUpdateBuckets, player.getLocation());
        nearby.sort((a, b) => a.getIndex() - b.getIndex());
        return nearby;
    }

    public static refreshActiveRegions(): void {
        const snapshot = World.activeRegionIndex.update(
            World.players,
            (player) => World.shouldRunNetworkUpdates(player),
            World.processCycle,
            Date.now()
        );
        PluginManager.emitActiveRegionsUpdated(snapshot);
    }

    private static shouldProcessNpc(npc: NPC): boolean {
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

        const activeRegionKeys = World.activeRegionIndex.getActiveRegionKeys();
        if (activeRegionKeys.size === 0) {
            return false;
        }

        const loc = npc.getLocation();
        return activeRegionKeys.has(World.getRegionKey(loc.getX(), loc.getY(), loc.getZ()));
    }

    private static shouldRunNetworkUpdates(player: Player): boolean {
        if (!player) {
            return false;
        }
        // Bots have no real client session and do not need to receive world update packets.
        // Keeping them out of update-recipient loops avoids O(players^2) visibility work.
        if (player.isPlayerBot?.() === true) {
            return false;
        }
        if (!World.isPlayerSessionConnected(player)) {
            return false;
        }
        return true;
    }

    private static shouldProcessBotPlayerThisTick(
        player: Player,
        cycle: number
    ): boolean {
        if (!player || player.isPlayerBot?.() !== true) {
            return true;
        }

        if (player.getForceMovement?.() != null) {
            return true;
        }

        const index = Number(player.getIndex?.() ?? 0);
        const stride = World.resolveBotProcessStride(player);
        return ((cycle + index) % stride) === 0;
    }

    private static resolveBotProcessStride(player: Player): number {
        if (!player) {
            return 1;
        }
        if (World.isBotInteractingWithRealPlayer(player)) {
            return World.BOT_PROCESS_LOD_NEAR_STRIDE;
        }
        if (World.realPlayerObserverCount === 0) {
            return World.BOT_PROCESS_LOD_FAR_STRIDE;
        }

        const location = player.getLocation?.();
        if (!location) {
            return World.BOT_PROCESS_LOD_FAR_STRIDE;
        }

        const x = location.getX();
        const y = location.getY();
        const z = location.getZ();
        let bestChebyshevDistance = Number.POSITIVE_INFINITY;
        const chunkSize = World.BOT_PROCESS_LOD_CHUNK_SIZE_TILES;
        const baseChunkX = Math.floor(x / chunkSize);
        const baseChunkY = Math.floor(y / chunkSize);
        const chunkRadius = Math.max(
            1,
            Math.ceil(World.BOT_PROCESS_LOD_MEDIUM_DISTANCE_TILES / chunkSize)
        );

        for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
            for (let dy = -chunkRadius; dy <= chunkRadius; dy++) {
                const bucket = World.realPlayerObserverBuckets.get(
                    `${z}:${baseChunkX + dx}:${baseChunkY + dy}`
                );
                if (!bucket || bucket.length === 0) {
                    continue;
                }
                for (const observer of bucket) {
                    const distance = Math.max(
                        Math.abs(observer.x - x),
                        Math.abs(observer.y - y)
                    );
                    if (distance < bestChebyshevDistance) {
                        bestChebyshevDistance = distance;
                    }
                    if (bestChebyshevDistance <= World.BOT_PROCESS_LOD_NEAR_DISTANCE_TILES) {
                        return World.BOT_PROCESS_LOD_NEAR_STRIDE;
                    }
                }
            }
        }

        if (bestChebyshevDistance <= World.BOT_PROCESS_LOD_MEDIUM_DISTANCE_TILES) {
            return World.BOT_PROCESS_LOD_MEDIUM_STRIDE;
        }

        return Math.max(World.IDLE_BOT_PROCESS_STRIDE, World.BOT_PROCESS_LOD_FAR_STRIDE);
    }

    private static isRealNetworkPlayer(player: Player | null | undefined): boolean {
        if (!player || player.isPlayerBot?.() === true) {
            return false;
        }
        return World.isPlayerSessionConnected(player);
    }

    private static isBotInteractingWithRealPlayer(player: Player): boolean {
        if (!player || player.isPlayerBot?.() !== true) {
            return false;
        }

        const combat = player.getCombat?.();
        const related = [
            player.getInteractingMobile?.(),
            player.getFollowing?.(),
            player.getCombatFollowing?.(),
            combat?.getTarget?.(),
            combat?.getAttacker?.(),
        ];

        for (const entity of related) {
            if (!entity || entity.isPlayer?.() !== true) {
                continue;
            }
            const other = entity.getAsPlayer?.();
            if (World.isRealNetworkPlayer(other)) {
                return true;
            }
        }

        return false;
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
        World.forEachNetworkPlayer((player) => {
            if (player.getLocation().isWithinDistance(position, 32)) {
                player.getPacketSender().sendGraphic(new Graphic(id), position);
            }
        });
    }



    public getPlayerByName(username: string): Player | undefined {
        return World.players.search(p => p != null && p.getUsername().toLowerCase() === username.toLowerCase());
    }

    public sendMessage(message: string) {
        World.forEachNetworkPlayer((player) =>
            player.getPacketSender().sendMessage(message)
        );
    }

    public sendStaffMessage(message: string): void {
        World.forEachNetworkPlayer((player) => {
            if (player.isStaff()) {
                player.getPacketSender().sendMessage(message);
            }
        });
    }

    public savePlayers() {
        World.players.forEach((p) => {
            if (p && p.getAttribute?.(ATTR_SKIP_PERSISTENCE) !== true) {
                GameConstants.PLAYER_PERSISTENCE.save(p);
            }
        });
    }

    public static process() {
        World.processCycle = (World.processCycle + 1) & 0x7fffffff;
        World.activeNpcsForUpdate = [];
        const timed = <T>(phase: string, fn: () => T): T =>
            ServerPerf.measurePhase(`world.${phase}`, fn);

        // Process all active {@link Task}s..
        timed("task_manager", () => {
            try {
                TaskManager.process();
            } catch (e) {
                console.error("[World] TaskManager.process failure", e);
            }
        });

        // Process all ground items..
        timed("ground_items", () => {
            try {
                ItemOnGroundManager.process();
            } catch (e) {
                console.error("[World] ItemOnGroundManager.process failure", e);
            }
        });

        // Add pending players..
        timed("queue_add_players", () => {
            let activeRegionsChanged = false;
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
                if (
                    player.isPlayerBot?.() !== true &&
                    World.isPlayerSessionConnected(player)
                ) {
                    player.getPacketSender?.().sendDetails?.();
                    activeRegionsChanged = true;
                }
            }
            if (activeRegionsChanged) {
                World.refreshActiveRegions();
            }
        });

        // Deregister queued players.
        // If a player's transport is already closed, force removal immediately.
        timed("queue_remove_players", () => {
            let amount = 0;
            let activeRegionsChanged = false;
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
                    if (player.isPlayerBot?.() !== true) {
                        activeRegionsChanged = true;
                    }
                    World.players.remove(player);
                    World.removePlayerQueue.splice(index, 1);
                }
                amount++;
            }
            if (activeRegionsChanged) {
                World.refreshActiveRegions();
            }
        });
        // Add pending Npcs..
        timed("queue_add_npcs", () => {
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
                World.registerNpcPosition(npc);
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
        });

        // Removing pending npcs..
        timed("queue_remove_npcs", () => {
            for (let i = 0; i < GameConstants.QUEUED_LOOP_THRESHOLD; i++) {
                let npc = World.removeNPCQueue.shift();
                if (!npc)
                    break;
                const wasRegistered =
                    typeof npc.isRegistered === "function" ? npc.isRegistered() : null;
                const indexBefore = typeof npc.getIndex === "function" ? npc.getIndex() : null;
                World.unregisterNpcPosition(npc);
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
        });

        // Sequential processing to avoid null-slot crashes during bring-up.
        timed("process_players", () => {
            const cycle = World.processCycle;
            World.rebuildRealPlayerObserverBuckets();
            World.players.forEach((player) => {
                try {
                    if (!World.shouldProcessBotPlayerThisTick(player, cycle)) {
                        return;
                    }
                    player.process();
                    ShopManager.processPlayer(player);
                    if (player.isPlayerBot?.() !== true) {
                        PluginManager.emitPlayerProcess({ player });
                    }
                } catch (e) {
                    console.error(e);
                    player.requestLogout();
                }
            });
        });

        timed("process_npcs", () => {
            World.npcs.forEach((npc) => {
                try {
                    World.activeNpcsForUpdate.push(npc);
                    if (!World.shouldProcessNpc(npc)) {
                        return;
                    }
                    npc.process();
                } catch (e) {
                    console.error(e);
                }
            });
        });

        timed("combat_hits", () => {
            HitQueue.processAll(World.processCycle);
        });

        timed("rebuild_update_buckets", () => {
            World.rebuildUpdateBuckets();
        });

        timed("update_players_npcs", () => {
            World.forEachNetworkPlayer((player) => {
                try {
                    const nearbyNpcs = World.getNearbyNpcsForUpdate(player);
                    PlayerUpdating.update(player);
                    NPCUpdating.update(player, nearbyNpcs);
                } catch (e) {
                    console.error("[World] Player/NPC updating failure", e);
                    player.requestLogout();
                }
            });
        });

        timed("flush_players", () => {
            World.players.forEach((player) => {
                try {
                    if (World.shouldRunNetworkUpdates(player)) {
                        player.getSession().flush(World.processCycle);
                    }
                    player.resetUpdating();
                    player.setCachedUpdateBlock(null);
                } catch (e) {
                    console.log(e);
                    player.requestLogout();
                }
            });
        });

        timed("reset_npcs", () => {
            World.npcs.forEach((npc) => {
                try {
                    npc.resetUpdating();
                } catch (e) {
                    console.log(e);
                }
            });
        });
    }

}
