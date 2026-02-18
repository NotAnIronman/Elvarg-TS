import { Location } from "../../model/Location";
import { Mobile } from "../../entity/impl/Mobile";

export class Wilderness {
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
        return (
            (x >= 3155 && y >= 3798) ||
            (x >= 3020 && x <= 3055 && y >= 3684 && y <= 3711) ||
            (x >= 3150 && x <= 3195 && y >= 2958 && y <= 3003) ||
            (x >= 3645 && x <= 3715 && y >= 3454 && y <= 3550) ||
            (x >= 3150 && x <= 3199 && y >= 3796 && y <= 3869) ||
            (x >= 2994 && x <= 3041 && y >= 3733 && y <= 3790) ||
            (x >= 3136 && x <= 3327 && y >= 3527 && y <= 3650)
        );
    }
}
