"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerKey = void 0;
const Misc_1 = require("../Misc");
class TimerKey {
    constructor(ticks) {
        this.ticks = ticks;
    }
    getTicks() {
        return this.ticks;
    }
}
exports.TimerKey = TimerKey;
TimerKey.FOOD = new TimerKey();
TimerKey.KARAMBWAN = new TimerKey();
TimerKey.POTION = new TimerKey();
TimerKey.COMBAT_ATTACK = new TimerKey();
TimerKey.FREEZE = new TimerKey();
TimerKey.FREEZE_IMMUNITY = new TimerKey();
TimerKey.STUN = new TimerKey();
TimerKey.ATTACK_IMMUNITY = new TimerKey();
TimerKey.CASTLEWARS_TAKE_ITEM = new TimerKey();
TimerKey.STEPPING_OUT = new TimerKey();
TimerKey.BOT_WAIT_FOR_PLAYERS = new TimerKey(Misc_1.Misc.getTicks(180 /* 3 minutes */));
//# sourceMappingURL=TimerKey.js.map