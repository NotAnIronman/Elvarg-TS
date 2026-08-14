import { Location } from "../../model/Location";
import { Mobile } from "../../entity/impl/Mobile";
import { Boundary } from "../../model/Boundary";

export class Wilderness {
    private static readonly AREAS: Boundary[] = [
        new Boundary(2940, 3392, 3525, 3968, 0),
        new Boundary(2986, 3012, 10338, 10366, 0),
        new Boundary(3653, 3720, 3441, 3538, 0),
        new Boundary(3650, 3653, 3457, 3472, 0),
        new Boundary(3150, 3199, 3796, 3869, 0),
        new Boundary(2994, 3041, 3733, 3790, 0),
        new Boundary(3061, 3074, 10253, 10262, 0),
    ];

    private static readonly MULTI: Boundary[] = [
        new Boundary(3136, 3327, 3519, 3607, 0),
        new Boundary(2360, 2445, 5045, 5125, 0),
        new Boundary(2256, 2287, 4680, 4711, 0),
        new Boundary(3190, 3327, 3648, 3839, 0),
        new Boundary(3200, 3390, 3840, 3967, 0),
        new Boundary(2992, 3007, 3912, 3967, 0),
        new Boundary(2946, 2959, 3816, 3831, 0),
        new Boundary(3008, 3199, 3856, 3903, 0),
        new Boundary(3008, 3071, 3600, 3711, 0),
        new Boundary(3072, 3327, 3608, 3647, 0),
        new Boundary(2624, 2690, 2550, 2619, 0),
        new Boundary(2667, 2685, 3712, 3730, 0),
        new Boundary(2371, 2422, 5062, 5117, 0),
        new Boundary(2896, 2927, 3595, 3630, 0),
        new Boundary(2892, 2932, 4435, 4464, 0),
        new Boundary(3279, 3307, 3156, 3179, 0),
    ];

    public static isInLocation(location: Location | null | undefined): boolean {
        if (!location) {
            return false;
        }
        const x = location.getX();
        const y = location.getY();
        return Wilderness.AREAS.some((boundary) => boundary.inside(location));
    }

    public static isIn(character: Mobile | null | undefined): boolean {
        return Wilderness.isInLocation(character?.getLocation?.());
    }

    public static levelForY(y: number): number {
        return Math.floor(((y > 6400 ? y - 6400 : y) - 3520) / 8) + 1;
    }

    public static isMulti(x: number, y: number): boolean {
        const location = new Location(x, y, 0);
        return Wilderness.MULTI.some((boundary) => boundary.inside(location));
    }

    public static intersectsArea(minX: number, maxX: number, minY: number, maxY: number, z: number): boolean {
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
            return false;
        }
        if (!Number.isFinite(z)) {
            return false;
        }
        return Wilderness.AREAS.some((boundary) => {
            const boundaryZ = boundary.height ?? 0;
            const boundaryMinX = boundary.getX();
            const boundaryMaxX = boundary.getX2();
            const boundaryMinY = boundary.getY();
            const boundaryMaxY = boundary.getY2();
            return (
                boundaryZ === z &&
                boundaryMinX <= maxX &&
                boundaryMaxX >= minX &&
                boundaryMinY <= maxY &&
                boundaryMaxY >= minY
            );
        });
    }
}
