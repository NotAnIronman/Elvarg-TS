import { GameConstants } from "../../../GameConstants";
import { DefinitionLoader } from "../DefinitionLoader";
import { NpcDropDefinition } from "../../NpcDropDefinition";
import * as fs from "fs"

export class NpcDropDefinitionLoader extends DefinitionLoader {
    load() {
        NpcDropDefinition.definitions.clear();
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: Array<{ npcIds: number[] }> = JSON.parse(content);
        for (const def of defs as any[]) {
            for (const npcId of def.npcIds ?? []) {
                NpcDropDefinition.definitions.set(npcId, def as any);
            }
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "npc_drops.json";
    }
}
