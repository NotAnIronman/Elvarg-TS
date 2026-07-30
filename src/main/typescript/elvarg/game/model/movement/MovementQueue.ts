import { RegionManager } from "../../collision/RegionManager";
import type { Mobile } from "../../entity/impl/Mobile";
import { World } from "../../World";
import { Dueling, DuelRule } from "../../content/Duelling";
import { CombatFactory } from "../../content/combat/CombatFactory";
import { ObjectDefinition } from "../../definition/ObjectDefinition";
import type { NPC } from "../../entity/impl/npc/NPC";
import { GameObject } from "../../entity/impl/object/GameObject";
import type { Player } from "../../entity/impl/player/Player";
import { Direction, Directions } from "../Direction";
import { Location } from "../Location";
import { Skill } from "../Skill";
import { PathFinder } from "./path/PathFinder";
import { PlayerRights } from "../rights/PlayerRights";
import { Task } from "../../task/Task";
import { TaskManager } from "../../task/TaskManager";
import { CombatType } from "../../content/combat/CombatType";
import { Misc } from "../../../util/Misc";
import { NpcIdentifiers } from "../../../util/NpcIdentifiers";
import { RandomGen } from "../../../util/RandomGen";
import { TimerKey } from "../../../util/timers/TimerKey";
import { Action } from "../Action";
import { GameConstants } from "../../GameConstants";
import { FastDeque } from "../../../util/FastDeque";
import { ServerPerf } from "../../../util/ServerPerf";
import { Wilderness } from "../../content/wilderness/Wilderness";
import * as fs from "fs";
import * as path from "path";
export class MovementQueue {
    private static readonly BOT_FOLLOW_REPATH_COOLDOWN_MS = 500;
    private static readonly BOT_COMBAT_FOLLOW_REPATH_COOLDOWN_MS = 350;

    private static RANDOM: RandomGen = new RandomGen();
    private static LOG_DIR = path.join(process.cwd(), "logs");
    private static LOG_FILE = path.join(MovementQueue.LOG_DIR, "movement.log");
    private static LOG_READY = true;
    private static LOG_ENABLED = false;

    private static log(line: string) {
        if (!MovementQueue.LOG_ENABLED) {
            return;
        }

        const msg = `${new Date().toISOString()} ${line}`;
        console.log(msg);
        try {
            if (!MovementQueue.LOG_READY) {
                fs.mkdirSync(MovementQueue.LOG_DIR, { recursive: true });
                MovementQueue.LOG_READY = true;
            }
            fs.appendFileSync(MovementQueue.LOG_FILE, msg + "\n", { encoding: "utf8" });
        } catch (e) {
            // Ignore file logging errors to avoid cascading issues.
        }
    }

    /**
     * NPC interactions can begin when the player is within this radius of the NPC.
     */
    public static NPC_INTERACT_RADIUS: number = 2;

    /**
     * An enum to represent a Player's Mobility
     */

    /**
         * The maximum size of the queue. If any additional steps are added, they are
         * discarded.
         */
    private static MAXIMUM_SIZE = 100;

    /**
     * The character whose walking queue this is.
     */
    private character: Mobile;

    /**
     * The player who owns this MovementQueue (if if applicable)
     */
    private player: Player;

    /**
     * The queue of directions.
     */
    private points: FastDeque<Point> = new FastDeque<Point>();

    /**
     * Whether movement is currently blocked for this Mobile.
     */
    private blockMovement = false;

    /**
     * Are we currently moving?
     */
    private isMoving = false;

    /**
     * Creates a walking queue for the specified character.
     *
     * @param character The character.
     */
    constructor(character: Mobile) {
        this.character = character;

        if (this.character.isPlayer()) {
            this.player = this.character.getAsPlayer();
        }
    }

    /**
         * Checks if we can walk from one position to another.
         *
         * @param deltaX
         * @param deltaY
         * @return
         */
    public canWalk(deltaX: number, deltaY: number): boolean {
        if (!this.getMobility().canMove()) {
            return false;
        }
        if (this.character.getLocation().getZ() == -1) {
            return true;
        }
        return RegionManager.canMovestart(this.character.getLocation(), this.character.getLocation().transform(deltaX, deltaY), this.character.getSize(), this.character.getSize(), this.character.getPrivateArea());
    }

    /**
         * Steps away from a Gamecharacter
         *
         * @param character The gamecharacter to step away from
         */
    public static clippedStep(character: Mobile) {
        let size = character.getSize();
        if (character.getMovementQueue().canWalk(-size, 0))
            character.getMovementQueue().walkStep(-size, 0);
        else if (character.getMovementQueue().canWalk(size, 0))
            character.getMovementQueue().walkStep(size, 0);
        else if (character.getMovementQueue().canWalk(0, -size))
            character.getMovementQueue().walkStep(0, -size);
        else if (character.getMovementQueue().canWalk(0, size))
            character.getMovementQueue().walkStep(0, size);
    }

    public static randomClippedStep(character: Mobile, size: number) {
        let rng = this.RANDOM.getInclusive(1, 4);
        if (rng == 1 && character.getMovementQueue().canWalk(-size, 0))
            character.getMovementQueue().walkStep(-size, 0);
        else if (rng == 2 && character.getMovementQueue().canWalk(size, 0))
            character.getMovementQueue().walkStep(size, 0);
        else if (rng == 3 && character.getMovementQueue().canWalk(0, -size))
            character.getMovementQueue().walkStep(0, -size);
        else if (rng == 4 && character.getMovementQueue().canWalk(0, size))
            character.getMovementQueue().walkStep(0, size);
    }

    public static randomClippedStepNotSouth(character: Mobile, size: number) {
        let rng = this.RANDOM.getInclusive(1, 3);
        if (rng == 1 && character.getMovementQueue().canWalk(-size, 0))
            character.getMovementQueue().walkStep(-size, 0);
        else if (rng == 2 && character.getMovementQueue().canWalk(size, 0))
            character.getMovementQueue().walkStep(size, 0);
        else if (rng == 3 && character.getMovementQueue().canWalk(0, size))
            character.getMovementQueue().walkStep(0, size);
    }

    /**
         * Adds the first step to the queue, attempting to connect the server and client
         * position by looking at the previous queue.
         *
         * @param clientConnectionPosition The first step.
         * @return {@code true} if the queues could be connected correctly,
         * {@code false} if not.
         */
    public addFirstStep(clientConnectionPosition: Location): boolean {
        this.reset();
        this.addSteps(clientConnectionPosition);
        return true;
    }

    /**
         * Adds a step to walk to the queue.
         *
         * @param x       X to walk to
         * @param y       Y to walk to
         */
    public walkStep(x: number, y: number) {
        let position = this.character.getLocation().clone();
        position.setX(position.getX() + x);
        position.setY(position.getY() + y);
        this.addSteps(position);
    }

    /**
         * Adds a step to this MovementQueue.
         *
         * @param x           The x coordinate of this step.
         * @param y           The y coordinate of this step.
         * @param heightLevel
         */
    private addStep(x: number, y: number, heightLevel: number) {
        if (!this.getMobility().canMove()) {
            return;
        }

        if (this.points.length >= MovementQueue.MAXIMUM_SIZE)
            return;

        const last = this.getLast();
        const deltaX = x - last.position.getX();
        const deltaY = y - last.position.getY();
        const direction = Direction.fromDeltas(deltaX, deltaY);
        if (direction != Direction.NONE) {
            const z = heightLevel ?? this.character.getLocation().getZ() ?? 0;
            this.points.push(new Point(new Location(x, y, z), direction));
        }
        MovementQueue.log(`[movement.addStep] ${this.ownerLabel()} step=${x},${y},${heightLevel} dir=${direction} queueSize=${this.points.length}`);
    }

    /**
         * Adds a step to the queue.
         *
         * @param step The step to add.
         */
    public addSteps(step: Location) {
        if (!this.getMobility().canMove()) {
            return;
        }

        const last = this.getLast();
        const x = step.getX();
        const y = step.getY();
        const z = step.getZ() ?? this.character.getLocation().getZ() ?? 0;
        let deltaX = x - last.position.getX();
        let deltaY = y - last.position.getY();
        const max = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        for (let i = 0; i < max; i++) {
            if (deltaX < 0)
                deltaX++;
            else if (deltaX > 0)
                deltaX--;
            if (deltaY < 0)
                deltaY++;
            else if (deltaY > 0)
                deltaY--;
            this.addStep(x - deltaX, y - deltaY, z);
        }
    }

    /**
         * Determines the Player's Mobility status
         *
         * @return {Mobility} mobility
         */
    public getMobility(): Mobility {
        if (this.character.getTimers().has(TimerKey.FREEZE)) {
            return Mobility.FROZEN_SPELL;
        }

        if (this.character.getTimers().has(TimerKey.STUN)) {
            return Mobility.STUNNED;
        }

        if (this.character.isNeedsPlacement() || this.isMovementBlocked()) {
            return Mobility.INVALID;
        }

        if (this.player != null) {
            // Player related checks

            let playerDueling = this.player.getDueling();
            if (!this.player.getTrading().getButtonDelay().finished() || !playerDueling.getButtonDelay().finished()) {
                return Mobility.BUSY;
            }

            if (playerDueling.inDuel() && playerDueling.getRules()[DuelRule.NO_MOVEMENT.getButtonId()]) {
                return Mobility.DUEL_MOVEMENT_DISABLED;
            }
        }

        return Mobility.MOBILE;
    }

    /**
         * Validates a destination for a given player movement.
         *
         * @param destination The intended/potential destination.
         * @return {boolean} destinationValid
         */
    public checkDestination(destination: Location): boolean {
        if (destination.getZ() < 0) {
            return false;
        }

        if (this.character.getLocation().getZ() !== destination.getZ()) {
            return false;
        }

        if (destination.getX() > 32767 || destination.getX() < 0 || destination.getY() > 32767 || destination.getY() < 0) {
            return false;
        }

        return true;
    }

    private getLast(): Point {
        let last = this.points.peekLast();
        if (!last)
            return new Point(this.character.getLocation(), Direction.NONE);
        return last;
    }

    public followX = -1;
    public followY = -1;

    /**
     * @return true if the character is moving.
     */
    public isMovings(): boolean {
        return this.isMoving;
    }

    public hasPendingWork(): boolean {
        if (this.points.length > 0 || this.isMoving) {
            return true;
        }
        if (this.character.getCombatFollowing() != null) {
            return true;
        }
        if (this.character.getFollowing() != null) {
            return true;
        }
        return false;
    }

    public process() {
        const ownerLabel = this.ownerLabel();
        if (
            this.points.length === 0 &&
            !this.isMoving &&
            this.character.getCombatFollowing() == null &&
            this.character.getFollowing() == null
        ) {
            return;
        }

        if (!this.getMobility().canMove()) {
            if (this.points.length > 0) {
                MovementQueue.log(`[movement.process] ${ownerLabel} blocked; clearing ${this.points.length} queued steps`);
            }
            this.reset();
            return;
        }

        if (this.character.getCombatFollowing() != null) {
            ServerPerf.measurePhase(
                "movement.process.combat_follow",
                () => this.processCombatFollowing()
            );
        } else if (this.character.getFollowing() != null) {
            ServerPerf.measurePhase(
                "movement.process.follow",
                () => this.processFollowing()
            );
        }

        if (this.points.length > 0) {
            MovementQueue.log(`[movement.process] ${ownerLabel} processing ${this.points.length} steps; run=${this.isRunToggled()}`);
        }

        let walkPoint: Point = null;
        let runPoint: Point = null;

        walkPoint = ServerPerf.measurePhase(
            "movement.process.dequeue",
            () => this.points.shift()
        );

        if (this.isRunToggled()) {
            runPoint = this.points.shift();
        }

        let oldPosition: Location = this.character.getLocation();
        let moved: boolean = false;

        if (walkPoint != null && walkPoint.direction != Direction.NONE) {
            let next: Location = walkPoint.position;
            if (ServerPerf.measurePhase("movement.process.walk_check", () => this.canWalkTo(next))) {
                const previousLocation = this.character.getLocation();
                this.followX = oldPosition.getX();
                this.followY = oldPosition.getY();
                this.character.setLocation(next);
                if (this.character.isNpc()) {
                    World.onNpcMoved(this.character as NPC, previousLocation, next);
                }
                this.character.setWalkingDirection(walkPoint.direction);
                moved = true;
            } else {
                MovementQueue.log(`[movement.process] ${ownerLabel} blocked walking to ${next.toString()} (reset queue of ${this.points.length})`);
                this.reset();
                return;
            }
        }

        if (runPoint != null && runPoint.direction != Direction.NONE) {
            let next: Location = runPoint.position;
            if (ServerPerf.measurePhase("movement.process.run_check", () => this.canWalkTo(next))) {
                const previousLocation = this.character.getLocation();
                this.followX = oldPosition.getX();
                this.followY = oldPosition.getY();
                oldPosition = next;
                this.character.setLocation(next);
                if (this.character.isNpc()) {
                    World.onNpcMoved(this.character as NPC, previousLocation, next);
                }
                this.character.setRunningDirection(runPoint.direction);
                moved = true;
            } else {
                MovementQueue.log(`[movement.process] ${ownerLabel} blocked running to ${next.toString()} (reset queue of ${this.points.length})`);
                this.reset();
                return;
            }
        }

        if (this.character.isPlayer()) {
            if (moved) {
                this.handleRegionChange();
                this.syncWildernessStateForMovedPlayer();
                this.drainRunEnergy();
                this.character.getAsPlayer().setOldPosition(oldPosition);
            }
        }

        this.isMoving = moved;

        if (!moved && this.points.length > 0) {
            MovementQueue.log(`[movement.process] ${ownerLabel} did not move; remaining steps ${this.points.length} (walk=${walkPoint?.direction} run=${runPoint?.direction})`);
        }
    }

    private ownerLabel(): string {
        return this.character.isPlayer()
            ? `player:${this.character.getAsPlayer().getUsername()}`
            : `npc:${(this.character as any).getId ? (this.character as any).getId() : "unknown"}`;
    }

    public canWalkTo(next: Location) {
        if (this.character.isNpc() && !(this.character as NPC).canWalkThroughNPCs()) {
            if (World.isNpcOccupyingTile(next, this.character as NPC)) {
                return false;
            }
        }
        return true;
    }


    public handleRegionChange() {
        const player = (this.character as Player);
        // Make sure lastKnownRegion is always populated to avoid null access during early ticks.
        if (!this.character.getLastKnownRegion()) {
            this.character.setLastKnownRegion(this.character.getLocation().clone());
        }
        const diffX = this.character.getLocation().getX() - this.character.getLastKnownRegion().getRegionX() * 8;
        const diffY = this.character.getLocation().getY() - this.character.getLastKnownRegion().getRegionY() * 8;
        let regionChanged = false;
        if (diffX < 16)
            regionChanged = true;
        else if (diffX >= 88)
            regionChanged = true;
        if (diffY < 16)
            regionChanged = true;
        else if (diffY >= 88)
            regionChanged = true;
        if (regionChanged || player.getRegionHeight() != player.getLocation().getZ()) {
            player.getPacketSender().sendMapRegion();
            player.setRegionHeight(player.getLocation().getZ());
            this.character.setLastKnownRegion(player.getLocation().clone());
        }
    }

    private drainRunEnergy() {
        const player = (this.character as Player);
        if (player.isPlayerBot?.() === true) {
            if (player.getRunEnergy() !== 100) {
                player.setRunEnergy(100);
            }
            return;
        }
        if (player.isRunningReturn()) {
            player.setRunEnergy(player.getRunEnergy() - 1);
            if (player.getRunEnergy() <= 0) {
                player.setRunEnergy(0);
                player.setRunning(false);
                player.getPacketSender().sendRunStatus();
            }
            player.getPacketSender().sendRunEnergy();
        }
    }

    private syncWildernessStateForMovedPlayer() {
        const player = this.character as Player;
        if (player.isPlayerBot?.() === true) {
            return;
        }

        const location = player.getLocation();
        const packetSender = player.getPacketSender();
        const inWilderness = Wilderness.isInLocation(location);

        if (inWilderness) {
            const wildernessLevel = Wilderness.levelForY(location.getY());
            const multiIcon = Wilderness.isMulti(location.getX(), location.getY()) ? 1 : 0;
            player.setWildernessLevel(wildernessLevel);
            player.setMultiIcon(multiIcon);
            packetSender.sendInteractionOption("Attack", 2, true);
            packetSender.sendConfiguredInterface("wilderness-overlay");
            packetSender.sendString(`Level ${wildernessLevel}`, 199);
            return;
        }

        player.setWildernessLevel(0);
        player.setMultiIcon(0);
        packetSender.sendWalkableInterface(-1);
        packetSender.sendInteractionOption("null", 2, true);
    }

    public static runEnergyRestoreDelay(p: Player) {
        return 1700 - (p.getSkillManager().getCurrentLevel(Skill.AGILITY) * 10);
    }

    public reset(): MovementQueue {
        this.points.clear();
        this.followX = -1;
        this.followY = -1;
        this.isMoving = false;
        this.foundRoute = false;
        return this;
    }

    public resetFollow() {
        this.character.setCombatFollowing(null);
        this.character.setFollowing(null);
        this.character.setPositionToFace(null);
    }

    public processCombatFollowing() {
        const following = this.character.getCombatFollowing();
        if (!following) {
            return;
        }
        if (
            !following.isRegistered() ||
            following.getHitpoints() <= 0 ||
            (following.isPlayer?.() && following.getAsPlayer()?.isDyingReturn?.() === true) ||
            (following.isNpc?.() && following.getAsNpc?.()?.isDyingFunction?.() === true)
        ) {
            this.character.getCombat().reset();
            this.character.setCombatFollowing(null);
            this.character.setFollowing(null);
            this.character.setMobileInteraction(null);
            this.character.setPositionToFace(null);
            this.reset();
            return;
        }
        const isBot = this.isBotPlayer();
        const nowMs = Date.now();
        const size = this.character.getSize();
        const followingSize = following.getSize();

        // Update interaction
        this.character.setMobileInteraction(following);

        // Normal players keep the legacy reset behavior. Bots are allowed to
        // retain an in-flight route briefly so they do not rebuild it every tick.
        if (!isBot) {
            this.reset();
        }

        // Block if our movement is locked.
        if (!this.getMobility().canMove()) {
            return;
        }
        if (
            this.character.getTimers().has(TimerKey.STEPPING_OUT) &&
            this.size() > 0
        ) {
            // Let an already-queued sidestep complete before combat-follow
            // immediately rebuilds a route onto the same target tile.
            return;
        }

        let combatFollow = this.character.getCombat().getTarget() === following;

        // Cheap hard reset checks first; avoid combat-method resolution and
        // reach checks when the target is obviously out of follow scope.
        if (!this.character.getLocation().isViewableFrom(following.getLocation()) || !following.isRegistered() || following.getPrivateArea() != this.character.getPrivateArea()) {

            let reset = true;

            // Handle pets, they should teleport to their owner
            // when they're too far away.
            if (this.character.isNpc()) {
                const npc = this.character.getAsNpc();
                if (npc.isPet()) {
                    const tiles = new Array<Location>();
                    for (const tile of following.outterTiles()) {
                        if (RegionManager.blocked(tile, following.getPrivateArea())) {
                            continue;
                        }
                        tiles.push(tile);
                    }
                    if (tiles.length !== 0) {
                        npc.setVisible(false);
                        npc.moveTo(tiles[Misc.getRandom(tiles.length - 1)]);
                        npc.setVisible(true);
                        npc.setArea(following.getArea());
                    } else {
                        // Never leave pets stuck invisible when no adjacent tile is currently valid.
                        npc.setVisible(true);
                    }
                    return;
                }

                switch (npc.getId()) {
                    case NpcIdentifiers.TZTOK_JAD:
                        reset = false;
                        break;
                }
            }

            if (reset) {
                if (this.character.isPlayer() && following.isPlayer()) {
                    this.character.sendMessage(`Unable to find ${following.getAsPlayer().getUsername()}.`);
                    if (this.character.getAsPlayer().getRights() === PlayerRights.DEVELOPER) {
                        const p = Misc.delta(this.character.getLocation(), following.getLocation());
                        this.character.sendMessage("Delta: " + p.x + ", " + p.y);
                    }
                }
                if (combatFollow) {
                    this.character.getCombat().reset();
                }
                this.character.getMovementQueue().reset();
                this.character.setCombatFollowing(null);
                this.character.setMobileInteraction(null);
                return;
            }
        }

        let method = null;

        let closeEnoughToNeedReachCheck = true;
        if (combatFollow) {
            method = ServerPerf.measurePhase(
                "movement.process.combat_follow.get_method",
                () => this.character.getCombat().resolveMethodForCurrentCycle()
            );
            let requiredDistance = method.attackDistance(this.character);
            const currentDistance = this.character.calculateDistance(following);
            if (
                method.type() == CombatType.MELEE &&
                (following.getMovementQueue().isMovings() || this.character.getMovementQueue().isMovings())
            ) {
                requiredDistance++;
            }
            closeEnoughToNeedReachCheck = currentDistance <= requiredDistance;
        }

        if (
            combatFollow &&
            closeEnoughToNeedReachCheck &&
            ServerPerf.measurePhase(
                "movement.process.combat_follow.can_reach",
                () => this.canStopCombatFollowing(method, following)
            )
        ) {
            // Don't continue finding a path if we can reach our opponent
            this.reset();
            return;
        }

        let dancing = (!combatFollow && this.character.isPlayer() && following.isPlayer() && following.getCombatFollowing() == this.character);
        let basicPathing = (combatFollow && this.character.isNpc() && !((this.character as NPC).canUsePathFinding()));
        let current = this.character.getLocation();
        let destination = following.getLocation();

        if (dancing) {
            destination = following.getAsPlayer().getOldPosition();
        }

        if (!dancing) {
            if (!combatFollow && this.character.calculateDistance(following) == 1 && !PathFinder.isDiagonalTiles(current, destination)) {
                return;
            }

            // Handle simple walking to the destination for NPCs which don't use pathfinding.
            if (basicPathing) {

                // Same spot, step away.
                if (destination.equals(current) && !following.getMovementQueue().isMovings()
                    && this.character.getSize() == 1 && following.getSize() == 1) {
                    let tiles = new Array<Location>();
                    for (let tile of following.outterTiles()) {
                        if (!RegionManager.canMovestart(this.character.getLocation(), tile, size, size, this.character.getPrivateArea())
                            || RegionManager.blocked(tile, this.character.getPrivateArea())) {
                            continue;
                        }
                        // Projectile attack
                        if (this.character.useProjectileClipping() && !RegionManager.canProjectileAttackReturn(tile, following.getLocation(), this.character.getSize(), this.character.getPrivateArea())) {
                            continue;
                        }
                        tiles.push(tile);
                    }
                    if (tiles.length > 0) {
                        this.addFirstStep(tiles[Misc.getRandom(tiles.length - 1)]);
                    }
                    return;
                }

                let deltaX = destination.getX() - current.getX();
                let deltaY = destination.getY() - current.getY();
                if (deltaX < -1) {
                    deltaX = -1;
                } else if (deltaX > 1) {
                    deltaX = 1;
                }
                if (deltaY < -1) {
                    deltaY = -1;
                } else if (deltaY > 1) {
                    deltaY = 1;
                }
                let direction: Direction = Direction.fromDeltas(deltaX, deltaY);

                switch (direction) {
                    case Direction.NORTH_WEST:
                        if (RegionManager.canMoveposition(current, Direction.WEST, size, this.character.getPrivateArea())) {
                            direction = Direction.WEST;
                        } else if (RegionManager.canMoveposition(current, Direction.NORTH, size, this.character.getPrivateArea())) {
                            direction = Direction.NORTH;
                        } else {
                            direction = Direction.NONE;
                        }
                        break;
                    case Direction.NORTH_EAST:
                        if (RegionManager.canMoveposition(current, Direction.NORTH, size, this.character.getPrivateArea())) {
                            direction = Direction.NORTH;
                        } else if (RegionManager.canMoveposition(current, Direction.EAST, size, this.character.getPrivateArea())) {
                            direction = Direction.EAST;
                        } else {
                            direction = Direction.NONE;
                        }
                        break;
                    case Direction.SOUTH_WEST:
                        if (RegionManager.canMoveposition(current, Direction.WEST, size, this.character.getPrivateArea())) {
                            direction = Direction.WEST;
                        } else if (RegionManager.canMoveposition(current, Direction.SOUTH, size, this.character.getPrivateArea())) {
                            direction = Direction.SOUTH;
                        } else {
                            direction = Direction.NONE;
                        }
                        break;
                    case Direction.SOUTH_EAST:
                        if (RegionManager.canMoveposition(current, Direction.EAST, size, this.character.getPrivateArea())) {
                            direction = Direction.EAST;
                        } else if (RegionManager.canMoveposition(current, Direction.SOUTH, size, this.character.getPrivateArea())) {
                            direction = Direction.SOUTH;
                        } else {
                            direction = Direction.NONE;
                        }
                        break;
                    default:
                        break;
                }

                if (direction == Direction.NONE) {
                    return;
                }

                let next = current.transform(direction.getX(), direction.getY());
                if (RegionManager.canMovestart(current, next, size, size, this.character.getPrivateArea())) {
                    this.addSteps(next);
                }
                return;
            }
            if (method == null) {
                method = ServerPerf.measurePhase(
                    "movement.process.combat_follow.get_method",
                    () => this.character.getCombat().resolveMethodForCurrentCycle()
                );
            }
            const attackDistance = method.attackDistance(this.character);

            if (this.shouldContinueCachedBotAttackRoute(following, attackDistance, nowMs)) {
                return;
            }

            // Find the nearest tile surrounding the target
            destination = ServerPerf.measurePhase(
                "movement.process.combat_follow.attack_tile",
                () => this.getCachedBotAttackTile(following, attackDistance, nowMs)
            );
            if (destination == null) {
                destination = ServerPerf.measurePhase(
                    "movement.process.combat_follow.closest_attack_tile",
                    () => PathFinder.getClosestAttackableTile(this.character, following, attackDistance)
                );
                this.cacheBotAttackTile(following, attackDistance, destination, nowMs);
            }
            if (destination == null) {
                if (this.character.isPlayer()) {
                    this.character.getAsPlayer().sendMessage("I can't reach that!");
                    this.character.getAsPlayer().getCombat().reset();
                }
                this.reset();
                return;
            }
        }

        if (ServerPerf.measurePhase(
            "movement.process.combat_follow.repath_gate",
            () => this.shouldThrottleBotRepath(destination, nowMs, true)
        )) {
            return;
        }
        const destinationChanged =
            this.lastDestX !== destination.getX() || this.lastDestY !== destination.getY();
        if (!isBot || destinationChanged) {
            this.reset();
        }
        this.markBotRepathScheduled(destination, nowMs, true);
        ServerPerf.measurePhase("movement.process.combat_follow.route", () =>
            PathFinder.calculateWalkRoute(this.character, destination.getX(), destination.getY())
        );
    }

    private canStopCombatFollowing(method: any, following: Mobile): boolean {
        if (!this.character.isPlayer()) {
            return this.character.getCombat().resolveCanReachForCurrentCycle(method, following);
        }

        const current = this.character.getLocation();
        const target = following.getLocation();
        if (!current || !target) {
            return false;
        }
        if (current.equals(target)) {
            return false;
        }

        let requiredDistance = method.attackDistance(this.character);
        const distance = this.character.calculateDistance(following);
        if (
            method.type() == CombatType.MELEE &&
            (following.getMovementQueue().isMovings() || this.character.getMovementQueue().isMovings())
        ) {
            requiredDistance++;
        }
        if (distance > requiredDistance) {
            return false;
        }

        if (
            method.type() == CombatType.MELEE &&
            this.character.getSize() == 1 &&
            following.getSize() == 1 &&
            !this.character.getMovementQueue().isMovings() &&
            !following.getMovementQueue().isMovings() &&
            PathFinder.isDiagonalLocation(this.character, following)
        ) {
            return false;
        }

        if (
            this.character.useProjectileClipping() &&
            !RegionManager.canProjectileAttackReturn(
                current,
                target,
                this.character.getSize(),
                this.character.getPrivateArea()
            )
        ) {
            return false;
        }

        return true;
    }

    public processFollowing() {
        const following = this.character.getFollowing();
        if (!following) {
            return;
        }
        const nowMs = Date.now();

        if (
            following === this.character ||
            !following.isRegistered() ||
            following.getHitpoints() <= 0 ||
            (following.isPlayer?.() && following.getAsPlayer()?.isDyingReturn?.() === true) ||
            (following.isNpc?.() && following.getAsNpc?.()?.isDyingFunction?.() === true)
        ) {
            this.character.setFollowing(null);
            this.character.setMobileInteraction(null);
            this.character.setPositionToFace(null);
            this.character.setCombatFollowing(null);
            this.reset();
            return;
        }

        if (following.getPrivateArea() != this.character.getPrivateArea()) {
            if (this.tryTeleportPetToFollower(following)) {
                return;
            }
            this.character.setFollowing(null);
            this.character.setMobileInteraction(null);
            this.character.setPositionToFace(null);
            this.reset();
            return;
        }

        // Keep parity with Java follow task behavior for generic following.
        // For pets, OSRS-like behavior is to snap back to the owner when they
        // get too far away.
        const tooFarAway = !following
            .getLocation()
            .isWithinDistance(this.character.getLocation(), GameConstants.PET_FOLLOW_AUTO_TELEPORT_DISTANCE);
        if (tooFarAway && this.tryTeleportPetToFollower(following)) {
            return;
        }

        // Keep parity with Java follow task behavior.
        if (
            following.isTeleportingReturn() ||
            tooFarAway
        ) {
            if (this.tryTeleportPetToFollower(following)) {
                return;
            }
            if (this.character.isPlayer() && following.isPlayer()) {
                this.character.sendMessage(`Unable to find ${following.getAsPlayer().getUsername()}.`);
            }
            this.character.setFollowing(null);
            this.character.setMobileInteraction(null);
            this.character.setPositionToFace(null);
            this.reset();
            return;
        }

        this.character.setMobileInteraction(following);
        this.character.setPositionToFace(following.getLocation());
        if (!this.getMobility().canMove()) {
            return;
        }

        const followerDistance = this.character.calculateDistance(following);
        const leaderQueue = following.getMovementQueue();
        const leaderMoving = leaderQueue.isMovings();
        const destX = leaderQueue.followX;
        const destY = leaderQueue.followY;

        // When not overlapping and already adjacent to a stationary leader,
        // do not re-route; this avoids jittering too close/too far while idle.
        if (followerDistance <= 1 && !leaderMoving && followerDistance !== 0) {
            return;
        }

        let destination: Location | null = null;
        if (destX !== -1 && destY !== -1) {
            destination = new Location(destX, destY, this.character.getLocation().getZ());
        }

        if (
            destination == null ||
            destination.equals(this.character.getLocation()) ||
            followerDistance > 1
        ) {
            destination = this.getClosestFollowTile(following) ?? destination;
        }

        if (
            destination == null ||
            destination.equals(this.character.getLocation())
        ) {
            return;
        }

        // Avoid resetting and rebuilding identical routes each tick for bots.
        if (this.shouldThrottleBotRepath(destination, nowMs, false)) {
            return;
        }

        this.reset();
        this.markBotRepathScheduled(destination, nowMs, false);
        PathFinder.calculateWalkRoute(this.character, destination.getX(), destination.getY());
    }

    private getClosestFollowTile(leader: Mobile): Location | null {
        const privateArea = this.character.getPrivateArea();
        const current = this.character.getLocation();
        let bestTile: Location | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const tile of leader.outterTiles()) {
            if (RegionManager.blocked(tile, privateArea)) {
                continue;
            }
            const distance = tile.getDistance(current);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestTile = tile;
            }
        }

        return bestTile;
    }

    private tryTeleportPetToFollower(following: Mobile): boolean {
        if (!this.character.isNpc()) {
            return false;
        }

        const npc = this.character.getAsNpc();
        if (!npc.isPet()) {
            return false;
        }

        const tiles: Location[] = [];
        for (const tile of following.outterTiles()) {
            if (RegionManager.blocked(tile, following.getPrivateArea())) {
                continue;
            }
            tiles.push(tile);
        }

        const destination =
            tiles.length > 0
                ? tiles[Misc.getRandom(tiles.length - 1)]
                : following.getLocation().clone();

        npc.setVisible(false);
        npc.moveTo(destination);
        npc.setVisible(true);
        npc.setArea(following.getArea());
        npc.setPositionToFace(following.getLocation());
        npc.setMobileInteraction(following);
        return true;
    }

    // Gets the size of the queue.
    public size(): number {
        return this.points.length;
    }

    public isRunToggled(): boolean {
        return this.character.isPlayer() && (this.character as Player).isRunningReturn();
    }

    public setBlockMovement(blockMovement: boolean): MovementQueue {
        this.blockMovement = blockMovement;
        return this;
    }

    public isMovementBlocked(): boolean {
        return this.blockMovement;
    }

    public lastDestX: number;
    public lastDestY: number;
    public pathX: number;
    public pathY: number;
    private nextBotFollowRepathAt = 0;
    private nextBotCombatFollowRepathAt = 0;
    private cachedBotAttackTileExpiresAt = 0;
    private cachedBotAttackTileTargetX = Number.MIN_SAFE_INTEGER;
    private cachedBotAttackTileTargetY = Number.MIN_SAFE_INTEGER;
    private cachedBotAttackTileTargetZ = Number.MIN_SAFE_INTEGER;
    private cachedBotAttackTileDistance = -1;
    private cachedBotAttackTileX = Number.MIN_SAFE_INTEGER;
    private cachedBotAttackTileY = Number.MIN_SAFE_INTEGER;
    private cachedBotAttackTileZ = Number.MIN_SAFE_INTEGER;

    public setPathX(x: number): MovementQueue {
        this.pathX = (this.character.getLocation().getRegionX() * 8) + x;
        return this;
    }

    public setPathY(y: number): MovementQueue {
        this.pathY = (this.character.getLocation().getRegionY() * 8) + y;
        return this;
    }

    private foundRoute: boolean;

    public setRoute(route: boolean) {
        this.foundRoute = route;
    }

    public hasRoute(): boolean {
        return this.foundRoute;
    }

    public pointsReturn() {
        return this.points.toArray();
    }

    private isBotPlayer(): boolean {
        return this.character.isPlayer() && this.character.getAsPlayer().isPlayerBot();
    }

    private shouldThrottleBotRepath(destination: Location, nowMs: number, combatFollow: boolean): boolean {
        if (!this.isBotPlayer() || !destination) {
            return false;
        }
        const cooldownUntil = combatFollow
            ? this.nextBotCombatFollowRepathAt
            : this.nextBotFollowRepathAt;
        if (this.lastDestX !== destination.getX() || this.lastDestY !== destination.getY()) {
            return false;
        }
        if (this.points.length > 0) {
            return true;
        }
        return nowMs < cooldownUntil;
    }

    private markBotRepathScheduled(destination: Location, nowMs: number, combatFollow: boolean): void {
        if (!this.isBotPlayer() || !destination) {
            return;
        }
        this.lastDestX = destination.getX();
        this.lastDestY = destination.getY();
        if (combatFollow) {
            this.nextBotCombatFollowRepathAt =
                nowMs + MovementQueue.BOT_COMBAT_FOLLOW_REPATH_COOLDOWN_MS;
            return;
        }
        this.nextBotFollowRepathAt =
            nowMs + MovementQueue.BOT_FOLLOW_REPATH_COOLDOWN_MS;
    }

    private getCachedBotAttackTile(
        following: Mobile,
        attackDistance: number,
        nowMs: number
    ): Location | null {
        if (!this.isBotPlayer() || !following || nowMs > this.cachedBotAttackTileExpiresAt) {
            return null;
        }
        const target = following.getLocation();
        if (
            this.cachedBotAttackTileTargetX !== target.getX() ||
            this.cachedBotAttackTileTargetY !== target.getY() ||
            this.cachedBotAttackTileTargetZ !== target.getZ() ||
            this.cachedBotAttackTileDistance !== attackDistance
        ) {
            return null;
        }
        return new Location(
            this.cachedBotAttackTileX,
            this.cachedBotAttackTileY,
            this.cachedBotAttackTileZ
        );
    }

    private shouldContinueCachedBotAttackRoute(
        following: Mobile,
        attackDistance: number,
        nowMs: number
    ): boolean {
        if (!this.isBotPlayer() || this.points.length === 0) {
            return false;
        }
        const destination = this.getCachedBotAttackTile(following, attackDistance, nowMs);
        if (!destination) {
            return false;
        }
        return this.lastDestX === destination.getX() && this.lastDestY === destination.getY();
    }

    private cacheBotAttackTile(
        following: Mobile,
        attackDistance: number,
        destination: Location | null,
        nowMs: number
    ): void {
        if (!this.isBotPlayer() || !following || destination == null) {
            return;
        }
        const target = following.getLocation();
        this.cachedBotAttackTileTargetX = target.getX();
        this.cachedBotAttackTileTargetY = target.getY();
        this.cachedBotAttackTileTargetZ = target.getZ();
        this.cachedBotAttackTileDistance = attackDistance;
        this.cachedBotAttackTileX = destination.getX();
        this.cachedBotAttackTileY = destination.getY();
        this.cachedBotAttackTileZ = destination.getZ();
        this.cachedBotAttackTileExpiresAt =
            nowMs + MovementQueue.BOT_COMBAT_FOLLOW_REPATH_COOLDOWN_MS;
    }

    public walkToGroundItem(pos: Location, action: () => void) {
        if (this.player.getLocation().getDistance(pos) == 0) {
            // If player is already at the ground item, run the action now
            action();
            return;
        }

        let mobility = this.getMobility();
        if (!mobility.canMove()) {
            mobility.sendMessage(this.player);
            this.reset();
            return;
        }

        if (!this.checkDestination(pos)) {
            this.reset();
            return;
        }

        let destX = pos.getX();
        let destY = pos.getY();

        this.reset();

        this.walkToReset();

        PathFinder.calculateWalkRoute(this.player, destX, destY);

        let stage = 0;
        TaskManager.submit(new MovementTask(this.player.getIndex(), (task: MovementTask) => {
            if (stage !== 0) {
                this.player.getMovementQueue().reset();
                TaskManager.cancelTasks(this.player);
                this.player.getPacketSender().sendMessage("You can't reach that!");
                task.stop();
                return;
            }

            if (this.player.getMovementQueue().points.length) {
                return;
            }

            const currentLoc = this.player.getLocation();
            if (!this.player.getMovementQueue().hasRoute() || currentLoc.getX() !== destX || currentLoc.getY() !== destY) {
                stage = -1;
                return;
            }

            if (action !== null) {
                action();
            }

            this.player.getMovementQueue().reset();
            task.stop();
        }));
    }

    public walkToReset() {
        if (this.player == null) {
            return;
        }

        TaskManager.cancelTasks(this.player.getIndex());
        this.player.getCombat().setCastSpell(null);
        this.player.getCombat().reset();
        this.player.getSkillManager().stopSkillable();
        this.resetFollow();
    }

    private buildObjectRouteSpec(object: GameObject) {
        const objectX = object.getLocation().getX();
        const objectY = object.getLocation().getY();
        const type = object.getType();
        const id = object.getId();
        const direction = object.getFace();

        if (type === 10 || type === 11 || type === 22) {
            const def = ObjectDefinition.forId(id);
            const xLength = def.getSizeX();
            const yLength = def.getSizeY();
            const blockingMask = def.getBlockingMask();

            return {
                objectX,
                objectY,
                type,
                id,
                direction,
                routeSize: 0,
                routeXLength: xLength,
                routeYLength: yLength,
                routeDirection: direction,
                routeBlockingMask: blockingMask,
                reachWidth: xLength,
                reachLength: yLength,
                reachAngle: direction,
                reachShape: 10,
                reachBlockAccessFlags: blockingMask,
            };
        }

        return {
            objectX,
            objectY,
            type,
            id,
            direction,
            routeSize: type + 1,
            routeXLength: 0,
            routeYLength: 0,
            routeDirection: direction,
            routeBlockingMask: 0,
            reachWidth: 1,
            reachLength: 1,
            reachAngle: direction,
            reachShape: type,
            reachBlockAccessFlags: 0,
        };
    }

    public walkToEntity(entity: Mobile, runnable?: () => void) {
        let mobility = this.getMobility();
        if (!mobility.canMove()) {
            mobility.sendMessage(this.player);
            this.reset();
            return;
        }

        if (!this.checkDestination(entity.getLocation())) {
            this.reset();
            return;
        }

        this.reset();

        this.walkToReset();

        PathFinder.calculateEntityRoute(this.player, entity);

        let currentX = entity.getLocation().getX();
        let currentY = entity.getLocation().getY();
        let reachStage = 0;
        TaskManager.submit(new MovementTask(this.player.getIndex(), (task: MovementTask) => {
            this.player.setMobileInteraction(entity);
            if (currentX != entity.getLocation().getX() || currentY != entity.getLocation().getY()) {
                this.reset();
                currentX = entity.getLocation().getX();
                currentY = entity.getLocation().getY();
                PathFinder.calculateEntityRoute(this.player, entity);
            }

            if (runnable && this.player.getMovementQueue().isWithinEntityInteractionDistance(entity.getLocation())) {
                // Executes the runnable and stops the task. However, It will still path to the destination.
                runnable();
                task.stop();
                return;
            }

            if (reachStage !== 0) {
                if (reachStage === 1) {
                    this.player.getMovementQueue().reset();
                    task.stop();
                    return;
                }
                this.player.getMovementQueue().reset();
                task.stop();
                this.player.getPacketSender().sendMessage("I can't reach that!");
                return;
            }

            if (PathFinder.reachedEntity(this.player, entity)) {
                reachStage = 1;
                return;
            }

            if (this.player.getMovementQueue().points.length) {
                return;
            }

            reachStage = -1;
        }));
    }

    public walkToObject(object: GameObject, action: Action) {
        let mobility = this.getMobility();
        if (!mobility.canMove()) {
            mobility.sendMessage(this.player);
            this.reset();
            return;
        }

        if (!this.checkDestination(object.getLocation())) {
            this.reset();
            return;
        }

        this.reset();

        this.walkToReset();

        const routeSpec = this.buildObjectRouteSpec(object);
        const objectX = routeSpec.objectX;
        const objectY = routeSpec.objectY;
        const type = routeSpec.type;
        const id = routeSpec.id;
        const direction = routeSpec.direction;

        const queueObjectRoute = () => PathFinder.calculateObjectRoute(
            this.player,
            routeSpec.routeSize,
            objectX,
            objectY,
            routeSpec.routeXLength,
            routeSpec.routeYLength,
            routeSpec.routeDirection,
            routeSpec.routeBlockingMask
        );

        queueObjectRoute();

        const finalDestinationX = this.player.getMovementQueue().pathX;
        const finalDestinationY = this.player.getMovementQueue().pathY;
        MovementQueue.log(
            `[walkToObject] ${this.ownerLabel()} obj=${id}@${objectX},${objectY},${this.player.getLocation().getZ()} type=${type} face=${direction} route=${this.player.getMovementQueue().hasRoute()} path=${finalDestinationX},${finalDestinationY} queuedSteps=${this.points.length}`
        );

        //System.err.println("RequestedX=" + objectX + " requestedY=" + objectY + " givenX=" + finalDestinationX + " givenY=" + finalDestinationY);

        let finalObjectY = objectY;

        this.player.setPositionToFace(new Location(objectX, objectY));
        let walkStage = 0;
        let repathAttempts = 0;
        TaskManager.submit(new MovementeTaskFunc(this.player.getIndex(), () => {
            if (walkStage != 0) {

                if (objectX == this.player.getLocation().getX() && finalObjectY == this.player.getLocation().getY()) {
                    if (direction == 0)
                        this.player.setDirection(Direction.WEST);
                    else if (direction === 1) {
                        this.player.setDirection(Direction.NORTH);
                    } else if (direction === 2) {
                        this.player.setDirection(Direction.EAST);
                    } else if (direction === 3) {
                        this.player.setDirection(Direction.SOUTH);
                    }
                }
                this.pathX = this.player.getLocation().getX();
                this.pathY = this.player.getLocation().getY();
                if (walkStage === 1) {
                    if (action !== null) {
                        this.player.setPositionToFace(
                            new Location(
                                objectX,
                                objectY,
                                this.player.getLocation().getZ()
                            )
                        );
                        action.execute();
                    }
                    TaskManager.cancelTasks(this.player.getIndex());
                    return;
                }
                TaskManager.cancelTasks(this.player.getIndex());
                return;
            }
            if (PathFinder.reachedObject(
                this.player,
                objectX,
                objectY,
                routeSpec.reachWidth,
                routeSpec.reachLength,
                routeSpec.reachAngle,
                routeSpec.reachShape,
                routeSpec.reachBlockAccessFlags
            )) {
                walkStage = 1;
                return;
            }
            if (this.points.length || this.player.getMovementQueue().isMovings()) {
                return;
            }

            if (repathAttempts < 2) {
                repathAttempts++;
                queueObjectRoute();
                if (this.points.length || this.player.getMovementQueue().hasRoute()) {
                    MovementQueue.log(
                        `[walkToObject] ${this.ownerLabel()} repath=${repathAttempts} obj=${id}@${objectX},${objectY} current=${this.player.getLocation().getX()},${this.player.getLocation().getY()}`
                    );
                    return;
                }
            }

            walkStage = -1;
            MovementQueue.log(
                `[walkToObject] ${this.ownerLabel()} failed route=${this.player.getMovementQueue().hasRoute()} current=${this.player.getLocation().getX()},${this.player.getLocation().getY()} expected=${finalDestinationX},${finalDestinationY}`
            );
            this.player.getPacketSender().sendMessage("You can't reach that!");
        }));
    }

    private isAtPointOfFocus(destX: number, destY: number): boolean {
        return this.character.getLocation().getX() === destX && this.character.getLocation().getY() === destY;
    }

    public isAtDestination(): boolean {
        return this.points.length === 0;
    }

    public isWithinEntityInteractionDistance(entityLocation: Location): boolean {
        return this.points.length <= MovementQueue.NPC_INTERACT_RADIUS &&
            this.player.getLocation().getDistance(entityLocation) <= MovementQueue.NPC_INTERACT_RADIUS;
    }

    canMove(): boolean {
        return this == Mobility.MOBILE;
    }

    /**
     * Sends the appropriate message to the player about their (lack of) mobility.
     *
     * @param player The player to send the message to.
     */
    sendMessage(player: Player) {
        if (player == null) {
            return;
        }

        let message: string;

        switch (this) {
            case Mobility.FROZEN_SPELL:
                message = "A magical spell has made you unable to move.";
                break;
            case Mobility.STUNNED:
                message = "You're stunned!";
                break;
            case Mobility.BUSY:
                message = "You cannot do that right now.";
                break;
            case Mobility.DUEL_MOVEMENT_DISABLED:
                message = "Movement has been disabled in this duel!";
                break;
            default:
                // No message associated with this Mobility
                return;
        }

        player.getPacketSender().sendMessage(message);
    }
}

class Mobility {
    public static readonly INVALID = new Mobility();
    public static readonly BUSY = new Mobility();
    public static readonly FROZEN_SPELL = new Mobility();
    public static readonly STUNNED = new Mobility();
    public static readonly DUEL_MOVEMENT_DISABLED = new Mobility();
    public static readonly MOBILE = new Mobility();

    /**
     * Determines whether the player is able to move.
     *
     * @return {boolean} canMove
     */

    constructor() { }
    public canMove(): boolean {
        return this === Mobility.MOBILE;
    }

    /**
     * Sends the appropriate message to the player about their (lack of) mobility.
     *
     * @param player The player to send the message to.
     */
    public sendMessage(player: Player): void {
        if (!player) {
            return;
        }

        let message: string;

        switch (this) {
            case Mobility.FROZEN_SPELL:
                message = "A magical spell has made you unable to move.";
                break;
            case Mobility.STUNNED:
                message = "You're stunned!";
                break;
            case Mobility.BUSY:
                message = "You cannot do that right now.";
                break;
            case Mobility.DUEL_MOVEMENT_DISABLED:
                message = "Movement has been disabled in this duel!";
                break;
            default:
                // No message associated with this Mobility
                return;
        }

        player.getPacketSender().sendMessage(message);
    }
}


class Point {
    position: Location;
    direction: Direction;

    constructor(position: Location, direction: Direction) {
        this.position = position;
        this.direction = direction;
    }

    toString() {
        return `Point [direction=${this.direction}, position=${this.position}]`;
    }
}


class MovementTask extends Task {
    constructor(n1: number, private readonly execFunc: (task: MovementTask) => void) {
        super(0, n1, true);
    }
    execute(): void {
        this.execFunc(this);
    }

}

class MovementeTaskFunc extends Task {
    constructor(n1: number, private readonly execFunc: Function) {
        super(1, n1, true);
    }
    execute(): void {
        this.execFunc();
    }

}
