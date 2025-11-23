"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer = void 0;
class Timer {
    constructor(Key, Ticks) {
        this.Key = Key;
        this.Ticks = Ticks;
    }
    ticks() {
        return this.Ticks;
    }
    key() {
        return this.Key;
    }
    tick() {
        if (this.Ticks > 0) {
            this.Ticks--;
        }
    }
}
exports.Timer = Timer;
//# sourceMappingURL=Timer.js.map