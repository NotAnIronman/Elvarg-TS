import { Location } from "../Location";
import { Mobile } from "../../entity/impl/Mobile";
import { Area, BasicAttackResponse } from "./Area";
import { CanAttackResponse } from "../../content/combat/CombatFactory";
import { Wilderness } from "../../content/wilderness/Wilderness";

export class AreaManager {
    public static areas: Area[] = [];
    private static readonly areaHints = new WeakMap<Mobile, AreaHint>();
    /**
     * Processes areas for the given character.
     *
     * @param c
     */
    public static process(c: Mobile): void {
        let position = c.getLocation();
        let area = c.getArea();
        const hint = AreaManager.areaHints.get(c);

        let previousArea: Area | null = null;
        let boundaryIndex = -1;

        if (area != null) {
            boundaryIndex = AreaManager.findBoundaryIndex(position, area, hint != null && hint.area === area ? hint.boundaryIndex : -1);
            if (boundaryIndex === -1) {
                area.leave(c, false);
                previousArea = area;
                area = null;
            }
        }

        if (area == null) {
            if (hint != null
                && hint.area == null
                && hint.x === position.getX()
                && hint.y === position.getY()
                && hint.z === position.getZ()) {
                area = null;
            } else {
                const resolved = AreaManager.getWithBoundaryIndex(position);
                area = resolved.area;
                boundaryIndex = resolved.boundaryIndex;
            }
            if (area != null) {
                area.enter(c);
            }
        }

        // Handle processing..
        if (area != null) {
            area.process(c);
        }

        // Handle multiicon update..
        if (c.isPlayer()) {
            let player = c.getAsPlayer();

            let multiIcon = 0;

            if (area != null) {
                multiIcon = area.isMulti(player) ? 1 : 0;
            }

            if (player.getMultiIcon() != multiIcon) {
                player.getPacketSender().sendMultiIcon(multiIcon);
            }
        }

        // Update area..
        c.setArea(area);
        AreaManager.areaHints.set(c, {
            area,
            boundaryIndex,
            x: position.getX(),
            y: position.getY(),
            z: position.getZ(),
        });

        // Handle postLeave...
        if (previousArea != null) {
            previousArea.postLeave(c, false);
        }
    }

    public static inMulti(c: Mobile): boolean {
        if (c.getArea() != null) {
            return c.getArea().isMulti(c);
        }
        const location = c.getLocation();
        if (Wilderness.isInLocation(location)) {
            return Wilderness.isMulti(location.getX(), location.getY());
        }
        return false;
    }

    /**
     * Checks if a {@link Mobile} can attack another one.
     *
     * @param attacker
     * @param target
     * @return {CanAttackResponse}
     */
    public static canAttack(attacker: Mobile, target: Mobile): CanAttackResponse | BasicAttackResponse {
        if (attacker.getPrivateArea() != target.getPrivateArea()) {
            return CanAttackResponse.CANT_ATTACK_IN_AREA;
        }

        if (attacker.getArea() != null) {
            return attacker.getArea().canAttack(attacker, target) as any;
        }

        // Don't allow PvP by default
        if (attacker.isPlayer() && target.isPlayer()) {
            return CanAttackResponse.CANT_ATTACK_IN_AREA;
        }

        return CanAttackResponse.CAN_ATTACK;
    }

    /**
     * Gets a {@link Area} based on a given {@link Location}.
     *
     * @param position
     * @return
     */
    public static get(position: Location): Area | null {
        return AreaManager.getWithBoundaryIndex(position).area;
    }

    private static getWithBoundaryIndex(position: Location): AreaSearchResult {
        for (let area of this.areas) {
            const boundaryIndex = AreaManager.findBoundaryIndex(position, area);
            if (boundaryIndex !== -1) {
                return { area, boundaryIndex };
            }
        }
        return { area: null, boundaryIndex: -1 };
    }

    /**
     * Checks if a position is inside of an area's boundaries.
     *
     * @param position
     * @return
     */
    public static inside(position: Location, area: Area): boolean {
        return AreaManager.findBoundaryIndex(position, area) !== -1;
    }

    private static findBoundaryIndex(position: Location, area: Area, hintBoundaryIndex: number = -1): number {
        const boundaries = area.getBoundaries();
        if (boundaries == null || boundaries.length === 0) {
            return -1;
        }

        if (hintBoundaryIndex >= 0 && hintBoundaryIndex < boundaries.length && boundaries[hintBoundaryIndex].inside(position)) {
            return hintBoundaryIndex;
        }

        for (let index = 0; index < boundaries.length; index++) {
            if (index !== hintBoundaryIndex && boundaries[index].inside(position)) {
                return index;
            }
        }
        return -1;
    }
}

type AreaSearchResult = {
    area: Area | null;
    boundaryIndex: number;
};

type AreaHint = {
    area: Area | null;
    boundaryIndex: number;
    x: number;
    y: number;
    z: number;
};
