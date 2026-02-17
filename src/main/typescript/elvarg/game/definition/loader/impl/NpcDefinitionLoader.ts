import { GameConstants } from "../../../GameConstants";
import { NpcDefinition } from "../../NpcDefinition";
import { DefinitionLoader } from "../DefinitionLoader";
import * as fs from "fs";

export class NpcDefinitionLoader extends DefinitionLoader {
    load() {
        NpcDefinition.definitions.clear();
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: Array<any> = JSON.parse(content);
        for (const def of defs) {
            const inst = new NpcDefinition() as any;
            Object.assign(inst, def);
            NpcDefinition.definitions.set(def.id, inst);
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "npc_defs.json";
    }
}
