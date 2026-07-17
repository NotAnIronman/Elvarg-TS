import * as fs from "fs";
import * as path from "path";

type RawItem = Record<string, any>;

type NormalizedItem = {
    id: number;
    name: string;
    examine: string;
    equipmentType: string;
    doubleHanded: boolean;
    stackable: boolean;
    tradeable: boolean;
    dropable: boolean;
    sellable: boolean;
    noted: boolean;
    value: number;
    bloodMoneyValue: number;
    highAlch: number;
    lowAlch: number;
    dropValue: number;
    noteId: number;
    blockAnim: number;
    standAnim: number;
    walkAnim: number;
    runAnim: number;
    standTurnAnim: number;
    turn180Anim: number;
    turn90CWAnim: number;
    turn90CCWAnim: number;
    weight: number;
    bonuses?: number[];
    requirements?: number[];
};

const DEFAULT_OUTPUT = path.resolve(process.cwd(), "data/definitions/items.json");

const toBool = (value: any, fallback = false): boolean => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    if (typeof value === "string") {
        return ["true", "yes", "1"].includes(value.toLowerCase());
    }
    return fallback;
};

const toNum = (value: any, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toString = (value: any, fallback = ""): string => {
    if (value == null) {
        return fallback;
    }
    return String(value);
};

const normalizeEquipmentType = (value: any): string => {
    const raw = toString(value, "NONE").toUpperCase();
    return raw.length > 0 ? raw : "NONE";
};

const normalizeBonuses = (raw: RawItem): number[] | undefined => {
    const bonuses = raw.bonuses ?? raw.bonus ?? raw.equipmentBonuses ?? raw.equipBonuses;
    if (!Array.isArray(bonuses)) {
        return undefined;
    }
    return bonuses.map((entry) => toNum(entry, 0));
};

const normalizeItem = (raw: RawItem): NormalizedItem => {
    const id = toNum(raw.id, -1);
    // Keep the runtime field name stable while accepting the codec/source names.
    const noteId = toNum(raw.noteLinkId ?? raw.noteId ?? raw.notedItemId ?? raw.note_id, -1);
    const stackable = toBool(raw.stackable ?? raw.isStackable, false);
    const noted = toBool(raw.noted ?? raw.isNoted, false);
    const tradeable = toBool(raw.tradeable ?? raw.tradable ?? raw.isTradeable, false);
    const value = toNum(raw.value ?? raw.price ?? raw.cost, 0);
    const highAlch = toNum(raw.highAlch ?? raw.highAlchValue, 0);
    const lowAlch = toNum(raw.lowAlch ?? raw.lowAlchValue, 0);
    const dropValue = toNum(raw.dropValue ?? raw.drop_value, value);
    const weight = toNum(raw.weight, 0);

    return {
        id,
        name: toString(raw.name, `item-${id}`),
        examine: toString(raw.examine ?? raw.description, ""),
        equipmentType: normalizeEquipmentType(raw.equipmentType ?? raw.equipment_type),
        doubleHanded: toBool(raw.doubleHanded ?? raw.double_handed, false),
        stackable,
        tradeable,
        dropable: toBool(raw.dropable ?? raw.dropableItem ?? raw.drop, tradeable),
        sellable: toBool(raw.sellable ?? raw.sellableItem, tradeable),
        noted,
        value,
        bloodMoneyValue: toNum(raw.bloodMoneyValue ?? raw.bmValue, value),
        highAlch,
        lowAlch,
        dropValue,
        noteId,
        blockAnim: toNum(raw.blockAnim, 424),
        standAnim: toNum(raw.standAnim, 808),
        walkAnim: toNum(raw.walkAnim, 819),
        runAnim: toNum(raw.runAnim, 824),
        standTurnAnim: toNum(raw.standTurnAnim, 823),
        turn180Anim: toNum(raw.turn180Anim, 820),
        turn90CWAnim: toNum(raw.turn90CWAnim, 821),
        turn90CCWAnim: toNum(raw.turn90CCWAnim, 821),
        weight,
        bonuses: normalizeBonuses(raw),
        requirements: Array.isArray(raw.requirements) ? raw.requirements.map((entry) => toNum(entry, 0)) : undefined,
    };
};

const readJson = (inputPath: string): RawItem[] => {
    const raw = fs.readFileSync(inputPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (parsed && Array.isArray(parsed.items)) {
        return parsed.items;
    }
    throw new Error(`Unsupported item input format in ${inputPath}`);
};

const main = () => {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : DEFAULT_OUTPUT;

    if (!inputPath) {
        throw new Error("Usage: yarn import:items -- <input.json> [output.json]");
    }

    const rawItems = readJson(path.resolve(process.cwd(), inputPath));
    const normalized = rawItems
        .filter((item) => item != null)
        .map(normalizeItem)
        .sort((a, b) => a.id - b.id);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

    console.log(`Wrote ${normalized.length} items to ${outputPath}`);
};

main();
