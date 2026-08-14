import { GameConstants } from "../../../GameConstants";
import { DefinitionLoader } from "../DefinitionLoader";
import { NPCDrop, NpcDropDefinition } from "../../NpcDropDefinition";
import * as fs from "fs"

export class NpcDropDefinitionLoader extends DefinitionLoader {
    load() {
        NpcDropDefinition.definitions.clear();
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: Array<any> = JSON.parse(content);
        for (const raw of defs) {
            const inst = new NpcDropDefinition() as any;
            Object.assign(inst, {
                npcIds: raw.npcIds ?? [],
                rdtChance: raw.rdtChance ?? 0,
                alwaysDrops: this.mapDrops(raw.alwaysDrops),
                commonDrops: this.mapDrops(raw.commonDrops),
                uncommonDrops: this.mapDrops(raw.uncommonDrops),
                rareDrops: this.mapDrops(raw.rareDrops),
                veryRareDrops: this.mapDrops(raw.veryRareDrops),
                specialDrops: this.mapDrops(raw.specialDrops),
            });

            for (const npcId of inst.getNpcIds() ?? []) {
                NpcDropDefinition.definitions.set(npcId, inst);
            }
        }
    }

    private mapDrops(rawDrops: any): NPCDrop[] {
        if (!Array.isArray(rawDrops)) {
            return [];
        }
        return rawDrops.map((drop) =>
            new NPCDrop(
                Number(drop?.itemId ?? 0),
                Number(drop?.minAmount ?? 0),
                Number(drop?.maxAmount ?? 0),
                drop?.chance != null ? Number(drop.chance) : undefined
            )
        );
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "npc_drops.json";
    }
}
