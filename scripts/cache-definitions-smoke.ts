import assert = require("assert");
import fs = require("fs");
import { CacheDefinitions } from "../src/main/typescript/elvarg/game/cache/CacheDefinitions";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { ItemDefinition } from "../src/main/typescript/elvarg/game/definition/ItemDefinition";
import { NpcDefinition } from "../src/main/typescript/elvarg/game/definition/NpcDefinition";
import { ObjectDefinition } from "../src/main/typescript/elvarg/game/definition/ObjectDefinition";
import { RegionManager } from "../src/main/typescript/elvarg/game/collision/RegionManager";
import { MapRegionReplacementManager } from "../src/main/typescript/elvarg/game/collision/MapRegionReplacementManager";
import { NpcDefinitionLoader } from "../src/main/typescript/elvarg/game/definition/loader/impl/NpcDefinitionLoader";
import { EquipmentType } from "../src/main/typescript/elvarg/game/model/EquipmentType";

async function main() {
    await CachePipeline.initialize();
    assert(!fs.existsSync("data/definitions/items.json"));
    assert(!fs.existsSync("data/definitions/npc_defs.json"));
    const counts = CacheDefinitions.getCounts();
    assert(counts.npcs > 7_748, `expected modern NPC definitions, got ${counts.npcs}`);
    assert(counts.items > 26_562, `expected modern item definitions, got ${counts.items}`);
    assert(counts.objects > 30_000, `expected modern object definitions, got ${counts.objects}`);
    assert.notEqual(CacheDefinitions.getNpc(100).name, "null");
    assert.notEqual(CacheDefinitions.getItem(4151).name, "null");
    assert.notEqual(CacheDefinitions.getObject(2213).name, "null");
    new NpcDefinitionLoader().load();
    assert.equal(NpcDefinition.forId(100).getName(), CacheDefinitions.getNpc(100).name);
    assert.equal(NpcDefinition.forId(100).getAttackAnim(), 1312);
    assert(NpcDefinition.forId(239).getMaxHit() > 1);
    require("../plugins/items/ItemDefinitionLoader.plugin.js").register({ log() {} });
    assert.equal(ItemDefinition.forId(4151).getEquipmentType(), EquipmentType.WEAPON);
    assert.equal(ItemDefinition.forId(4151).getName(), CacheDefinitions.getItem(4151).name);
    RegionManager.init();
    assert.equal(ObjectDefinition.forId(2213)?.getName(), CacheDefinitions.getObject(2213).name);
    RegionManager.loadMapFiles(3200, 3200);
    assert(RegionManager.getRegionid(12850)?.isLoaded(), "expected Lumbridge clipping to load");
    const analysis = require("../plugins/world/RegionBuildingAnalysisUtil.js");
    assert(analysis.decodeRegionTerrainData(12850));
    assert(analysis.decodeRegionObjects(12850).length > 0);
    RegionManager.loadMapFiles(3089, 3524);
    const replaced = RegionManager.getRegionid(12343);
    assert(replaced?.isLoaded(), "expected replacement region clipping to load");
    assert(replaced.clips.some((plane) => plane.some((row) => row.some(Boolean))));
    assert(MapRegionReplacementManager.getRegionPack(12343)?.equals(
        fs.readFileSync("data/regions/12343.pack"),
    ));
    console.info("cache definitions decoded", counts);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
