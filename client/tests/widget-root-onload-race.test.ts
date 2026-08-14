import assert from "node:assert/strict";

import { WidgetManager } from "../widgets/WidgetManager";

const root: any = {
    uid: 900 << 16,
    id: 900 << 16,
    groupId: 900,
    fileId: 0,
    childIndex: -1,
    parentUid: -1,
    isIf3: true,
    type: 0,
    rawX: 0,
    rawY: 0,
    rawWidth: 0,
    rawHeight: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    widthMode: 1,
    heightMode: 1,
    xPositionMode: 0,
    yPositionMode: 0,
    hidden: false,
    scrollX: 0,
    scrollY: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    onLoad: [123],
};
const loader = {
    loadWidgetGroup: () => ({ root, widgets: new Map([[root.uid, root]]) }),
    getAvailableGroups: () => [900],
    clearCache: () => undefined,
};
const manager = new WidgetManager({} as never, loader as never);
let loads = 0;
manager.onLoadListener = () => loads++;

manager.setRootInterface(900);
assert.equal(loads, 0, "root onLoad must wait for a usable canvas");

manager.resize(800, 600);
assert.equal(loads, 1, "first canvas resize must run the deferred root onLoad");
assert.equal(root.width, 800);
assert.equal(root.height, 600);

manager.resize(801, 600);
assert.equal(loads, 1, "later resizes must not run root onLoad twice");

console.log("Widget root onLoad race test passed");
