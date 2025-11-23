"use strict";
// import {World} from '../game/World'
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShutdownHook = void 0;
class ShutdownHook {
    run() {
        console.log("The shutdown hook is processing all required actions...");
        // World.savePlayers();
        console.log("The shudown hook actions have been completed, shutting the server down...");
    }
}
exports.ShutdownHook = ShutdownHook;
//# sourceMappingURL=ShutdownHook.js.map