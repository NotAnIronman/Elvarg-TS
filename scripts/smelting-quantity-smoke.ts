// Asserts the smelting skillmulti quantity wiring. The list is routed through the mesLayer
// "continue" packet (cc_resume_pausebutton per the cache's skillmulti_itembutton_triggered
// script), whose childIndex argument is `get_varc_int 200` - the client's own "currently
// selected quantity" var, written directly by the quantity-mode buttons and the native X
// text box. So `action` on the server is already the literal quantity to make, not an op
// index - quantityForSmeltAction just needs to trust it (clamped) and default a bare/no-mode
// click (action=0) to 1. Also checks the widget transmit flags (ops 1-5 must all be allowed
// through - WidgetActionRouter.shouldTransmitAction on the client silently drops any op whose
// bit isn't set, which is what originally ate every click except plain "Make 1").
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/smelting-quantity-smoke.ts
import assert = require("assert");

// Port of xrsps-typescript/client/widgets/WidgetFlags.ts#shouldTransmitAction.
function shouldTransmitAction(flags: number, actionIndex: number): boolean {
    if (actionIndex < 0 || actionIndex > 9) return false;
    return ((flags >> (actionIndex + 1)) & 1) !== 0;
}

async function main() {
    require("../src/main/typescript/elvarg/util/ItemIdentifiers");
    require("../src/main/typescript/elvarg/game/content/combat/WeaponProfile");
    const plugin = require("../plugins/skills/Smithing.plugin.js");
    const flags = plugin.SMELTING_SKILLMULTI_OP_FLAGS;
    const quantityForSmeltAction = plugin.quantityForSmeltAction;

    for (let opId = 1; opId <= 5; opId++) {
        assert(
            shouldTransmitAction(flags, opId - 1),
            `op${opId} would be silently dropped client-side (flags=${flags})`,
        );
    }

    assert.equal(quantityForSmeltAction(0), 1, "a bare click (no mode selected) should default to 1");
    assert.equal(quantityForSmeltAction(undefined), 1, "a missing action should fall back to 1, not crash");
    assert.equal(quantityForSmeltAction(1), 1);
    assert.equal(quantityForSmeltAction(2), 2, "action is the literal quantity, not an op index");
    assert.equal(quantityForSmeltAction(5), 5);
    assert.equal(quantityForSmeltAction(10), 10);
    assert.equal(quantityForSmeltAction(28), 28, "Make All sends the literal resolved count directly");
    assert.equal(quantityForSmeltAction(999), 28, "must clamp to SMELTING_SKILLMULTI_MAX_QUANTITY");

    console.log("ok: ops 1-5 transmit, and action passes through as the literal (clamped) quantity");
}

main().catch((e) => { console.error(e); process.exit(1); });
