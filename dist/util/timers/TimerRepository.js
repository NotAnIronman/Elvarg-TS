"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerRepository = void 0;
const Timer_1 = require("../timers/Timer");
class TimerRepository {
    constructor() {
        this.timer = new Map();
    }
    has(key) {
        let timer = this.timer.get(key);
        return timer !== null && timer.ticks() > 0;
    }
    register(timer) {
        this.timer.set(timer.key(), timer);
    }
    registerTimerKey(key) {
        this.timers().set(key, new Timer_1.Timer(key, key.getTicks()));
    }
    left(key) {
        let timer = this.timer.get(key);
        return timer.ticks();
    }
    willEndIn(key, ticks) {
        let timer = this.timer.get(key);
        if (timer === null) {
            return true;
        }
        return timer.ticks() <= ticks;
    }
    getTicks(key) {
        let timer = this.timer.get(key);
        if (timer === null) {
            return 0;
        }
        return timer.ticks();
    }
    registers(key, ticks) {
        this.timer.set(key, new Timer_1.Timer(key, ticks));
    }
    extendOrRegister(key, ticks) {
        this.timer.set(key, this.timer.get(key) === null || this.timer.get(key).ticks() < ticks ? new Timer_1.Timer(key, ticks) : this.timer.get(key));
    }
    addOrSet(key, ticks) {
        this.timer.set(key, this.timer.get(key) ? new Timer_1.Timer(key, this.timer.get(key).ticks() + ticks) : new Timer_1.Timer(key, ticks));
    }
    cancel(name) {
        this.timer.delete(name);
    }
    process() {
        if (this.timer.size > 0) {
            this.timer.forEach((timer) => {
                timer.tick();
            });
        }
    }
    timers() {
        return this.timer;
    }
}
exports.TimerRepository = TimerRepository;
//# sourceMappingURL=TimerRepository.js.map