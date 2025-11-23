"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chance = void 0;
const Misc_1 = require("./Misc");
class Chance {
    constructor(percentage) {
        this.percentage = percentage;
    }
    success() {
        return (Misc_1.Misc.getRandom(100)) <= this.percentage;
    }
    getPercentage() {
        return this.percentage;
    }
}
exports.Chance = Chance;
Chance.ALWAYS = new Chance(100);
Chance.VERY_COMMON = new Chance(90);
Chance.COMMON = new Chance(75);
Chance.SOMETIMES = new Chance(50);
Chance.UNCOMMON = new Chance(35);
Chance.VERY_UNCOMMON = new Chance(10);
Chance.EXTREMELY_RARE = new Chance(5);
Chance.ALMOST_IMPOSSIBLE = new Chance(1);
//# sourceMappingURL=Chance.js.map