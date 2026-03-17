import { Mobile } from "../../../entity/impl/Mobile";
import { Server } from "../../../../Server";
import { RegionManager } from "../../../collision/RegionManager";
import { Location } from "../../Location";
import { PrivateArea } from "../../areas/impl/PrivateArea";
import { Graphic } from "../../Graphic";
import { PlayerRights } from "../../rights/PlayerRights";
import { GameConstants } from "../../../GameConstants";
import { CombatConstants } from "../../../content/combat/CombatConstants";
import { PluginManager } from "../../../../plugins/PluginManager";
import * as fs from "fs";
import * as path from "path";
import { RsmodRouteFinding } from "./RsmodRouteFinding";

export class PathFinder {
    private static readonly GRID_SIZE = 104;
    private static readonly ROUTE_STEP_CAPACITY = 4096;
    private static readonly DISTANCE_SENTINEL = 0x5f5e0ff;
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
    private static readonly scratchDirections: number[][] = PathFinder.createGrid(0);
    private static readonly scratchDistanceValues: number[][] =
        PathFinder.createGrid(PathFinder.DISTANCE_SENTINEL);
    private static readonly scratchRouteStepsX: number[] =
        new Array<number>(PathFinder.ROUTE_STEP_CAPACITY).fill(0);
    private static readonly scratchRouteStepsY: number[] =
        new Array<number>(PathFinder.ROUTE_STEP_CAPACITY).fill(0);
    private static readonly rsmodRouteFinding = new RsmodRouteFinding();

    private static createGrid(fillValue: number): number[][] {
        const grid = new Array<number[]>(PathFinder.GRID_SIZE);
        for (let x = 0; x < PathFinder.GRID_SIZE; x++) {
            grid[x] = new Array<number>(PathFinder.GRID_SIZE).fill(fillValue);
        }
        return grid;
    }

    private static resetScratchGrid(grid: number[][], fillValue: number): void {
        for (let x = 0; x < PathFinder.GRID_SIZE; x++) {
            grid[x].fill(fillValue);
        }
    }

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
    static WEST = 0x1280108;
    static EAST = 0x1280180;
    static SOUTH = 0x1280102;
    static NORTH = 0x1280120;
    static SOUTHEAST = 0x1280183;
    static SOUTHWEST = 0x128010e;
    static NORTHEAST = 0x12801e0;
    static NORTHWEST = 0x1280138;

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

    public isInDiagonalBlock(attacker: Location, attacked: Location): boolean {
        return attacked.getX() - 1 == attacker.getX() && attacked.getY() + 1 == attacker.getY()
            || attacker.getX() - 1 == attacked.getX() && attacker.getY() + 1 == attacked.getY()
            || attacked.getX() + 1 == attacker.getX() && attacked.getY() - 1 == attacker.getY()
            || attacker.getX() + 1 == attacked.getX() && attacker.getY() - 1 == attacked.getY()
            || attacked.getX() + 1 == attacker.getX() && attacked.getY() + 1 == attacked.getY()
            || attacker.getX() + 1 == attacked.getX() && attacker.getY() + 1 == attacker.getY();
    }

    public static isDiagonalLocation(att: Mobile, def: Mobile): boolean {
        let attacker = att.getLocation().clone();
        let attacked = def.getLocation().clone();
        let isDia = attacker.getX() - 1 == attacked.getX() && attacker.getY() + 1 == attacked.getY() //top left
            || attacker.getX() + 1 == attacked.getX() && attacker.getY() - 1 == attacked.getY() //bottom right
            || attacker.getX() + 1 == attacked.getX() && attacker.getY() + 1 == attacked.getY() //top right
            || attacker.getX() - 1 == attacked.getX() && attacker.getY() - 1 == attacked.getY(); //bottom right
        return isDia;
    }

    static calculateCombatRoute(player: Mobile, target: Mobile) {
        PathFinder.calculateRoute(player, 0, target.getLocation().getX(), target.getLocation().getY(), 1, 1, 0, 0, false);
        player.setMobileInteraction(target);
    }

    static calculateEntityRoute(player: Mobile, destX: number, destY: number) {
        PathFinder.calculateRoute(player, 0, destX, destY, 1, 1, 0, 0, false);
    }

    static calculateWalkRoute(player: Mobile, destX: number, destY: number) {
        if (player.isPlayer()) {
            PathFinder.log(
                `calculateWalkRoute entity=player:${player.getAsPlayer().getUsername()} from=${player.getLocation().getX()},${player.getLocation().getY()},${player.getLocation().getZ()} to=${destX},${destY}`
            );
        }
        PathFinder.calculateRoute(player, 0, destX, destY, 0, 0, 0, 0, true);
    }

    static calculateObjectRoute(entity: Mobile, size: number, destX: number, destY: number, xLength: number, yLength: number, direction: number, blockingMask: number) {
        PathFinder.calculateRoute(entity, size, destX, destY, xLength, yLength, direction, blockingMask, false);
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

        entity.getMovementQueue().lastDestX = destX;
        entity.getMovementQueue().lastDestY = destY;
        entity.getMovementQueue().setRoute(false);
        const height = entity.getLocation().getZ();
        const srcX = entity.getLocation().getX();
        const srcY = entity.getLocation().getY();

        let destWidth = 1;
        let destLength = 1;
        let locShape = -1;
        let locAngle = 0;
        let blockAccessFlags = 0;

        if (xLength > 0 && yLength > 0) {
            destWidth = xLength;
            destLength = yLength;
            locShape = 10;
            blockAccessFlags = blockingMask;
        } else if (size !== 0) {
            locShape = size - 1;
            locAngle = direction;
        }

        const route = PathFinder.rsmodRouteFinding.findRoute({
            level: height,
            srcX,
            srcY,
            srcSize: Math.max(entity.getSize(), 1),
            destX,
            destY,
            destWidth,
            destLength,
            locAngle,
            locShape,
            moveNear: basicPather,
            blockAccessFlags,
            maxWaypoints: 25,
            privateArea: entity.getPrivateArea(),
        });

        if (!route.success) {
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
            return 0;
        }

        entity.getMovementQueue().setRoute(true);
        entity.getMovementQueue().setPathX(route.endX).setPathY(route.endY);

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

    public static defaultRoutePath(entity: Mobile, destX: number, baseX: number, baseY: number, direction: number, size: number, destY: number): boolean {
        if (baseX === destX && baseY === destY) {
            entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
            return true;
        }

        const absX = (entity.getLocation().getRegionX() << 3) + baseX;

        const absY = (entity.getLocation().getRegionY() << 3) + baseY;

        const height = entity.getLocation().getZ();

        const area = entity.getPrivateArea();

        baseX -= 0;
        baseY -= 0;
        destX -= 0;
        destY -= 0;

        if (size === 0) {
            if (direction === 0) {
                if (baseX === destX - 1 && baseY === destY) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX === destX && baseY === destY + 1 && (RegionManager.getClipping(absX, absY, height, area) & 0x1280120) === 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX === destX && baseY === destY - 1 && (RegionManager.getClipping(absX, absY, height, area) & 0x1280102) === 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction === 1) {
                if (baseX === destX && baseY === destY + 1) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX === destX - 1 && baseY === destY && (RegionManager.getClipping(absX, absY, height, area) & 0x1280108) === 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX === destX + 1 && baseY === destY && (RegionManager.getClipping(absX, absY, height, area) & 0x1280180) === 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction === 2) {
                if (baseX === destX + 1 && baseY === destY) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX === destX && baseY === destY + 1 && (RegionManager.getClipping(absX, absY, height, area) & 0x1280120) === 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX === destX && baseY === destY - 1 && (RegionManager.getClipping(absX, absY, height, area) & 0x1280102) === 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 3) {
                if (baseX == destX && baseY == destY - 1) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX - 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280108) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX + 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280180) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            }
        } if (size == 2) {
            if (direction == 0) {
                if (baseX == destX - 1 && baseY == destY) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY + 1) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX + 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280180) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY - 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280102) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 1) {
                if (baseX == destX - 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280108) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY + 1) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX + 1 && baseY == destY) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY - 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280102) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 2) {
                if (baseX == destX - 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280108) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY + 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280120) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX + 1 && baseY == destY) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY - 1) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 3) {
                if (baseX == destX - 1 && baseY == destY) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY + 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280120) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX + 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x1280180) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY - 1) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            }
        } if (size == 9) {
            if (baseX == destX && baseY == destY + 1 && (RegionManager.getClipping(absX, absY, height, area) & 0x20) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
            if (baseX == destX && baseY == destY - 1 && (RegionManager.getClipping(absX, absY, height, area) & 2) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
            if (baseX == destX - 1 && baseY == destY && (RegionManager.getClipping(absX, absY, height, area) & 8) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
            if (baseX == destX + 1 && baseY == destY && (RegionManager.getClipping(absX, absY, height, area) & 0x80) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
        }
        return false;
    }

    private static largeRoutePath(entity: Mobile, destX: number, destY: number, baseY: number, size: number, direction: number, baseX: number): boolean {
        if (baseX === destX && baseY === destY) {
            entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
            return true;
        }

        const absX = (entity.getLocation().getRegionX() << 3) + baseX;

        const absY = (entity.getLocation().getRegionY() << 3) + baseY;

        const height = entity.getLocation().getZ();

        const area = entity.getPrivateArea();

        baseX -= 0;
        baseY -= 0;
        destX -= 0;
        destY -= 0;

        if (size == 6 || size == 7) {
            if (size == 7)
                direction = direction + 2 & 3;
            if (direction == 0) {
                if (baseX == destX + 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x80) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY - 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 2) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 1) {
                if (baseX == destX - 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 8) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY - 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 2) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 2) {
                if (baseX == destX - 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 8) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY + 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x20) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            } else if (direction == 3) {
                if (baseX == destX + 1 && baseY == destY
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x80) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
                if (baseX == destX && baseY == destY + 1
                    && (RegionManager.getClipping(absX, absY, height, area) & 0x20) == 0) {
                    entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                    return true;
                }
            }
        }
        if (size == 8) {
            if (baseX == destX && baseY == destY + 1
                && (RegionManager.getClipping(absX, absY, height, area) & 0x20) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
            if (baseX == destX && baseY == destY - 1 && (RegionManager.getClipping(absX, absY, height, area) & 2) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
            if (baseX == destX - 1 && baseY == destY && (RegionManager.getClipping(absX, absY, height, area) & 8) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
            if (baseX == destX + 1 && baseY == destY
                && (RegionManager.getClipping(absX, absY, height, area) & 0x80) == 0) {
                entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
                return true;
            }
        }
        return false;
    }

    private static sizeRoutePath(entity: Mobile, destY: number, destX: number, baseX: number, sizeX: number, blockedMask: number, sizeY: number, baseY: number): boolean {
        const absX = (entity.getLocation().getRegionX() << 3) + baseX;
        const absY = (entity.getLocation().getRegionY() << 3) + baseY;
        const height = entity.getLocation().getZ();
        const area = entity.getPrivateArea();
        let xOffset = 0;
        let yOffset = 0;
        const maxX = (destX + sizeY) - 1;
        const maxY = (destY + sizeX) - 1;
        // rest of the function logic
        if (baseX >= destX && baseX <= maxX && baseY >= destY && baseY <= maxY) {
            entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
            return true;
        }
        if (baseX == destX - 1 && baseY >= destY && baseY <= maxY
            && (RegionManager.getClipping(absX - xOffset, absY - yOffset, height, area) & 8) == 0
            && (blockedMask & 8) == 0) {
            entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
            return true;
        }
        if (baseX == maxX + 1 && baseY >= destY && baseY <= maxY
            && (RegionManager.getClipping(absX - xOffset, absY - yOffset, height, area) & 0x80) == 0
            && (blockedMask & 2) == 0) {
            entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
            return true;
        }
        if (baseY == destY - 1 && baseX >= destX && baseX <= maxX
            && (RegionManager.getClipping(absX - xOffset, absY - yOffset, height, area) & 2) == 0
            && (blockedMask & 4) == 0 || baseY == maxY + 1 && baseX >= destX && baseX <= maxX
            && (RegionManager.getClipping(absX - xOffset, absY - yOffset, height, area) & 0x20) == 0
            && (blockedMask & 1) == 0) {
            entity.getMovementQueue().setPathX(baseX).setPathY(baseY);
            return true;
        }
        return false;
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
