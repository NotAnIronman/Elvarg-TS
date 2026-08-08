import { World } from "../../../World";
import { NpcDefinition } from "../../NpcDefinition";
import { NpcSpawnDefinition } from "../../NpcSpawnDefinition";
import { NPC } from "../../../entity/impl/npc/NPC";
import { Direction } from "../../../model/Direction";
import { Location } from "../../../model/Location";
import { DefinitionLoader } from "../DefinitionLoader";
import { CacheDefinitions } from "../../../cache/CacheDefinitions";

interface RawNpcSpawnDefinition {
    id: number;
    x: number;
    y: number;
    z: number;
    radius?: number | null;
    facing?: number;
    description?: string;
}

export class NpcSpawnDefinitionLoader extends DefinitionLoader {
    public static readonly DEFINITION_TYPE = "npc_spawns";
    private static readonly spawnedNpcs = new Set<NPC>();

    public load(): boolean {
        const loaded = this.loadSources<RawNpcSpawnDefinition>(
            NpcSpawnDefinitionLoader.DEFINITION_TYPE
        );
        const definitionsByKey = new Map<string, NpcSpawnDefinition>();
        let totalCandidates = 0;
        let invalid = 0;
        let unsupported = 0;

        for (const source of loaded.sources) {
            totalCandidates += source.definitions.length;
            for (const raw of source.definitions) {
                const definition = this.toDefinition(raw, source.name);
                if (!definition) {
                    invalid++;
                    continue;
                }
                if (
                    source.name !== "elvarg" &&
                    definition.getId() >= CacheDefinitions.getCounts().npcs
                ) {
                    unsupported++;
                    continue;
                }
                definitionsByKey.set(this.key(definition), definition);
            }
        }

        const definitions = Array.from(definitionsByKey.values());
        NpcSpawnDefinition.replace(definitions);
        const applied = this.applyToWorld(definitions);
        console.info(
            `[npc-spawns] Loaded ${definitions.length} definitions from ` +
            `${loaded.sources.map((source) => source.name).join("+") || "none"} ` +
            `(candidates=${totalCandidates}, invalid=${invalid}, unsupported=${unsupported}, ` +
            `applied=${applied})`
        );
        return loaded.failures === 0;
    }

    public file(): string {
        return NpcSpawnDefinitionLoader.DEFINITION_TYPE;
    }

    private toDefinition(
        raw: RawNpcSpawnDefinition,
        source: string
    ): NpcSpawnDefinition | null {
        const id = Math.trunc(Number(raw?.id));
        const x = Math.trunc(Number(raw?.x));
        const y = Math.trunc(Number(raw?.y));
        const z = Math.trunc(Number(raw?.z));
        if (
            !Number.isFinite(id) ||
            id < 0 ||
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {
            return null;
        }

        const facingId = Number.isFinite(raw.facing)
            ? Math.trunc(raw.facing as number)
            : -1;
        const radius = Number.isFinite(raw.radius)
            ? Math.max(0, Math.trunc(raw.radius as number))
            : null;
        return new NpcSpawnDefinition(
            id,
            new Location(x, y, z),
            Direction.valueOf(facingId),
            radius,
            String(raw.description ?? ""),
            source
        );
    }

    private key(definition: NpcSpawnDefinition): string {
        const position = definition.getPosition();
        return `${definition.getId()}:${position.getX()}:${position.getY()}:${position.getZ()}`;
    }

    private applyToWorld(definitions: NpcSpawnDefinition[]): number {
        this.removePreviouslyAppliedNpcs();
        const availableCapacity = Math.max(
            0,
            World.getNpcs().capacityReturn() - World.getNpcs().sizeReturn() - 1
        );
        let applied = 0;
        for (const definition of definitions.slice(0, availableCapacity)) {
            const npc = NPC.create(definition.getId(), definition.getPosition());
            npc.getMovementCoordinator().setRadius(
                this.resolveRadius(npc, definition.getRadius())
            );
            npc.setFace(definition.getFacing());

            const describedNpc = npc as NPC & {
                setDescription?(description: string): void;
            };
            if (definition.getDescription() && describedNpc.setDescription) {
                describedNpc.setDescription(definition.getDescription());
            }
            if (World.getNpcs().add(npc)) {
                NpcSpawnDefinitionLoader.spawnedNpcs.add(npc);
                applied++;
            }
        }

        for (const player of World.getPlayers()) {
            const localNpcs = player.getLocalNpcs();
            if (Array.isArray(localNpcs)) {
                localNpcs.length = 0;
            }
        }
        return applied;
    }

    private removePreviouslyAppliedNpcs(): void {
        const addQueue = World.getAddNPCQueue();
        const removeQueue = World.getRemoveNPCQueue();
        for (const npc of NpcSpawnDefinitionLoader.spawnedNpcs) {
            for (let index = addQueue.indexOf(npc); index !== -1; index = addQueue.indexOf(npc)) {
                addQueue.splice(index, 1);
            }
            for (
                let index = removeQueue.indexOf(npc);
                index !== -1;
                index = removeQueue.indexOf(npc)
            ) {
                removeQueue.splice(index, 1);
            }
            if (npc.isRegistered()) {
                World.getNpcs().remove(npc);
            }
        }
        NpcSpawnDefinitionLoader.spawnedNpcs.clear();
    }

    private resolveRadius(npc: NPC, explicitRadius: number | null): number {
        if (explicitRadius != null) {
            return explicitRadius;
        }
        const definitionRadius = Number(npc.getDefinition()?.getWalkRadius?.());
        if (Number.isFinite(definitionRadius) && definitionRadius > 0) {
            return Math.max(0, Math.trunc(definitionRadius));
        }
        const size = Number(npc.getSize());
        return Number.isFinite(size) && size > 0
            ? Math.max(0, Math.trunc(size) + 5)
            : 0;
    }
}
