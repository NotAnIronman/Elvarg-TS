import { RegionManager } from "../../collision/RegionManager";
import type { Mobile } from "../../entity/impl/Mobile";
import { Location } from "../../model/Location";
import { PathFinder } from "../../model/movement/path/PathFinder";
import { CombatType } from "./CombatType";
import type { CombatMethod } from "./method/CombatMethod";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Footprint-aware combat reach and routing. */
export class CombatRange {
    static canReach(attacker: Mobile, method: CombatMethod, target: Mobile): boolean {
        if (!attacker || !target || attacker.getPrivateArea() !== target.getPrivateArea()) {
            return false;
        }

        const attackerLocation = attacker.getLocation();
        const targetLocation = target.getLocation();
        if (attackerLocation.getZ() !== targetLocation.getZ()) {
            return false;
        }

        const attackerBounds = this.bounds(attacker);
        const targetBounds = this.bounds(target);
        const range = Math.max(1, method.attackDistance(attacker) | 0);
        if (this.overlaps(attackerBounds, targetBounds) || this.distance(attackerBounds, targetBounds) > range) {
            return false;
        }

        if (method.type() === CombatType.MELEE) {
            return range === 1
                ? this.hasOpenSharedEdge(attackerBounds, targetBounds, attackerLocation.getZ(), attacker.getPrivateArea())
                : this.hasMeleeLine(attackerBounds, targetBounds, attackerLocation.getZ(), attacker.getPrivateArea());
        }

        const from = this.nearestTile(attackerBounds, targetBounds);
        const to = this.nearestTile(targetBounds, attackerBounds);
        return RegionManager.canProjectileAttackReturn(
            new Location(from.x, from.y, attackerLocation.getZ()),
            new Location(to.x, to.y, attackerLocation.getZ()),
            Math.max(1, attacker.getSize()),
            attacker.getPrivateArea(),
        );
    }

    static route(attacker: Mobile, method: CombatMethod, target: Mobile): boolean {
        const range = Math.max(1, method.attackDistance(attacker) | 0);
        if (method.type() === CombatType.MELEE) {
            return PathFinder.calculateEntityRoute(attacker, target) > 0;
        }

        const tile = PathFinder.getClosestAttackableTile(attacker, target, range);
        return tile != null && PathFinder.calculateWalkRoute(attacker, tile.getX(), tile.getY()) > 0;
    }

    private static bounds(entity: Mobile): Bounds {
        const location = entity.getLocation();
        const size = Math.max(1, entity.getSize() | 0);
        return {
            minX: location.getX(),
            minY: location.getY(),
            maxX: location.getX() + size - 1,
            maxY: location.getY() + size - 1,
        };
    }

    private static distance(a: Bounds, b: Bounds): number {
        return Math.max(
            0,
            b.minX - a.maxX,
            a.minX - b.maxX,
            b.minY - a.maxY,
            a.minY - b.maxY,
        );
    }

    private static overlaps(a: Bounds, b: Bounds): boolean {
        return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
    }

    private static hasOpenSharedEdge(a: Bounds, b: Bounds, z: number, area: any): boolean {
        if (a.maxX + 1 === b.minX || b.maxX + 1 === a.minX) {
            const fromX = a.maxX + 1 === b.minX ? a.maxX : a.minX;
            const toX = a.maxX + 1 === b.minX ? b.minX : b.maxX;
            for (let y = Math.max(a.minY, b.minY); y <= Math.min(a.maxY, b.maxY); y++) {
                if (RegionManager.canMove(fromX, y, toX, y, z, 1, 1, area)) return true;
            }
        }
        if (a.maxY + 1 === b.minY || b.maxY + 1 === a.minY) {
            const fromY = a.maxY + 1 === b.minY ? a.maxY : a.minY;
            const toY = a.maxY + 1 === b.minY ? b.minY : b.maxY;
            for (let x = Math.max(a.minX, b.minX); x <= Math.min(a.maxX, b.maxX); x++) {
                if (RegionManager.canMove(x, fromY, x, toY, z, 1, 1, area)) return true;
            }
        }
        return false;
    }

    private static hasMeleeLine(a: Bounds, b: Bounds, z: number, area: any): boolean {
        const from = this.nearestTile(a, b);
        const to = this.nearestTile(b, a);
        return RegionManager.canMove(from.x, from.y, to.x, to.y, z, 1, 1, area);
    }

    private static nearestTile(from: Bounds, to: Bounds): { x: number; y: number } {
        return {
            x: Math.max(from.minX, Math.min(from.maxX, to.minX)),
            y: Math.max(from.minY, Math.min(from.maxY, to.minY)),
        };
    }
}
