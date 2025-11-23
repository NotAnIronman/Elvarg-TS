"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
// Provide minimal browser globals for libs that expect window (e.g., phaser).
global.window = global.window ?? {};
global.document = global.document ?? { documentElement: {}, createElement: () => ({ canPlayType: () => "", getContext: () => ({ fillRect: () => { }, drawImage: () => { }, getImageData: () => ({ data: [0, 0, 0, 0] }), putImageData: () => { } }) }) };
if (typeof global.navigator === "undefined") {
    global.navigator = {};
}
global.Image = global.Image ?? function () { return {}; };
global.HTMLCanvasElement = global.HTMLCanvasElement ?? function () { };
// import { GameBuilder } from "./game/GameBuilder";
// import { GameConstants } from "./game/GameConstants";
const NetworkBuilder_1 = require("./net/NetworkBuilder");
const NetworkConstants_1 = require("./net/NetworkConstants");
const Flooder_1 = require("./util/flood/Flooder");
// import Logger from "logger";
var logger = require("logger");
class Server {
    static main(args) {
        try {
            if (args.length === 1) {
                Server.PRODUCTION = parseInt(args[0], 10) === 1;
            }
            console.info(`Initializing Name in ${Server.PRODUCTION ? "production" : "non-production"} mode..`);
            // new GameBuilder().initialize();
            new NetworkBuilder_1.NetworkBuilder().initialize(NetworkConstants_1.NetworkConstants.GAME_PORT);
            console.log("Start");
            // console.info(`${GameConstants.NAME} is now online!`);
        }
        catch (e) {
            console.log(e, "error");
            console.error(`An error occurred while binding the Bootstrap: ${e}`);
            process.exit(1);
        }
    }
    static logDebug(logMessage) {
        if (!Server.DEBUG_LOGGING) {
            return;
        }
        logger.info(logMessage);
    }
    static getLogger() {
        return Server.logger;
    }
    static isUpdating() {
        return Server.updating;
    }
    static setUpdating(isUpdating) {
        Server.updating = isUpdating;
    }
    static getFlooder() {
        return Server.flooder;
    }
}
exports.Server = Server;
Server.flooder = new Flooder_1.Flooder();
Server.PRODUCTION = false;
Server.DEBUG_LOGGING = false;
Server.logger = logger.createLogger(Server.constructor.name);
Server.updating = false;
Server.main(["1"]);
//# sourceMappingURL=Server.js.map