import * as fs from "fs"
import { GameConstants } from "../../../GameConstants";
import { World } from "../../../World";
import { NpcSpawnDefinition } from "../../NpcSpawnDefinition";
import { DefinitionLoader } from "../DefinitionLoader";
import { NPC } from "../../../entity/impl/npc/NPC";
import { Location } from "../../../model/Location";



export class NpcSpawnDefinitionLoader extends DefinitionLoader {
    // For bring-up, only load a single nearby spawn to reduce noise.
    private static TEST_SPAWN = {
        id: 0, // change to a visible npc id as needed
        position: { x: 3090, y: 3525, z: 0 },
        radius: 0, // keep stationary while pathing is debugged
        facing: -1,
    };

    load() {
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: NpcSpawnDefinition[] = [NpcSpawnDefinitionLoader.TEST_SPAWN as any];
        for (const def of defs as any[]) {
            const z = def.position.z ?? 0;
            const pos = new Location(def.position.x, def.position.y, z);
            const npc = NPC.create(def.id, pos);
            npc.getMovementCoordinator().setRadius(def.radius ?? 0);
            npc.setFace(def.facing ?? -1);
            World.addNPCQueue.push(npc);
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "npc_spawns.json";
    }
}
