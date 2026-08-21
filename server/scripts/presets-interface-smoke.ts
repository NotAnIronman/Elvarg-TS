// Opens the Presets interface for a stub player and checks what the server sends: the
// widget group is mounted, both preset lists are filled, and selecting one renders its
// combat levels, spellbook, inventory and equipment into the right components.
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/presets-interface-smoke.ts
import { strict as assert } from "assert";
import path = require("path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";

// PrayerHandler <-> QuickPrayers is a require cycle that only resolves when the server
// boots in its usual order; the preset renderer never touches prayers, so stub it out.
const prayerHandlerPath = require.resolve(
  "../src/main/typescript/elvarg/game/content/PrayerHandler"
);
require.cache[prayerHandlerPath] = {
  exports: { PrayerHandler: {}, PrayerData: { values: () => [] } },
} as NodeModule;

const {
  GROUP_ID,
  COMPONENT,
  GLOBAL_ROW_START,
  CUSTOM_ROW_START,
  INVENTORY_SLOT_START,
  EQUIPMENT_SLOT_START,
  STAT_ROW_START,
  uid,
} = require("../plugins/interface/presetsWidget");
const Presets = require("../plugins/interface/Presets.plugin");

type Sent = { call: string; args: any[] };

function stubPlayer(sent: Sent[]) {
  const record = (call: string) => (...args: any[]) => {
    sent.push({ call, args });
    return sender;
  };
  const sender: any = new Proxy(
    {
      sendString: record("sendString"),
      sendItemOnInterfaces: record("sendItemOnInterfaces"),
      sendSubInterface: record("sendSubInterface"),
      sendMessage: record("sendMessage"),
    },
    { get: (target, property) => (target as any)[property] ?? (() => sender) }
  );

  let currentPreset: any = null;
  let presets: any[] = [];
  let interfaceId = -1;
  let openOnDeath = false;
  return {
    getPacketSender: () => sender,
    getCurrentPreset: () => currentPreset,
    setCurrentPreset: (preset: any) => {
      currentPreset = preset;
    },
    getPresets: () => presets,
    setPresets: (next: any[]) => {
      presets = next;
    },
    getInterfaceId: () => interfaceId,
    setInterfaceId: (id: number) => {
      interfaceId = id;
    },
    isOpenPresetsOnDeath: () => openOnDeath,
    setOpenPresetsOnDeath: (value: boolean) => {
      openOnDeath = value;
    },
    isPlayerBot: () => false,
    busy: () => false,
    getLocation: () => null,
  };
}

async function main() {
    await CachePipeline.initialize(path.resolve(__dirname, ".."));

    let openPresets: ((event: any) => boolean) | undefined;
    let actionButtons: ((event: any) => boolean) | undefined;
    let registeredGroupId = -1;
    let registeredWidgets = 0;

    const api = new Proxy<any>(
        {
            registerCustomInterface: (definition: any) => {
                registeredGroupId = definition.groupId;
                registeredWidgets = definition.widgets.length;
            },
            registerCommand: (command: string, handler: any) => {
                if (command === "presets") openPresets = handler;
            },
            onInterfaceActionButton: (_ids: number[], handler: any) => {
                actionButtons = handler;
            },
        },
        { get: (target, property) => (target as any)[property] ?? (() => undefined) }
    );
    Presets.register(api);

    assert.equal(registeredGroupId, GROUP_ID, "the interface must be registered as a resource");
    assert.ok(registeredWidgets > 100, "the widget group travels with it");
    assert.ok(openPresets, "::presets must be registered for everyone");

    // Opening mounts the group and fills both preset lists.
    const sent: Sent[] = [];
    const player = stubPlayer(sent);
    openPresets!({ player });

    const mount = sent.find((entry) => entry.call === "sendSubInterface");
    assert.ok(mount, "opening must mount the interface");
    assert.equal(mount!.args[1], GROUP_ID);
    assert.equal(player.getInterfaceId(), GROUP_ID, "the open interface is tracked");

    const stringAt = (component: number) =>
        [...sent].reverse().find(
            (entry) => entry.call === "sendString" && entry.args[1] === uid(component)
        )?.args[0];
    assert.match(String(stringAt(GLOBAL_ROW_START)), /\w/, "global presets are listed");
    assert.match(String(stringAt(CUSTOM_ROW_START)), /Empty slot/, "empty slots say so");
    assert.equal(stringAt(COMPONENT.SELECTED_NAME), "No preset selected");
    assert.match(String(stringAt(COMPONENT.LOAD_BUTTON + 50)), /Load preset/);
    assert.match(String(stringAt(COMPONENT.DEATH_BUTTON + 50)), /On death/);

    // Selecting a global preset renders it without applying anything.
    sent.length = 0;
    const preset = Presets.getGlobalPresetPool()[0];
    actionButtons!({ player, buttonId: uid(GLOBAL_ROW_START) });
    assert.equal(player.getCurrentPreset(), preset, "the row selects that preset");
    assert.equal(stringAt(COMPONENT.SELECTED_NAME), preset.getName());
    assert.match(String(stringAt(STAT_ROW_START)), /^Attack: /, "combat levels are rendered");
    assert.match(String(stringAt(COMPONENT.SPELLBOOK)), /^Spellbook: /);

    const items = sent.filter((entry) => entry.call === "sendItemOnInterfaces");
    const inventorySlots = items.filter(
        (entry) => entry.args[0] >= uid(INVENTORY_SLOT_START) && entry.args[0] < uid(INVENTORY_SLOT_START + 28)
    );
    assert.equal(inventorySlots.length, 28, "every inventory slot is written, filled or not");
    assert.ok(
        inventorySlots.some((entry) => entry.args[1] > 0),
        "the preset's inventory is shown"
    );
    const equipped = items.filter(
        (entry) =>
            entry.args[0] >= uid(EQUIPMENT_SLOT_START) &&
            entry.args[0] < uid(EQUIPMENT_SLOT_START + 14) &&
            entry.args[1] > 0
    );
    assert.ok(equipped.length > 0, "the preset's equipment is shown");

    // Closing releases the interface.
    actionButtons!({ player, buttonId: uid(COMPONENT.CLOSE) });
    assert.equal(player.getInterfaceId(), -1);

    console.log(
        `presets interface ok: ${registeredWidgets} widgets, '${preset.getName()}' -> ` +
            `${inventorySlots.filter((entry) => entry.args[1] > 0).length} items, ` +
            `${equipped.length} equipped`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
