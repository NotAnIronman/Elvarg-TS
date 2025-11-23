"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flooder = void 0;
const Misc_1 = require("../Misc");
const Client_1 = require("../flood/Client");
const AsyncLock = require("async-lock");
var lock = new AsyncLock();
class Flooder {
    constructor() {
        this.clients = new Map();
        this.running = false;
        this.lock = lock;
    }
    start() {
        if (!this.running) {
            this.running = true;
            setInterval(this.run.bind(this), 300);
        }
    }
    stop() {
        this.running = false;
    }
    login(amount) {
        this.start();
        for (let i = 0; i < amount; i++) {
            try {
                let username = "bot" + this.clients.size.toString();
                let password = "bot";
                this.lock.acquire("lock", () => {
                    this.clients.set(username, new Client_1.Client(Misc_1.Misc.formatText(username), password));
                });
                new Client_1.Client(Misc_1.Misc.formatText(username), password).attemptLogin();
            }
            catch (e) {
                console.error(e);
            }
        }
    }
    run() {
        if (this.running) {
            try {
                this.lock.acquire("lock", () => {
                    let keysToRemove = [];
                    for (const [key, client] of this.clients) {
                        try {
                            client.process();
                        }
                        catch (e) {
                            console.error(e);
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach((key) => this.clients.delete(key));
                });
            }
            catch (e) {
                console.error(e);
            }
            setTimeout(this.run.bind(this), 300);
        }
    }
}
exports.Flooder = Flooder;
//# sourceMappingURL=Flooder.js.map