
import { Server } from '../Server';
import { MinigameHandler } from './content/minigames/MinigameHandler';
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
import { Players } from './model/commands/impl/Players';
import { TaskManager } from './task/TaskManager';
import { GameConstants } from '../game/GameConstants'
import { Misc } from '../util/Misc';
import { List } from 'list'
import { TreeMap } from 'treemap'
import { Task } from './task/Task';
import { GameSyncTask } from './entity/updating/sync/GameSyncTask';

interface GameSyncTaskInterface {
    isParallel: boolean;
    isPlayerTask: boolean;
    execute(index: number): void;
}

export class World {
    private static readonly MAX_PLAYERS = 500;
    private static players: MobileList<Player> = new MobileList<Player>(World.MAX_PLAYERS);
    // TODO: Wire player bot storage back in when bot support is restored.
    private static playerBots: Map<string, any> = new Map<string, any>();
    private static npcs: MobileList<NPC> = new MobileList<NPC>(5000);
    private static items: ItemOnGround[] = [];
    private static playerArray: Player[] = []

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
        this.players.forEach(player => GameConstants.PLAYER_PERSISTENCE.save(player));
    }

    public static getPlayers(): MobileList<Player> {
        return this.players;
    }

    public static getNpcs(): MobileList<NPC> {
        return this.npcs;
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
        // Process all active {@link Task}s..
        TaskManager.process();

        // Process all minigames
        MinigameHandler.process();

        // Process all ground items..
        ItemOnGroundManager.process();

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
            World.npcs.add(npc);
        }

        // Removing pending npcs..
        for (let i = 0; i < GameConstants.QUEUED_LOOP_THRESHOLD; i++) {
            let npc = World.removeNPCQueue.shift();
            if (!npc)
                break;
            World.npcs.remove(npc);
        }

        // Sequential processing to avoid null-slot crashes during bring-up.
        World.players.forEach((player) => {
            try {
                player.process();
            } catch (e) {
                console.error(e);
                player.requestLogout();
            }
        });

        World.npcs.forEach((npc) => {
            try {
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
