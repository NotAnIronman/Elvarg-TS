import { strict as assert } from "assert";
import * as path from "node:path";

type EmoteHandler = (event: { player: FakePlayer; slot: number; action: number }) => boolean;

class FakePlayer {
    animations: number[] = [];
    graphics: number[] = [];
    messages: string[] = [];
    interfaceFlags: number[][] = [];
    stoppedSkill = false;
    resetMovement = false;
    following: unknown = this;
    isBusy = false;
    capeId?: number;

    busy(): boolean {
        return this.isBusy;
    }

    getPacketSender() {
        return {
            sendInterfaceFlagsRange: (...args: number[]) => this.interfaceFlags.push(args),
            sendMessage: (message: string) => this.messages.push(message),
        };
    }

    getEquipment() {
        const items: unknown[] = [];
        if (this.capeId !== undefined) {
            items[1] = { getId: () => this.capeId };
        }
        return { getItems: () => items };
    }

    getSkillManager() {
        return { stopSkillable: () => { this.stoppedSkill = true; } };
    }

    getMovementQueue() {
        return { reset: () => { this.resetMovement = true; } };
    }

    setFollowing(target: unknown): void {
        this.following = target;
    }

    performAnimation(animation: { getId(): number }): void {
        this.animations.push(animation.getId());
    }

    performGraphic(graphic: { getId(): number }): void {
        this.graphics.push(graphic.getId());
    }
}

let loginHandler: ((event: { player: FakePlayer }) => void) | undefined;
const interfaceHandlers = new Map<number, EmoteHandler>();
let inCombat = false;

const pluginPath = path.resolve(__dirname, "../plugins/interface/Emotes.plugin.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require(pluginPath);
plugin.register({
    getCombatFactory: () => ({ inCombat: () => inCombat }),
    onPlayerLogin: (handler: typeof loginHandler) => { loginHandler = handler; },
    onInterfaceActionButton: (buttonId: number, handler: EmoteHandler) => {
        interfaceHandlers.set(buttonId, handler);
    },
    log: () => undefined,
});

assert.ok(loginHandler, "plugin should register a login handler");
const emoteHandler = interfaceHandlers.get((216 << 16) | 2);
assert.ok(emoteHandler, "plugin should register an emote button handler");
const welcomePlayHandler = interfaceHandlers.get((378 << 16) | 72);
assert.ok(welcomePlayHandler, "plugin should restore flags after the welcome screen");

async function run(): Promise<void> {
    const loginPlayer = new FakePlayer();
    loginHandler({ player: loginPlayer });
    assert.deepEqual(loginPlayer.interfaceFlags, [], "flags must wait for the gameframe root");
    await Promise.resolve();
    assert.deepEqual(loginPlayer.interfaceFlags, [[(216 << 16) | 2, 0, 55, 6]]);

    loginPlayer.interfaceFlags = [];
    assert.equal(
        welcomePlayHandler({ player: loginPlayer, slot: -1, action: 1 }),
        false,
        "the welcome-screen plugin must still receive the click",
    );
    await Promise.resolve();
    assert.deepEqual(loginPlayer.interfaceFlags, [[(216 << 16) | 2, 0, 55, 6]]);

    const performPlayer = new FakePlayer();
    assert.equal(emoteHandler({ player: performPlayer, slot: 0, action: 1 }), true);
    assert.deepEqual(performPlayer.animations, [855]);
    assert.equal(performPlayer.stoppedSkill, true);
    assert.equal(performPlayer.resetMovement, true);
    assert.equal(performPlayer.following, null);

    const loopPlayer = new FakePlayer();
    emoteHandler({ player: loopPlayer, slot: 0, action: 2 });
    assert.deepEqual(loopPlayer.animations, [189]);

    const loopFirstPlayer = new FakePlayer();
    emoteHandler({ player: loopFirstPlayer, slot: 54, action: 1 });
    emoteHandler({ player: loopFirstPlayer, slot: 54, action: 2 });
    assert.deepEqual(loopFirstPlayer.animations, [10061, 10053]);

    const variantPlayer = new FakePlayer();
    emoteHandler({ player: variantPlayer, slot: 47, action: 1 });
    emoteHandler({ player: variantPlayer, slot: 47, action: 1 });
    assert.deepEqual(variantPlayer.animations, [7536, 7537]);

    const skillcapePlayer = new FakePlayer();
    skillcapePlayer.capeId = 9747;
    emoteHandler({ player: skillcapePlayer, slot: 43, action: 1 });
    assert.deepEqual(skillcapePlayer.animations, [4959]);
    assert.deepEqual(skillcapePlayer.graphics, [823]);

    const noCapePlayer = new FakePlayer();
    emoteHandler({ player: noCapePlayer, slot: 43, action: 1 });
    assert.deepEqual(noCapePlayer.animations, []);
    assert.match(noCapePlayer.messages[0], /wearing a skillcape/);

    for (let slot = 0; slot <= 55; slot++) {
        const player = new FakePlayer();
        player.capeId = 9747;
        assert.equal(emoteHandler({ player, slot, action: 1 }), true, `slot ${slot} should be handled`);
        assert.equal(player.animations.length, 1, `slot ${slot} should play an animation`);
    }

    const busyPlayer = new FakePlayer();
    busyPlayer.isBusy = true;
    emoteHandler({ player: busyPlayer, slot: 0, action: 1 });
    assert.deepEqual(busyPlayer.animations, []);
    assert.match(busyPlayer.messages[0], /cannot do this right now/);

    const combatPlayer = new FakePlayer();
    inCombat = true;
    emoteHandler({ player: combatPlayer, slot: 0, action: 1 });
    assert.deepEqual(combatPlayer.animations, []);
    inCombat = false;

    assert.equal(emoteHandler({ player: new FakePlayer(), slot: 56, action: 1 }), false);

    console.log("Emotes plugin smoke test passed.");
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
