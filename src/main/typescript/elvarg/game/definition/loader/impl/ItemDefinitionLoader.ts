import { GameConstants } from "../../../GameConstants";
import { ItemDefinition } from "../../ItemDefinition";
import { DefinitionLoader } from "../DefinitionLoader";
import * as fs from "fs";

const getEquipmentType = () =>
  require("../../../model/EquipmentType")
    .EquipmentType as typeof import("../../../model/EquipmentType").EquipmentType;
const getWeaponInterfaces = () =>
  require("../../../content/combat/WeaponInterfaces")
    .WeaponInterfaces as typeof import("../../../content/combat/WeaponInterfaces").WeaponInterfaces;

export class ItemDefinitionLoader extends DefinitionLoader {
    private hydrateEquipmentType(raw: unknown): unknown {
        const EquipmentType = getEquipmentType();
        if (raw && typeof (raw as any).getSlot === "function") {
            return raw;
        }
        if (typeof raw === "string" && (EquipmentType as any)[raw] != null) {
            return (EquipmentType as any)[raw];
        }
        return EquipmentType.NONE;
    }

    private hydrateWeaponInterface(raw: unknown): unknown {
        const WeaponInterfaces = getWeaponInterfaces();
        if (raw == null) {
            return null;
        }
        if (raw && typeof (raw as any).getInterfaceId === "function") {
            return raw;
        }
        if (typeof raw === "string" && (WeaponInterfaces as any)[raw] != null) {
            return (WeaponInterfaces as any)[raw];
        }
        return null;
    }

    load() {
        ItemDefinition.definitions.clear();
        const content = fs.readFileSync(this.file(), "utf8");
        const defs: any[] = JSON.parse(content);
        for (const rawDef of defs) {
            // Hydrate plain JSON into ItemDefinition instances so method-based
            // accessors (e.g. isStackable()) are always available.
            const def = Object.assign(new ItemDefinition(), rawDef);
            (def as any).equipmentType = this.hydrateEquipmentType(
                (rawDef as any).equipmentType
            );
            (def as any).weaponInterface = this.hydrateWeaponInterface(
                (rawDef as any).weaponInterface
            );
            const id = (rawDef as any).id ?? (def as any).getId?.();
            ItemDefinition.definitions.set(id, def);
        }
    }

    file(): string {
        return GameConstants.DEFINITIONS_DIRECTORY + "items.json";
    }
}
