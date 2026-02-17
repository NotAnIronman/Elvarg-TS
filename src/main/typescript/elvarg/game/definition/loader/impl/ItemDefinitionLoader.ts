import { GameConstants } from "../../../GameConstants";
import { ItemDefinition } from "../../ItemDefinition";
import { DefinitionLoader } from "../DefinitionLoader";
import * as fs from "fs";

export class ItemDefinitionLoader extends DefinitionLoader {
    load() {
        ItemDefinition.definitions.clear();
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: any[] = JSON.parse(content);
        for (const rawDef of defs) {
            // Hydrate plain JSON into ItemDefinition instances so method-based
            // accessors (e.g. isStackable()) are always available.
            const def = Object.assign(new ItemDefinition(), rawDef);
            const id = (rawDef as any).id ?? (def as any).getId?.();
            ItemDefinition.definitions.set(id, def);
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "items.json";
    }
}
