"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stopwatch = void 0;
class Stopwatch {
    constructor() {
        this.time = Date.now();
        this.time = 0;
    }
    start(startAt) {
        this.time = Date.now() - startAt;
    }
    reset(i) {
        this.time = i ? i : Date.now();
        return this;
    }
    Hasreset() {
        this.time = Date.now();
    }
    elapsed() {
        return Date.now() - this.time;
    }
    elapsedTime(time) {
        return this.elapsed() >= time;
    }
    hasElapsed(time) {
        return this.elapsed() >= time;
    }
    getTime() {
        return this.time;
    }
}
exports.Stopwatch = Stopwatch;
//# sourceMappingURL=Stopwatch.js.map