import { DefinitionLoader } from '../DefinitionLoader';
import { GameConstants } from '../../../GameConstants';
import { ObjectSpawnDefinition } from '../../ObjectSpawnDefinition';
import { GameObject } from '../../../entity/impl/object/GameObject';
import { ObjectManager } from '../../../entity/impl/object/ObjectManager';
import * as fs from "fs";
import { Location } from '../../../model/Location';

export class ObjectSpawnDefinitionLoader extends DefinitionLoader {
    load() {
        const filePath = this.file();
        const content = fs.readFileSync(filePath, "utf8");
        const defs: Array<{ id: number; position: { x: number; y: number; z: number }; type?: number; face?: number }> = JSON.parse(content);
        for (const def of defs) {
            const spawn = new ObjectSpawnDefinition(def.id, new Location(def.position.x, def.position.y, def.position.z));
            const type = def.type ?? spawn.getType();
            const face = def.face ?? spawn.getFace();
            ObjectManager.register(
                new GameObject(def.id, spawn.getPosition(), type, face, null),
                true
            );
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "object_spawns.json";
    }
}
