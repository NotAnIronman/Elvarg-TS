"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrameUpdater = exports.Frame126 = void 0;
const hashmap_1 = require("hashmap");
class Frame126 {
    constructor(s, id) {
        this.currentState = s;
        this.id = id;
    }
}
exports.Frame126 = Frame126;
class FrameUpdater {
    constructor() {
        this.interfaceTextMap = new hashmap_1.HashMap();
    }
    shouldUpdate(text, id) {
        if (!this.interfaceTextMap.has(id)) {
            this.interfaceTextMap.set(id, new Frame126(text, id));
        }
        else {
            let t = this.interfaceTextMap.get(id);
            if (text === t.currentState) {
                return false;
            }
            t.currentState = text;
        }
        return true;
    }
}
exports.FrameUpdater = FrameUpdater;
//# sourceMappingURL=FrameUpdater.js.map