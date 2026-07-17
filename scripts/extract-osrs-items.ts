import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { inflateRawSync } from "zlib";

type ItemDefinition = {
    id: number;
    name: string;
    options?: Array<string | null>;
    actions?: Array<string | null>;
    inventoryModel?: number;
    zoom2d?: number;
    xan2d?: number;
    yan2d?: number;
    zan2d?: number;
    xOffset2d?: number;
    yOffset2d?: number;
    stackable?: number;
    cost?: number;
    members?: boolean;
    colorFind?: number[];
    colorReplace?: number[];
    textureFind?: number[];
    textureReplace?: number[];
    shiftClickDropIndex?: number;
    isTradeable?: boolean;
    maleModel0?: number;
    maleModel1?: number;
    maleModel2?: number;
    maleOffset?: number;
    maleHeadModel?: number;
    maleHeadModel2?: number;
    femaleModel0?: number;
    femaleModel1?: number;
    femaleModel2?: number;
    femaleOffset?: number;
    femaleHeadModel?: number;
    femaleHeadModel2?: number;
    examine?: string;
    noteLinkId?: number;
    noteTemplateId?: number;
    countObj?: number[];
    countCo?: number[];
    resizeX?: number;
    resizeY?: number;
    resizeZ?: number;
    ambient?: number;
    contrast?: number;
    team?: number;
    unnotedId?: number;
    notedId?: number;
    placeholderLink?: number;
    placeholderTemplate?: number;
    weight?: number;
    subops?: Array<Array<string | null> | null>;
    params?: Record<number, unknown> | null;
};

type CacheFile = { length: number; name: string };
type FsFile = { fileId: number; contents: Buffer; nameHash?: number };

const readZipListing = (zipPath: string): CacheFile[] => {
    const output = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
    const files: CacheFile[] = [];
    for (const line of output.split(/\r?\n/)) {
        const match = line.match(/^\s*(\d+)\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+)$/);
        if (!match) continue;
        const length = Number(match[1]);
        const name = match[2].trim();
        if (name.endsWith("/")) continue;
        files.push({ length, name });
    }
    return files;
};

const unzipFile = (zipPath: string, innerPath: string): Buffer => {
    return execFileSync("unzip", ["-p", zipPath, innerPath], { maxBuffer: 512 * 1024 * 1024 });
};

const readUInt24 = (buf: Buffer, off: number): number => (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2];

const readSector = (mainFile: Buffer, indexFile: Buffer, indexId: number, sectorId: number): Buffer => {
    const entryOffset = sectorId * 6;
    const size = (indexFile[entryOffset] << 16) | (indexFile[entryOffset + 1] << 8) | indexFile[entryOffset + 2];
    let block = (indexFile[entryOffset + 3] << 16) | (indexFile[entryOffset + 4] << 8) | indexFile[entryOffset + 5];
    const output = Buffer.alloc(size);
    let written = 0;
    let chunk = 0;
    const bigSector = sectorId > 65535;
    const headerSize = bigSector ? 10 : 8;
    const payloadSize = bigSector ? 510 : 512;

    while (written < size) {
        if (block <= 0) {
            throw new Error(`Bad cache sector chain for index ${indexId} archive ${sectorId}`);
        }

        const remaining = Math.min(payloadSize, size - written);
        const sector = mainFile.subarray(block * 520, block * 520 + headerSize + remaining);
        const header = sector.subarray(0, headerSize);
        const headerId = bigSector ? header.readUInt32BE(0) : header.readUInt16BE(0);
        const headerChunk = header.readUInt16BE(bigSector ? 4 : 2);
        const nextBlock = readUInt24(header, bigSector ? 6 : 4);
        const headerIndex = header.readUInt8(bigSector ? 9 : 7);

        if (headerId !== sectorId || headerChunk !== chunk || headerIndex !== indexId) {
            throw new Error(
                `Bad sector chain for index ${indexId} archive ${sectorId}: ` +
                    `id=${headerId} chunk=${headerChunk} idx=${headerIndex} block=${block}`
            );
        }

        sector.copy(output, written, headerSize, headerSize + remaining);
        written += remaining;
        block = nextBlock;
        chunk++;
    }

    return output;
};

type ArchiveLayout = {
    fileCount: number;
    fileIds: number[];
};

type DiffDirection = "cache-missing" | "reference-missing" | "both";

type ParsedArgs = {
    zipPath: string;
    diffWith?: string;
    diffDirection: DiffDirection;
    diffLimit?: number;
};

const parseArchiveLayout = (refTable: Buffer, targetArchiveId: number): ArchiveLayout => {
    let offset = 0;
    const version = refTable.readUInt8(offset++);
    if (version < 5 || version > 7) {
        throw new Error(`Unsupported reference table version ${version}`);
    }
    if (version >= 6) {
        offset += 4;
    }
    const flags = refTable.readUInt8(offset++);

    const readSmart = (): number => {
        if (version >= 7) {
            const peek = refTable.readInt8(offset++);
            if (peek < 0) {
                return ((peek << 24) | (refTable.readUInt8(offset++) << 16) | (refTable.readUInt8(offset++) << 8) | refTable.readUInt8(offset++)) & 0x7fffffff;
            }
            const value = (peek << 8) | refTable.readUInt8(offset++);
            return value === 32767 ? -1 : value;
        }

        const value = refTable.readUInt16BE(offset);
        offset += 2;
        return value;
    };

    const archiveCount = readSmart();
    const archiveIds: number[] = [];
    let previous = 0;
    for (let i = 0; i < archiveCount; i++) {
        const archiveId = readSmart() + previous;
        previous = archiveId;
        archiveIds.push(archiveId);
    }

    if (flags & 1) {
        offset += archiveCount * 4;
    }
    offset += archiveCount * 4;
    if (flags & 8) {
        offset += archiveCount * 4;
    }
    if (flags & 2) {
        offset += archiveCount * 64;
    }
    if (flags & 4) {
        offset += archiveCount * 8;
    }
    offset += archiveCount * 4;

    const archiveSizes = new Map<number, number>();
    for (const archiveId of archiveIds) {
        archiveSizes.set(archiveId, readSmart());
    }

    const fileCount = archiveSizes.get(targetArchiveId);
    if (fileCount == null) {
        throw new Error(`Archive ${targetArchiveId} not present in reference table`);
    }

    const fileIds: number[] = [];
    for (const archiveId of archiveIds) {
        const count = archiveSizes.get(archiveId) ?? 0;
        let fileId = 0;
        if (archiveId === targetArchiveId) {
            for (let i = 0; i < count; i++) {
                fileId += readSmart();
                fileIds.push(fileId);
            }
            break;
        }
        for (let i = 0; i < count; i++) {
            fileId += readSmart();
        }
    }

    return { fileCount, fileIds };
};

const splitArchiveFiles = (data: Buffer, fileCount: number): Buffer[] => {
    if (fileCount === 1) {
        return [data];
    }

    let fileDataSizesOffset = data.length;
    const chunkSize = data[--fileDataSizesOffset];
    fileDataSizesOffset -= chunkSize * (fileCount * 4);

    const fileSizes = new Int32Array(fileCount);
    let cursor = fileDataSizesOffset;
    for (let chunk = 0; chunk < chunkSize; chunk++) {
        let previousLength = 0;
        for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
            previousLength += data.readInt32BE(cursor);
            cursor += 4;
            fileSizes[fileIndex] += previousLength;
        }
    }

    const files = Array.from({ length: fileCount }, (_unused, index) => Buffer.alloc(fileSizes[index]));
    const writeOffsets = new Int32Array(fileCount);

    cursor = fileDataSizesOffset;
    let sourceOffset = 0;
    for (let chunk = 0; chunk < chunkSize; chunk++) {
        let read = 0;
        for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
            read += data.readInt32BE(cursor);
            cursor += 4;
            data.copy(files[fileIndex], writeOffsets[fileIndex], sourceOffset, sourceOffset + read);
            writeOffsets[fileIndex] += read;
            sourceOffset += read;
        }
    }

    return files;
};

const readItemsJson = (inputPath: string): Array<Record<string, any>> => {
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

const mapItemsById = <T extends { id?: number }>(items: Array<T | null | undefined>): Map<number, T> => {
    const map = new Map<number, T>();
    for (const item of items) {
        if (!item || !Number.isInteger(item.id) || item.id < 0) {
            continue;
        }
        map.set(item.id, item);
    }
    return map;
};

const parseArgs = (): ParsedArgs => {
    const args = process.argv.slice(2).filter((arg) => arg !== "--");
    let zipPath = "";
    let diffWith: string | undefined;
    let diffDirection: DiffDirection = "cache-missing";
    let diffLimit: number | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--diff-with") {
            diffWith = args[++i];
            if (!diffWith) {
                throw new Error("--diff-with requires a JSON path");
            }
            continue;
        }
        if (arg === "--diff-direction") {
            const raw = args[++i] as DiffDirection | undefined;
            if (raw !== "cache-missing" && raw !== "reference-missing" && raw !== "both") {
                throw new Error("--diff-direction must be cache-missing, reference-missing, or both");
            }
            diffDirection = raw;
            continue;
        }
        if (arg === "--diff-limit") {
            const raw = Number(args[++i]);
            if (!Number.isInteger(raw) || raw <= 0) {
                throw new Error("--diff-limit must be a positive integer");
            }
            diffLimit = raw;
            continue;
        }
        if (arg.startsWith("-")) {
            throw new Error(`Unknown flag ${arg}`);
        }
        if (!zipPath) {
            zipPath = arg;
            continue;
        }
        throw new Error(`Unexpected argument ${arg}`);
    }

    if (!zipPath) {
        throw new Error(
            "Usage: yarn extract:osrs-items -- <cache.zip> [--diff-with <items.json>] [--diff-direction cache-missing|reference-missing|both] [--diff-limit N]"
        );
    }

    return { zipPath, diffWith, diffDirection, diffLimit };
};

const printItemDiff = (
    cacheItems: ItemDefinition[],
    referenceItems: Array<Record<string, any>>,
    direction: DiffDirection,
    diffLimit?: number
) => {
    const cacheById = mapItemsById(cacheItems);
    const referenceById = mapItemsById(referenceItems);
    const cacheMissing = [...referenceById.keys()].filter((id) => !cacheById.has(id)).sort((a, b) => a - b);
    const referenceMissing = [...cacheById.keys()].filter((id) => !referenceById.has(id)).sort((a, b) => a - b);

    const formatItem = (item: Record<string, any> | undefined, id: number) => {
        const name = item && typeof item.name === "string" && item.name.length > 0 ? item.name : `item-${id}`;
        return `${String(id).padStart(5, " ")}  ${name}`;
    };

    const printList = (title: string, ids: number[], source: Map<number, Record<string, any>>) => {
        console.log(`${title}: ${ids.length}`);
        const limit = diffLimit ?? ids.length;
        for (const id of ids.slice(0, limit)) {
            console.log(formatItem(source.get(id), id));
        }
        if (ids.length > limit) {
            console.log(`... ${ids.length - limit} more`);
        }
    };

    if (direction === "cache-missing" || direction === "both") {
        printList("Present in reference, missing from cache", cacheMissing, referenceById);
    }
    if (direction === "reference-missing" || direction === "both") {
        printList("Present in cache, missing from reference", referenceMissing, cacheById as Map<number, Record<string, any>>);
    }
};

const decompressBzip2 = (input: Buffer, outputSize: number, compressedSize: number): Buffer => {
    const bzip2 = require("bzip2");
    const compressed = Buffer.concat([Buffer.from("BZh9"), input.subarray(9, 9 + compressedSize)]);
    const decoded = bzip2.simple(bzip2.array(Uint8Array.from(compressed)));
    return Buffer.from(decoded);
};

const decompressContainer = (data: Buffer): Buffer => {
    const compression = data.readUInt8(0);
    const compressedLength = data.readUInt32BE(1);
    if (compression === 0) {
        return data.subarray(5, 5 + compressedLength);
    }
    const payload = data.subarray(5, 5 + compressedLength);
    const decompressedLength = payload.readUInt32BE(0);
    let out: Buffer;
    if (compression === 1) {
        try {
            out = decompressBzip2(data.subarray(0, 5 + compressedLength), decompressedLength, compressedLength);
        } catch (err) {
            if (compressedLength > 2) {
                out = decompressBzip2(data.subarray(0, 5 + compressedLength - 2), decompressedLength, compressedLength - 2);
            } else {
                throw err;
            }
        }
    } else if (compression === 2) {
        try {
            out = Buffer.from(inflateRawSync(payload.subarray(4)));
        } catch (err) {
            if (payload.length > 6) {
                out = Buffer.from(inflateRawSync(payload.subarray(4, payload.length - 2)));
            } else {
                throw err;
            }
        }
    } else {
        throw new Error(`Unknown compression type ${compression}`);
    }
    if (out.length !== decompressedLength) {
        throw new Error(`Decompressed length mismatch: expected ${decompressedLength}, got ${out.length}`);
    }
    return out;
};

const decodeItemLoader = (data: Buffer): ItemDefinition[] => {
    let offset = 0;
    const readUByte = () => data.readUInt8(offset++);
    const readUShort = () => { const v = data.readUInt16BE(offset); offset += 2; return v; };
    const readShort = () => { const v = data.readInt16BE(offset); offset += 2; return v; };
    const readInt = () => { const v = data.readInt32BE(offset); offset += 4; return v; };
    const readString = () => {
        const end = data.indexOf(0, offset);
        const s = data.toString("utf8", offset, end);
        offset = end + 1;
        return s;
    };

    const items: ItemDefinition[] = [];
    const count = readUShort();
    for (let id = 0; id < count; id++) {
        const def: ItemDefinition = { id, name: "null" };
        while (true) {
            const opcode = readUByte();
            if (opcode === 0) break;
            switch (opcode) {
                case 1: def.inventoryModel = readUShort(); break;
                case 2: def.name = readString(); break;
                case 3: def.examine = readString(); break;
                case 4: def.zoom2d = readUShort(); break;
                case 5: def.xan2d = readUShort(); break;
                case 6: def.yan2d = readUShort(); break;
                case 7: def.xOffset2d = readShort(); break;
                case 8: def.yOffset2d = readShort(); break;
                case 9: readString(); break;
                case 10: readUByte(); break;
                case 11: def.stackable = 1; break;
                case 12: def.cost = readInt(); break;
                case 13: readUByte(); break;
                case 14: readUByte(); break;
                case 15:
                    // Item is not tradeable; this opcode does not carry a payload.
                    def.isTradeable = false;
                    break;
                case 16: def.members = true; break;
                case 17:
                case 18:
                case 19:
                case 20:
                case 21:
                case 22:
                    readUShort();
                    break;
                case 23: def.maleModel0 = readUShort(); def.maleOffset = readUByte(); break;
                case 24: def.maleModel1 = readUShort(); break;
                case 25: def.femaleModel0 = readUShort(); def.femaleOffset = readUByte(); break;
                case 26: def.femaleModel1 = readUShort(); break;
                case 28: readUByte(); break;
                case 29: data.readInt8(offset++); break;
                case 30:
                case 31:
                case 32:
                case 33:
                case 34:
                    def.options ??= new Array(5).fill(null);
                    def.options[opcode - 30] = readString();
                    break;
                case 35:
                case 36:
                case 37:
                case 38:
                case 39:
                    def.actions ??= new Array(5).fill(null);
                    def.actions[opcode - 35] = readString();
                    break;
                case 40: {
                    const n = readUByte();
                    def.colorFind = [];
                    def.colorReplace = [];
                    for (let i = 0; i < n; i++) { def.colorFind.push(readUShort()); def.colorReplace.push(readUShort()); }
                    break;
                }
                case 41: {
                    const n = readUByte();
                    def.textureFind = [];
                    def.textureReplace = [];
                    for (let i = 0; i < n; i++) { def.textureFind.push(readUShort()); def.textureReplace.push(readUShort()); }
                    break;
                }
                case 42: def.shiftClickDropIndex = data.readInt8(offset++); break;
                case 43: {
                    readUByte();
                    while (true) {
                        const subop = readUByte() - 1;
                        if (subop === -1) break;
                        readString();
                    }
                    break;
                }
                case 44: readInt(); break;
                case 45: readInt(); readUByte(); break;
                case 46: readInt(); break;
                case 47: readInt(); break;
                case 48: readInt(); readUByte(); break;
                case 49: readInt(); break;
                case 50: readInt(); break;
                case 51: readInt(); break;
                case 52: readInt(); break;
                case 53: readInt(); break;
                case 54: readInt(); break;
                case 55: readUByte(); readUShort(); break;
                case 56: readUByte(); readShort(); readShort(); readShort(); break;
                case 57: readUShort(); break;
                case 59: readUShort(); break;
                case 58: readUShort(); break;
                case 60: readUShort(); break;
                case 61: readUShort(); break;
                case 62: break;
                case 63: readUByte(); break;
                case 64: break;
                case 65: def.isTradeable = true; break;
                case 66:
                case 67:
                case 68:
                case 70:
                case 71:
                case 72:
                case 76:
                case 77:
                case 80:
                case 81:
                case 82:
                case 83:
                case 84:
                case 85:
                case 86:
                case 87:
                case 89:
                case 116:
                case 117:
                case 118:
                case 119:
                case 142:
                case 143:
                case 144:
                case 145:
                case 146:
                case 150:
                case 151:
                case 152:
                case 153:
                case 154:
                    readUShort();
                    break;
                case 69: readUByte(); break;
                case 73: break;
                case 74: readUByte(); break;
                case 88: readUByte(); break;
                case 27: readUByte(); break;
                case 75: def.weight = readUShort(); break;
                case 78: def.maleModel2 = readUShort(); break;
                case 79: def.femaleModel2 = readUShort(); break;
                case 90: def.maleHeadModel = readUShort(); break;
                case 91: def.femaleHeadModel = readUShort(); break;
                case 92: def.maleHeadModel2 = readUShort(); break;
                case 93: def.femaleHeadModel2 = readUShort(); break;
                case 94: readUShort(); break;
                case 95: def.zan2d = readUShort(); break;
                case 96: readUByte(); break;
                case 97: {
                    def.noteLinkId = readUShort();
                    break;
                }
                case 98: {
                    const noteTemplateId = readUShort();
                    def.noteTemplateId = noteTemplateId;
                    break;
                }
                case 99: readUByte(); break;
                case 120: readUShort(); break;
                case 123: break;
                case 147: break;
                case 167: readUShort(); break;
                case 169: break;
                case 171: readUShort(); break;
                case 173: readUShort(); break;
                case 178: readUByte(); break;
                case 182: readUShort(); break;
                case 195: readUShort(); break;
                case 196: break;
                case 197: readUShort(); break;
                case 198: break;
                case 199: break;
                case 174: break;
                case 189: break;
                case 190: readUByte(); break;
                case 191: readUByte(); break;
                case 193: break;
                case 208: readUByte(); break;
                case 214: break;
                case 206: readUShort(); break;
                case 205: readUShort(); break;
                case 207: break;
                case 212: readUShort(); break;
                case 230: readUByte(); break;
                case 218: readUShort(); break;
                case 220: readUShort(); break;
                case 221: readUShort(); break;
                case 229: readUShort(); break;
                case 237: readUByte(); break;
                case 238: readUShort(); break;
                case 239: break;
                case 252: {
                    readUByte();
                    readUShort();
                    readUShort();
                    readInt();
                    readInt();
                    readString();
                    break;
                }
                case 164: break;
                case 165: break;
                case 181: break;
                case 170: readUByte(); break;
                case 184: readUByte(); break;
                case 177: break;
                case 215:
                case 216:
                case 217:
                case 219:
                case 231:
                case 243:
                    readUByte();
                    break;
                case 141: break;
                case 176: break;
                case 194: break;
                case 254: break;
                default:
                    if (opcode >= 100 && opcode < 110) {
                        def.countObj ??= new Array(10).fill(0);
                        def.countCo ??= new Array(10).fill(0);
                        def.countObj[opcode - 100] = readUShort();
                        def.countCo[opcode - 100] = readUShort();
                    } else if (opcode === 110) def.resizeX = readUShort();
                    else if (opcode === 111) def.resizeY = readUShort();
                    else if (opcode === 112) def.resizeZ = readUShort();
                    else if (opcode === 113) def.ambient = data.readInt8(offset++);
                    else if (opcode === 114) def.contrast = data.readInt8(offset++);
                    else if (opcode === 115) def.team = readUByte();
                    else if (opcode === 121) readUShort();
                    else if (opcode === 122) readUShort();
                    else if (opcode === 125) { readUByte(); readUByte(); readUByte(); }
                    else if (opcode === 126) { readUByte(); readUByte(); readUByte(); }
                    else if (opcode === 127) { readUByte(); readUShort(); }
                    else if (opcode === 128) { readUByte(); readUShort(); }
                    else if (opcode === 129) { readUByte(); readUShort(); }
                    else if (opcode === 130) { readUByte(); readUShort(); }
                    else if (opcode === 134) { readUShort(); readUShort(); readUShort(); readUShort(); }
                    else if (opcode === 135) { readUByte(); readUShort(); }
                    else if (opcode === 136) { readUByte(); readUShort(); }
                    else if (opcode === 137) { readUShort(); }
                    else if (opcode === 133) { readUByte(); }
                    else if (opcode === 132) { const n = readUByte(); for (let i = 0; i < n; i++) readUShort(); }
                    else if (opcode === 138) readUShort();
                    else if (opcode === 139) def.unnotedId = readUShort();
                    else if (opcode === 140) def.notedId = readUShort();
                    else if (opcode === 148) def.placeholderLink = readUShort();
                    else if (opcode === 149) def.placeholderTemplate = readUShort();
                    else if (opcode >= 155 && opcode <= 163) readUShort();
                    else if (opcode === 168) readUByte();
                    else if (opcode === 172) readUShort();
                    else if (opcode === 175) readUShort();
                    else if (opcode === 185 || opcode === 186 || opcode === 187 || opcode === 188) readUShort();
                    else if (opcode === 192) readUShort();
                    else if (opcode === 204) readUShort();
                    else if (opcode === 224 || opcode === 225) readUShort();
                    else if (opcode === 253) readUByte();
                    else if (opcode === 244 || opcode === 245 || opcode === 246 || opcode === 247) readUShort();
                    else if (opcode === 255) readUByte();
                    else if (opcode === 200) {
                        const opId = readUByte();
                        const valid = opId >= 0 && opId < 5;
                        if (valid) {
                            def.subops ??= new Array(5).fill(null);
                            if (def.subops[opId] == null) {
                                def.subops[opId] = new Array(20).fill(null);
                            }
                        }
                        while (true) {
                            const subopId = readUByte() - 1;
                            if (subopId === -1) {
                                break;
                            }
                            const text = readString();
                            if (valid && subopId >= 0 && subopId < 20) {
                                def.subops![opId]![subopId] = text;
                            }
                        }
                    }
                    else if (opcode === 201) { readUByte(); readUShort(); readUShort(); readInt(); readInt(); readString(); }
                    else if (opcode === 202) { readUByte(); readUShort(); readUShort(); readUShort(); readInt(); readInt(); readString(); }
                    else if (opcode === 249) {
                        const count = readUByte();
                        def.params = {};
                        for (let i = 0; i < count; i++) {
                            const isString = readUByte() === 1;
                            const key = readUInt24(data, offset); offset += 3;
                            def.params[key] = isString ? readString() : readInt();
                        }
                    } else {
                        console.warn(`Skipping unknown item opcode ${opcode} for item ${id} at offset ${offset}`);
                    }
            }
        }
        items.push(def);
    }
    return items;
};

const main = () => {
    const { zipPath, diffWith, diffDirection, diffLimit } = parseArgs();
    const absZip = path.resolve(process.cwd(), zipPath);
    readZipListing(absZip);
    const dat2 = unzipFile(absZip, "cache/main_file_cache.dat2");
    const idx2 = unzipFile(absZip, "cache/main_file_cache.idx2");
    const idx255 = unzipFile(absZip, "cache/main_file_cache.idx255");

    // Resolve archive 10 through the reference table, then split its packed files.
    const configReferenceSector = readSector(dat2, idx255, 255, 2);
    const configReference = decompressContainer(configReferenceSector);
    const itemLayout = parseArchiveLayout(configReference, 10);

    const itemArchiveSector = readSector(dat2, idx2, 2, 10);
    const itemArchive = decompressContainer(itemArchiveSector);
    const itemFiles = splitArchiveFiles(itemArchive, itemLayout.fileCount);

    const items: ItemDefinition[] = [];
    for (let i = 0; i < itemLayout.fileIds.length; i++) {
        const itemId = itemLayout.fileIds[i];
        const decoded = decodeItemLoader(Buffer.concat([Buffer.from([0x00, 0x01]), itemFiles[i]]));
        if (decoded.length !== 1) {
            throw new Error(`Expected a single item in file ${itemId}, got ${decoded.length}`);
        }
        decoded[0].id = itemId;
        items[itemId] = decoded[0];
    }

    const out = path.resolve("/tmp/osrs-items-from-cache.json");
    fs.writeFileSync(out, JSON.stringify(items, null, 2) + "\n");
    console.log(`Wrote ${items.length} items to ${out}`);

    if (diffWith) {
        const referencePath = path.resolve(process.cwd(), diffWith);
        const referenceItems = readItemsJson(referencePath);
        printItemDiff(items, referenceItems, diffDirection, diffLimit);
    }
};

main();
