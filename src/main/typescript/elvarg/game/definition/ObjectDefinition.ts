import { CacheDefinitions } from "../cache/CacheDefinitions";
import { ObjectIdentifiers } from "../../util/ObjectIdentifiers";

export class ObjectDefinition extends ObjectIdentifiers {
    private static readonly definitions = new Map<number, ObjectDefinition>();
    static totalObjects = 0;

    id: number;
    name: string;
    description?: string;
    clipType: number;
    private readonly sizeX: number;
    private readonly sizeY: number;
    private readonly projectileBlocking: boolean;
    private readonly blockingMask: number;
    private readonly interactive: boolean;
    private readonly interactions: string[] | null;
    private readonly minimapFunction: number;

    private constructor(id: number) {
        super();
        const cached = CacheDefinitions.getObject(id);
        this.id = id;
        this.name = cached.name;
        this.description = cached.desc;
        this.clipType = cached.clipType;
        this.sizeX = cached.sizeX;
        this.sizeY = cached.sizeY;
        this.projectileBlocking = cached.blocksProjectile;
        this.blockingMask = cached.clipMask;
        this.interactive = cached.isInteractive === 1;
        this.interactions = cached.actions?.some(Boolean) ? [...cached.actions] : null;
        this.minimapFunction = cached.mapFunctionId;
    }

    static init(): void {
        this.definitions.clear();
        this.totalObjects = CacheDefinitions.getCounts().objects;
    }

    static forId(id: number): ObjectDefinition | undefined {
        if (!Number.isInteger(id) || id < 0 || id >= this.totalObjects) return undefined;
        let definition = this.definitions.get(id);
        if (!definition) {
            definition = new ObjectDefinition(id);
            this.definitions.set(id, definition);
        }
        return definition;
    }

    isClippedDecoration(): boolean {
        return this.interactive || this.clipType === 1;
    }

    getName(): string { return this.name; }
    getSizeX(): number { return this.sizeX; }
    getSizeY(): number { return this.sizeY; }
    hasActions(): boolean { return this.interactive; }
    isSolid(): boolean { return this.clipType !== 0; }
    isImpenetrable(): boolean { return this.projectileBlocking; }
    getBlockingMask(): number { return this.blockingMask; }
    getInteractions(): string[] | null { return this.interactions; }
    getMinimapFunction(): number { return this.minimapFunction; }

    getSize(): number {
        switch (this.id) {
            case ObjectDefinition.BARROWS_STAIRCASE_AHRIM:
            case ObjectDefinition.BARROWS_STAIRCASE_DHAROK:
            case ObjectDefinition.BARROWS_STAIRCASE_GUTHAN:
            case ObjectDefinition.BARROWS_STAIRCASE_KARIL:
            case ObjectDefinition.BARROWS_STAIRCASE_VERAC:
                return 2;
            case ObjectDefinition.BARROWS_STAIRCASE_TORAG:
                return 3;
            default:
                return this.sizeX + this.sizeY - 1;
        }
    }
}
