import { Location } from "../../model/Location";
import { Mobile } from "../../entity/impl/Mobile";
import { Boundary } from "../../model/Boundary";

export class Wilderness {
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
        const z = location.getZ();

        return (
            (x >= 2940 && x <= 3392 && y >= 3525 && y <= 3968 && z === 0) ||
            (x >= 2986 && x <= 3012 && y >= 10338 && y <= 10366 && z === 0) ||
            (x >= 3653 && x <= 3720 && y >= 3441 && y <= 3538 && z === 0) ||
            (x >= 3650 && x <= 3653 && y >= 3457 && y <= 3472 && z === 0) ||
            (x >= 3150 && x <= 3199 && y >= 3796 && y <= 3869 && z === 0) ||
            (x >= 2994 && x <= 3041 && y >= 3733 && y <= 3790 && z === 0) ||
            (x >= 3061 && x <= 3074 && y >= 10253 && y <= 10262 && z === 0)
        );
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
}
