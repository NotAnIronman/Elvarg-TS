import { GameConstants } from "../../../GameConstants";
import { ItemDefinition } from "../../ItemDefinition";
import { DefinitionLoader } from "../DefinitionLoader";
import * as fs from "fs";

export class ItemDefinitionLoader extends DefinitionLoader {
    load() {
        ItemDefinition.definitions.clear();
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: ItemDefinition[] = JSON.parse(content);
        for (const def of defs) {
            ItemDefinition.definitions.set((def as any).id ?? (def as any).getId?.(), def as any);
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "items.json";
    }
}
