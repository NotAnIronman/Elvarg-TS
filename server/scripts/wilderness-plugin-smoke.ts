// Drives the Wilderness plugin's login/process hooks with a stub player: the pvp_icons
// overlay is mounted once and shown or hidden as the player crosses the ditch.
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/wilderness-plugin-smoke.ts
import { strict as assert } from "assert";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";

const Wilderness = require("../plugins/areas/Wilderness.plugin");

const PVP_ICONS_TARGET_UID = (161 << 16) | 3;
const PVP_ICONS_UID = (90 << 16) | 43;

const IN_WILDERNESS = new Location(3100, 3600, 0);
const OUTSIDE = new Location(3100, 3500, 0);

let process: ((event: any) => void) | undefined;
let login: ((event: any) => void) | undefined;

function register() {
    const api = new Proxy<any>({
        onPlayerProcess: (handler: any) => { process = handler; },
        onPlayerLogin: (handler: any) => { login = handler; },
    }, {
        get: (target, property) => target[property] ?? (() => undefined),
    });

    Wilderness.register(api);
    assert.ok(process && login, "plugin must register login and process hooks");
}

function overlayFollowsTheDitch() {

    const sent: Array<{ call: string; args: any[] }> = [];
    let location = OUTSIDE;
    let wildernessLevel = 0;
    let multiIcon = 0;
    const sender = new Proxy<any>({
        sendSubInterface: (...args: any[]) => sent.push({ call: "sendSubInterface", args }),
        sendInterfaceDisplayState: (...args: any[]) => sent.push({ call: "sendInterfaceDisplayState", args }),
    }, {
        get: (target, property) => target[property] ?? (() => sender),
    });
    const player = {
        getLocation: () => location,
        getPacketSender: () => sender,
        getWildernessLevel: () => wildernessLevel,
        setWildernessLevel: (level: number) => { wildernessLevel = level; },
        getMultiIcon: () => multiIcon,
        setMultiIcon: (icon: number) => { multiIcon = icon; },
    };

    // Only the resulting state matters; the entry re-mount re-sends the same value.
    const hidden = () => {
        const events = sent.filter((s) => s.call === "sendInterfaceDisplayState"
            && s.args[0] === PVP_ICONS_UID);
        assert.ok(events.length > 0, "expected the icon block visibility to be sent");
        return events[events.length - 1].args[1];
    };
    const mounts = () => sent.filter((s) => s.call === "sendSubInterface"
        && s.args[0] === PVP_ICONS_TARGET_UID).length;

    // Login outside the wilderness: mounted, block hidden.
    login!({ player });
    assert.equal(mounts(), 1, "login must mount the pvp_icons overlay");
    assert.equal(hidden(), true, "login outside the wilderness must hide the icon block");

    // The login mount is retried a few ticks later; keep ticking until it lands.
    sent.length = 0;
    for (let i = 0; i < 6; i++) process!({ player });
    assert.equal(mounts(), 1, "the queued re-mount must fire exactly once");
    assert.equal(hidden(), true, "the re-mount must keep the block hidden outside the wilderness");

    // Step into the wilderness. Visibility reconverges from the wilderness level, so the
    // tick that sets the level is followed by the tick that sends the state.
    sent.length = 0;
    location = IN_WILDERNESS;
    process!({ player });
    process!({ player });
    assert.equal(hidden(), false, "entering the wilderness must show the icon block");
    assert.ok(wildernessLevel > 0, "entering the wilderness must set a wilderness level");

    // Step back out.
    sent.length = 0;
    location = OUTSIDE;
    process!({ player });
    process!({ player });
    assert.equal(hidden(), true, "leaving the wilderness must hide the icon block");
    assert.equal(wildernessLevel, 0, "leaving the wilderness must clear the wilderness level");

    console.log("overlay ok: mounted once, hidden outside the wilderness");
}

register();
overlayFollowsTheDitch();
