import { strict as assert } from "assert";

const plugin = require("../plugins/interface/VengeanceTimer.plugin.js");

let loginHandler: any;
let processHandler: any;
let logoutHandler: any;

plugin.register({
  onPlayerLogin: (handler: any) => { loginHandler = handler; },
  onPlayerProcess: (handler: any) => { processHandler = handler; },
  onPlayerLogout: (handler: any) => { logoutHandler = handler; },
});

let remaining = 0;
const updates: Array<[number, number]> = [];
const player = {
  getVengeanceTimer: () => ({ secondsRemaining: () => remaining }),
  getPacketSender: () => ({
    sendVarbit: (id: number, value: number) => updates.push([id, value]),
  }),
};

loginHandler({ player });
assert.deepEqual(updates, [[2451, 0]]);

processHandler({ player });
assert.equal(updates.length, 1, "unchanged cooldown state should not resend the varbit");

remaining = 30;
processHandler({ player });
assert.deepEqual(updates.at(-1), [2451, 1]);

remaining = 0;
processHandler({ player });
assert.deepEqual(updates.at(-1), [2451, 0]);

logoutHandler({ player });
console.log("vengeance timer plugin smoke test passed");
