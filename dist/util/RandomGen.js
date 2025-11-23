"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RandomGen = void 0;
class RandomGen {
    constructor() {
        this.random = Math.random();
    }
    getRandom() {
        return this.random;
    }
    getInclusive(min, max) {
        if (max < min) {
            max = min + 1;
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    getInclusiveRange(range) {
        return this.getInclusive(0, range);
    }
    getInclusiveExcludes(min, max, exclude) {
        exclude.sort();
        let result;
        let index = exclude.indexOf(result);
        while (index !== -1) {
            result = this.getInclusive(min, max);
            index = exclude.indexOf(result);
        }
        return result;
    }
    floatRandom(max) {
        if (max <= 0) {
            throw new Error("max must be greater than 0");
        }
        return Math.random() * max;
    }
    randomIndex(array) {
        return Math.floor(Math.random() * array.length);
    }
    randomArray(array) {
        return array[this.randomIndex(array)];
    }
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const index = Math.floor(Math.random() * (i + 1));
            const temp = array[i];
            array[i] = array[index];
            array[index] = temp;
        }
        return array;
    }
    success(value) {
        return Math.random() <= value;
    }
}
exports.RandomGen = RandomGen;
//# sourceMappingURL=RandomGen.js.map