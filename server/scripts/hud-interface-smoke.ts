// Checks the HUD overlays the area plugins open actually exist in the active OSRS cache:
// the components they write text into are text components, and the toplevel slots they
// mount into are layers.
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/hud-interface-smoke.ts
import assert = require("assert");
import path = require("path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { CacheIndexDat2 } from "../src/main/typescript/elvarg/game/cache/codec/rs/cache/CacheIndex";
import { IndexType } from "../src/main/typescript/elvarg/game/cache/codec/rs/cache/IndexType";

const TYPE_LAYER = 0;
const TYPE_TEXT = 4;
const TYPE_GRAPHIC = 5;

async function main() {
    await CachePipeline.initialize(path.resolve(__dirname, ".."));
    const index = CacheIndexDat2.fromStore(IndexType.DAT2.interfaces, CachePipeline.getStore());

    const components: Array<[number, number, number, string]> = [
        // Mount slots on toplevel_osrs_stretch.
        [161, 3, TYPE_LAYER, "toplevel:pvp_icons (wilderness overlay slot)"],
        [161, 8, TYPE_LAYER, "toplevel:overlay_hud (castle wars overlay slot)"],
        // Server-written text.
        [131, 2, TYPE_TEXT, "castlewars_waitingroom:content"],
        [58, 26, TYPE_TEXT, "castlewars_status_overlay_saradomin:eject"],
        [59, 25, TYPE_TEXT, "castlewars_status_overlay_zamorak:eject"],
        // Client-written text, so only its presence matters.
        [90, 49, TYPE_TEXT, "pvp_icons:combatrange"],
        [90, 50, TYPE_TEXT, "pvp_icons:wildernesslevel"],
        // Toggled by the server: the icon block outside the wilderness, and the safe badge
        // until safe zones exist.
        [90, 43, TYPE_LAYER, "pvp_icons:icons_dodger"],
        [90, 47, TYPE_GRAPHIC, "pvp_icons:pvpw_safe"],
    ];

    for (const [groupId, componentId, type, name] of components) {
        const file = index.getFile(groupId, componentId);
        assert.ok(file, `${name} (${groupId}:${componentId}) missing from the cache`);
        const data = new Int8Array(file.data);
        assert.strictEqual(data[0] & 0xff, 0xff, `${name} (${groupId}:${componentId}) is not IF3`);
        assert.strictEqual(data[1], type, `${name} (${groupId}:${componentId}) has the wrong component type`);
    }

    console.log(`hud interfaces ok: ${components.length} components resolved`);
}

main().catch((e) => { console.error(e); process.exit(1); });
