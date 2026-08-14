import assert = require("assert");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { NpcSpawnDefinition } from "../src/main/typescript/elvarg/game/definition/NpcSpawnDefinition";
import { NpcDefinitionLoader } from "../src/main/typescript/elvarg/game/definition/loader/impl/NpcDefinitionLoader";
import { NpcSpawnDefinitionLoader } from "../src/main/typescript/elvarg/game/definition/loader/impl/NpcSpawnDefinitionLoader";
import { DefinitionLoader } from "../src/main/typescript/elvarg/game/definition/loader/DefinitionLoader";
import { Direction } from "../src/main/typescript/elvarg/game/model/Direction";
import { Systems } from "../src/main/typescript/elvarg/game/Systems";
import { World } from "../src/main/typescript/elvarg/game/World";

async function main() {
    await CachePipeline.initialize();
    Systems.init();
    new NpcDefinitionLoader().load();
    require("../plugins/npcs/NpcSpawns.plugin.js").register({
        registerDefinitionSource(type: string, source: any) {
            DefinitionLoader.registerSource(type, "NpcSpawns", source);
        },
    });

    assert(new NpcSpawnDefinitionLoader().load());
    assert.equal(NpcSpawnDefinition.all().length, 24_145);
    assert.equal(World.getNpcs().sizeReturn(), 24_145);

    const banker = NpcSpawnDefinition.all().find(
        (spawn) => spawn.getId() === 8589 && spawn.getPosition().getX() === 1248,
    );
    assert(banker);
    assert.equal(banker.getFacing(), Direction.SOUTH);
    assert.equal(banker.getRadius(), 0);
    assert(World.isNpcOccupyingTile(banker.getPosition()));

    const first = NpcSpawnDefinition.all()[0];
    assert.equal(first.getRadius(), 5);
    console.info("npc spawn config loaded into spatial buckets");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
