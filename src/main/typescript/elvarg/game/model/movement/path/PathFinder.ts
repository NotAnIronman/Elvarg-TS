import { Mobile } from "../../../entity/impl/Mobile";
import { Server } from "../../../../Server";
import { RegionManager } from "../../../collision/RegionManager";
import { Location } from "../../Location";
import { Graphic } from "../../Graphic";
import { PlayerRights } from "../../rights/PlayerRights";
import { GameConstants } from "../../../GameConstants";
import { CombatConstants } from "../../../content/combat/CombatConstants";
import { PluginManager } from "../../../../plugins/PluginManager";
import { RsmodRouteFinding } from "./RsmodRouteFinding";
import * as fs from "fs";
import * as path from "path";

export class PathFinder {
    private static readonly ATTACK_RANGE_DEBUG_GRAPHIC = new Graphic(332, 0);
    // Debounce path-blocked events aggressively: repeated retries against the
    // same destination within a short window do not provide extra recovery
    // signal for bot logic, but they do add measurable hook overhead.
    private static readonly PATH_BLOCKED_EVENT_DEBOUNCE_MS = 1200;
    // Bots generate substantially more repeated "no path" attempts than human
    // players, so use a longer debounce window for bot entities.
    private static readonly PATH_BLOCKED_EVENT_BOT_DEBOUNCE_MS = 2500;
    private static LOG_DIR = path.join(process.cwd(), "logs");
    private static LOG_FILE = path.join(PathFinder.LOG_DIR, "movement.log");
    private static LOG_READY = false;
    private static LOG_ENABLED = false;
    private static blockedEventTracker = new WeakMap<Mobile, {
        signature: string;
        lastEmittedAtMs: number;
    }>();
    private static readonly rsmodRouteFinding = new RsmodRouteFinding();

    private static log(line: string) {
        if (!PathFinder.LOG_ENABLED) {
            return;
        }

        const msg = `${new Date().toISOString()} [pathfinder] ${line}`;
        console.log(msg);
        try {
            if (!PathFinder.LOG_READY) {
                fs.mkdirSync(PathFinder.LOG_DIR, { recursive: true });
                PathFinder.LOG_READY = true;
            }
            fs.appendFileSync(PathFinder.LOG_FILE, msg + "\n", { encoding: "utf8" });
        } catch (e) {
            // Ignore file logging errors.
        }
    }

    private static shouldEmitPathBlockedEvent(
        entity: Mobile,
        signature: string,
        nowMs: number
    ): boolean {
        const isBot =
            entity?.isPlayer?.() === true &&
            entity.getAsPlayer?.()?.isPlayerBot?.() === true;
        const debounceMs = isBot
            ? PathFinder.PATH_BLOCKED_EVENT_BOT_DEBOUNCE_MS
            : PathFinder.PATH_BLOCKED_EVENT_DEBOUNCE_MS;
        const previous = PathFinder.blockedEventTracker.get(entity);
        if (
            previous &&
            previous.signature === signature &&
            nowMs - previous.lastEmittedAtMs < debounceMs
        ) {
            return false;
        }
        PathFinder.blockedEventTracker.set(entity, {
            signature,
            lastEmittedAtMs: nowMs,
        });
        return true;
    }
    private static TILE_DISTANCE_DELTAS: Map<number, number[][]> = new Map<number, number[][]>()
        .set(1, [[-1, 0], [0, -1], [0, 1], [1, 0]])
        .set(2, [[-2, 0], [-1, -1], [-1, 1], [0, -2], [0, 2], [1, -1], [1, 1], [2, 0]])
        .set(3, [[-3, 0], [-2, -2], [-2, -1], [-2, 1], [-2, 2], [-1, -2], [-1, 2], [0, -3], [0, 3], [1, -2], [1, 2], [2, -2], [2, -1], [2, 1], [2, 2], [3, 0]])
        .set(4, [[-4, 0], [-3, -2], [-3, -1], [-3, 1], [-3, 2], [-2, -3], [-2, 3], [-1, -3], [-1, 3], [0, -4], [0, 4], [1, -3], [1, 3], [2, -3], [2, 3], [3, -2], [3, -1], [3, 1], [3, 2], [4, 0]])
        .set(5, [[-5, 0], [-4, -3], [-4, -2], [-4, -1], [-4, 1], [-4, 2], [-4, 3], [-3, -4], [-3, -3], [-3, 3], [-3, 4], [-2, -4], [-2, 4], [-1, -4], [-1, 4], [0, -5], [0, 5], [1, -4], [1, 4], [2, -4], [2, 4], [3, -4], [3, -3], [3, 3], [3, 4], [4, -3], [4, -2], [4, -1], [4, 1], [4, 2], [4, 3], [5, 0]])
        .set(6, [[-6, 0], [-5, -3], [-5, -2], [-5, -1], [-5, 1], [-5, 2], [-5, 3], [-4, -4], [-4, 4], [-3, -5], [-3, 5], [-2, -5], [-2, 5], [-1, -5], [-1, 5], [0, -6], [0, 6], [1, -5], [1, 5], [2, -5], [2, 5], [3, -5], [3, 5], [4, -4], [4, 4], [5, -3], [5, -2], [5, -1], [5, 1], [5, 2], [5, 3], [6, 0]])
        .set(7, [[-7, 0], [-6, -3], [-6, -2], [-6, -1], [-6, 1], [-6, 2], [-6, 3], [-5, -4], [-5, 4], [-4, -5], [-4, 5], [-3, -6], [-3, 6], [-2, -6], [-2, 6], [-1, -6], [-1, 6], [0, -7], [0, 7], [1, -6], [1, 6], [2, -6], [2, 6], [3, -6], [3, 6], [4, -5], [4, 5], [5, -4], [5, 4], [6, -3], [6, -2], [6, -1], [6, 1], [6, 2], [6, 3], [7, 0]])
        .set(8, [[-8, 0], [-7, -3], [-7, -2], [-7, -1], [-7, 1], [-7, 2], [-7, 3], [-6, -5], [-6, -4],
        [-6, 4], [-6, 5], [-5, -6], [-5, -5], [-5, 5], [-5, 6], [-4, -6], [-4, 6], [-3, -7], [-3, 7], [-2, -7],
        [-2, 7], [-1, -7], [-1, 7], [0, -8], [0, 8], [1, -7], [1, 7], [2, -7], [2, 7], [3, -7], [3, 7], [4, -6],
        [4, 6], [5, -6], [5, -5], [5, 5], [5, 6], [6, -5], [6, -4], [6, 4], [6, 5], [7, -3], [7, -2], [7, -1],
        [7, 1], [7, 2], [7, 3], [8, 0]])

        // Deltas which are exactly 9 squares away
        .set(9, [
            [-9, 0], [-8, -4], [-8, -3], [-8, -2], [-8, -1], [-8, 1], [-8, 2], [-8, 3], [-8, 4],
            [-7, -5], [-7, -4], [-7, 4], [-7, 5], [-6, -6], [-6, 6], [-5, -7], [-5, 7], [-4, -8], [-4, -7], [-4, 7],
            [-4, 8], [-3, -8], [-3, 8], [-2, -8], [-2, 8], [-1, -8], [-1, 8], [0, -9], [0, 9], [1, -8], [1, 8],
            [2, -8], [2, 8], [3, -8], [3, 8], [4, -8], [4, -7], [4, 7], [4, 8], [5, -7], [5, 7], [6, -6], [6, 6],
            [7, -5], [7, -4], [7, 4], [7, 5], [8, -4], [8, -3], [8, -2], [8, -1], [8, 1], [8, 2], [8, 3], [8, 4], [9, 0]])
        .set(10, [
            [-10, 0], [-9, -4], [-9, -3], [-9, -2], [-9, -1], [-9, 1], [-9, 2], [-9, 3], [-9, 4],
            [-8, -6], [-8, -5], [-8, 5], [-8, 6], [-7, -7], [-7, -6], [-7, 6], [-7, 7], [-6, -8], [-6, -7], [-6, 7],
            [-6, 8], [-5, -8], [-5, 8], [-4, -9], [-4, 9], [-3, -9], [-3, 9], [-2, -9], [-2, 9], [-1, -9], [-1, 9],
            [0, -10], [0, 10], [1, -9], [1, 9], [2, -9], [2, 9], [3, -9], [3, 9], [4, -9], [4, 9], [5, -8], [5, 8],
            [6, -8], [6, -7], [6, 7], [6, 8], [7, -7], [7, -6], [7, 6], [7, 7], [8, -6], [8, -5], [8, 5], [8, 6], [9, -4],
            [9, -3], [9, -2], [9, -1], [9, 1], [9, 2], [9, 3], [9, 4], [10, 0]
        ]);

    public static isDiagonalTiles(attacker: Location, attacked: Location): boolean {
        return (
            Math.abs(attacker.getX() - attacked.getX()) === 1 &&
            Math.abs(attacker.getY() - attacked.getY()) === 1
        );
    }

    public static isDiagonalLocation(att: Mobile, def: Mobile): boolean {
        return PathFinder.isDiagonalTiles(att.getLocation(), def.getLocation());
    }

    private static emitNoPath(
        entity: Mobile,
        srcX: number,
        srcY: number,
        destX: number,
        destY: number,
        height: number,
        basicPather: boolean,
        size: number,
        xLength: number,
        yLength: number,
        direction: number,
        blockingMask: number
    ): void {
        Server.logDebug("error.. no path found... path probably not reachable.");
        PathFinder.log(`no path found to ${destX},${destY}`);
        const signature = [
            `${destX},${destY},${height}`,
            `b:${basicPather ? 1 : 0}`,
            `s:${size}`,
            `xl:${xLength}`,
            `yl:${yLength}`,
            `d:${direction}`,
            `m:${blockingMask}`,
        ].join("|");
        if (PathFinder.shouldEmitPathBlockedEvent(entity, signature, Date.now())) {
            PluginManager.emitPathBlocked({
                entity,
                isPlayer: entity.isPlayer(),
                username: entity.isPlayer() ? (entity.getAsPlayer()?.getUsername() ?? null) : null,
                from: {
                    x: srcX,
                    y: srcY,
                    z: height,
                },
                to: {
                    x: destX,
                    y: destY,
                    z: height,
                },
                basicPather,
                requestedSize: size,
                xLength,
                yLength,
                direction,
                blockingMask,
            });
        }
    }

    private static applyRsmodRoute(
        entity: Mobile,
        destX: number,
        destY: number,
        options: {
            destWidth?: number;
            destLength?: number;
            locAngle?: number;
            locShape?: number;
            moveNear?: boolean;
            blockAccessFlags?: number;
            maxWaypoints?: number;
            requestedSize?: number;
            xLength?: number;
            yLength?: number;
            direction?: number;
            blockingMask?: number;
        } = {}
    ): number {
        entity.getMovementQueue().lastDestX = destX;
        entity.getMovementQueue().lastDestY = destY;
        entity.getMovementQueue().setRoute(false);

        const height = entity.getLocation().getZ();
        const srcX = entity.getLocation().getX();
        const srcY = entity.getLocation().getY();
        const regionBaseX = entity.getLocation().getRegionX() << 3;
        const regionBaseY = entity.getLocation().getRegionY() << 3;
        const route = PathFinder.rsmodRouteFinding.findRoute({
            level: height,
            srcX,
            srcY,
            srcSize: Math.max(entity.getSize(), 1),
            destX,
            destY,
            destWidth: options.destWidth ?? 1,
            destLength: options.destLength ?? 1,
            locAngle: options.locAngle ?? 0,
            locShape: options.locShape ?? -1,
            moveNear: options.moveNear ?? true,
            blockAccessFlags: options.blockAccessFlags ?? 0,
            maxWaypoints: options.maxWaypoints ?? 25,
            privateArea: entity.getPrivateArea(),
        });

        if (!route.success) {
            PathFinder.emitNoPath(
                entity,
                srcX,
                srcY,
                destX,
                destY,
                height,
                options.moveNear === true,
                options.requestedSize ?? 0,
                options.xLength ?? 0,
                options.yLength ?? 0,
                options.direction ?? 0,
                options.blockingMask ?? 0
            );
            return 0;
        }

        entity.getMovementQueue().setRoute(true);
        entity
            .getMovementQueue()
            .setPathX(route.endX - regionBaseX)
            .setPathY(route.endY - regionBaseY);

        let steps = 0;
        for (const waypoint of route.waypoints) {
            entity.getMovementQueue().addSteps(new Location(waypoint.x, waypoint.y, waypoint.z));
            steps++;
        }

        PathFinder.log(
            `route built entity=${entity.isPlayer() ? "player:" + entity.getAsPlayer().getUsername() : "npc"} steps=${steps} dest=${destX},${destY} alt=${route.alternative ? 1 : 0}`
        );
        return steps;
    }

    public static reachedEntity(entity: Mobile, target: Mobile): boolean {
        return PathFinder.rsmodRouteFinding.reachedAbsolute({
            level: entity.getLocation().getZ(),
            srcX: entity.getLocation().getX(),
            srcY: entity.getLocation().getY(),
            srcSize: Math.max(entity.getSize(), 1),
            destX: target.getLocation().getX(),
            destY: target.getLocation().getY(),
            destWidth: Math.max(target.getSize(), 1),
            destLength: Math.max(target.getSize(), 1),
            locShape: -2,
            privateArea: entity.getPrivateArea(),
        });
    }

    public static reachedObject(
        entity: Mobile,
        destX: number,
        destY: number,
        destWidth: number,
        destLength: number,
        locAngle: number,
        locShape: number,
        blockAccessFlags: number
    ): boolean {
        return PathFinder.rsmodRouteFinding.reachedAbsolute({
            level: entity.getLocation().getZ(),
            srcX: entity.getLocation().getX(),
            srcY: entity.getLocation().getY(),
            srcSize: Math.max(entity.getSize(), 1),
            destX,
            destY,
            destWidth,
            destLength,
            locAngle,
            locShape,
            blockAccessFlags,
            privateArea: entity.getPrivateArea(),
        });
    }

    static calculateCombatRoute(player: Mobile, target: Mobile) {
        PathFinder.applyRsmodRoute(player, target.getLocation().getX(), target.getLocation().getY(), {
            destWidth: Math.max(target.getSize(), 1),
            destLength: Math.max(target.getSize(), 1),
            locShape: -2,
            moveNear: true,
        });
        player.setMobileInteraction(target);
    }

    static calculateEntityRoute(player: Mobile, target: Mobile) {
        return PathFinder.applyRsmodRoute(player, target.getLocation().getX(), target.getLocation().getY(), {
            destWidth: Math.max(target.getSize(), 1),
            destLength: Math.max(target.getSize(), 1),
            locShape: -2,
            moveNear: true,
        });
    }

    static calculateWalkRoute(player: Mobile, destX: number, destY: number) {
        if (player.isPlayer()) {
            PathFinder.log(
                `calculateWalkRoute entity=player:${player.getAsPlayer().getUsername()} from=${player.getLocation().getX()},${player.getLocation().getY()},${player.getLocation().getZ()} to=${destX},${destY}`
            );
        }
        return PathFinder.applyRsmodRoute(player, destX, destY, {
            locShape: -1,
            moveNear: true,
        });
    }

    static calculateObjectRoute(entity: Mobile, size: number, destX: number, destY: number, xLength: number, yLength: number, direction: number, blockingMask: number) {
        let destWidth = 1;
        let destLength = 1;
        let locShape = -1;
        let locAngle = 0;
        let blockAccessFlags = 0;

        if (xLength > 0 && yLength > 0) {
            destWidth = xLength;
            destLength = yLength;
            locShape = 10;
            locAngle = direction;
            blockAccessFlags = blockingMask;
        } else if (size !== 0) {
            locShape = size - 1;
            locAngle = direction;
        }

        return PathFinder.applyRsmodRoute(entity, destX, destY, {
            destWidth,
            destLength,
            locAngle,
            locShape,
            moveNear: true,
            blockAccessFlags,
            requestedSize: size,
            xLength,
            yLength,
            direction,
            blockingMask,
        });
    }

    public static getClosestAttackableTile(attacker: Mobile, defender: Mobile, distance: number): Location | null {
        const privateArea = attacker.getPrivateArea();
        const targetLocation = defender.getLocation();
        const current = attacker.getLocation();

        if (distance === 1) {
            const size = attacker.getSize();
            const followingSize = defender.getSize();
            let bestTile: Location | null = null;
            let bestDistance = Number.POSITIVE_INFINITY;
            let bestPerpendicular = false;
            for (const tile of defender.outterTiles()) {
                if (!RegionManager.canMovestart(attacker.getLocation(), tile, size, size, privateArea)
                    || RegionManager.blocked(tile, privateArea)) {
                    continue;
                }
                // Projectile attack
                if (attacker.useProjectileClipping() && !RegionManager.canProjectileAttackReturn(tile, targetLocation, size, privateArea)) {
                    continue;
                }
                const tileDistance = tile.getDistance(current);
                const tilePerpendicular =
                    size === 1 &&
                    followingSize === 1 &&
                    tile.isPerpendicularTo(current);
                if (
                    tileDistance < bestDistance ||
                    (tileDistance === bestDistance && tilePerpendicular && !bestPerpendicular)
                ) {
                    bestTile = tile;
                    bestDistance = tileDistance;
                    bestPerpendicular = tilePerpendicular;
                }
            }
            if (bestTile != null) {
                return bestTile;
            }
        }

        let tile: Location | undefined = undefined;

        // Starting from the max distance, try to find a suitable tile to attack from
        while (tile === undefined) {
            // Fetch the circumference of the closest attackable tiles to the target
            const possibleTiles = PathFinder.getTilesForDistance(targetLocation, distance);

                if (GameConstants.DEBUG_ATTACK_DISTANCE && attacker.getAsPlayer() && attacker.getAsPlayer().rights === PlayerRights.DEVELOPER) {
                    // If we're debugging attack range
                    possibleTiles.forEach(t => attacker.getAsPlayer().packetSender.sendGraphic(PathFinder.ATTACK_RANGE_DEBUG_GRAPHIC, t));
                }

            let bestTile: Location | undefined = undefined;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (const possibleTile of possibleTiles) {
                if (RegionManager.blocked(possibleTile, attacker.getPrivateArea())) {
                    continue;
                }
                if (!RegionManager.canProjectileAttack(attacker, possibleTile, targetLocation)) {
                    continue;
                }
                const tileDistance = current.getDistance(possibleTile);
                if (tileDistance < bestDistance) {
                    bestDistance = tileDistance;
                    bestTile = possibleTile;
                }
            }
            tile = bestTile;

            if (distance === 1) {
                // We've reached the closest attackable tile, break out of the loop as we can't get any closer
                break;
            } else {
                // Check 1 square closer if we don't have any valid tiles at this distance
                distance = Math.max(distance - 1, 1);
            }
        }

        if (!tile) {
            attacker.sendMessage("I can't reach that.");
            return;
        }

        return tile;
    }

    public static getTilesForDistances(center: Location, distance: number): Location[] {
        const deltas = PathFinder.TILE_DISTANCE_DELTAS.get(Math.min(distance, CombatConstants.MAX_ATTACK_DISTANCE));
        return deltas.map((d) => center.clone().getTranslate(d[0], d[1]));
    }

    public static getTilesForDistance(center: Location, distance: number): Location[] {
        const deltas = PathFinder.TILE_DISTANCE_DELTAS.get(Math.min(distance, CombatConstants.MAX_ATTACK_DISTANCE));
        return deltas.map((d) => center.clone().getTranslate(d[0], d[1]));
    }

    public static calculateRoute(entity: Mobile, size: number, destX: number, destY: number, xLength: number, yLength: number, direction: number, blockingMask: number, basicPather: boolean): number {
        PathFinder.log(
            `calculateRoute entity=${entity.isPlayer() ? "player:" + entity.getAsPlayer().getUsername() : "npc"} dest=${destX},${destY} size=${size} basic=${basicPather}`
        );
        let destWidth = 1;
        let destLength = 1;
        let locShape = -1;
        let locAngle = 0;
        let blockAccessFlags = 0;

        if (xLength > 0 && yLength > 0) {
            destWidth = xLength;
            destLength = yLength;
            locShape = 10;
            locAngle = direction;
            blockAccessFlags = blockingMask;
        } else if (size !== 0) {
            locShape = size - 1;
            locAngle = direction;
        }

        return PathFinder.applyRsmodRoute(entity, destX, destY, {
            destWidth,
            destLength,
            locAngle,
            locShape,
            moveNear: basicPather,
            blockAccessFlags,
            requestedSize: size,
            xLength,
            yLength,
            direction,
            blockingMask,
        });
    }

    public static findWalkable(entity: Mobile, x: number, y: number, targetSize: number): boolean {
        // Step West
        if (PathFinder.calculateRoute(entity, entity.getSize(), x - targetSize, y, 0, 0, 0, 0, false) > 0)
            return true;
        // Step East
        if (PathFinder.calculateRoute(entity, entity.getSize(), x + targetSize, y, 0, 0, 0, 0, false) > 0)
            return true;
        // Step North
        if (PathFinder.calculateRoute(entity, entity.getSize(), x, y + targetSize, 0, 0, 0, 0, false) > 0)
            return true;
        // Step South
        if (PathFinder.calculateRoute(entity, entity.getSize(), x, y - targetSize, 0, 0, 0, 0, false) > 0)
            return true;
        return false;
    }
}    
