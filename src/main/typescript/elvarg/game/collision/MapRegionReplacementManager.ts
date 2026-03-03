import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { GameConstants } from "../GameConstants";
import { Buffer as CollisionBuffer } from "./Buffer";
import { PacketBuilder } from "../../net/packet/PacketBuilder";
import { PacketType } from "../../net/packet/PacketType";

type RegionMapFiles = {
  terrainFile: number;
  objectFile: number;
};

type TerrainDecodeResult = {
  heights: Buffer;
  overlays: Buffer;
  overlayTypes: Buffer;
  overlayOrientations: Buffer;
  underlays: Buffer;
  flags: Buffer;
};

type ProceduralObjectPlacement = {
  id: number;
  x: number;
  y: number;
  z: number;
  type: number;
  orientation: number;
};

type ProceduralRegionPayload = {
  v: number;
  regionId: number;
  regionX: number;
  regionY: number;
  seed: number;
  size: number;
  planes: number;
  heightsB64: string;
  overlaysB64: string;
  overlayTypesB64: string;
  overlayOrientationsB64: string;
  underlaysB64: string;
  flagsB64: string;
  buildingPlacements: ProceduralObjectPlacement[];
};

export type ReplaceMapRegionSource = string | [string, string];

type RegionReplacement = {
  regionId: number;
  source: string;
  terrainData: Uint8Array;
  objectData: Uint8Array | null;
  payload: ProceduralRegionPayload;
};

export type ReplaceMapRegionResult = {
  regionId: number;
  source: string;
  terrainBytes: number;
  objectBytes: number;
  objectCount: number;
};

export class MapRegionReplacementManager {
  private static readonly REGION_SIZE = 64;
  private static readonly REGION_PLANES = 4;
  private static readonly PACKET_OPCODE = 12;
  private static readonly CHUNK_TEXT_SIZE = 220;
  private static readonly PACKET_TYPE = Object.freeze({
    META: 0,
    CHUNK: 1,
    END: 2,
  });

  private static replacements: Map<number, RegionReplacement> = new Map();
  private static mapIndexCache: Map<number, RegionMapFiles> | null = null;
  private static requestCounter = 0;

  public static replaceMapRegion(
    regionId: number,
    source: ReplaceMapRegionSource
  ): ReplaceMapRegionResult {
    if (!Number.isInteger(regionId) || regionId < 0 || regionId > 0xffff) {
      throw new Error(`invalid regionId: ${regionId}`);
    }

    const loadedSource = this.loadSource(regionId, source);
    const payload = this.buildProceduralPayload(
      regionId,
      loadedSource.terrainData,
      loadedSource.objectData
    );

    this.replacements.set(regionId, {
      regionId,
      source: loadedSource.resolvedSource,
      terrainData: loadedSource.terrainData,
      objectData: loadedSource.objectData,
      payload,
    });

    return {
      regionId,
      source: loadedSource.resolvedSource,
      terrainBytes: loadedSource.terrainData.length,
      objectBytes: loadedSource.objectData?.length ?? 0,
      objectCount: payload.buildingPlacements.length,
    };
  }

  public static getReplacementMapData(
    regionId: number
  ): { terrainData: Uint8Array; objectData: Uint8Array | null } | null {
    const replacement = this.replacements.get(regionId);
    if (!replacement) {
      return null;
    }
    return {
      terrainData: replacement.terrainData,
      objectData: replacement.objectData,
    };
  }

  public static sendAllReplacementsToPlayer(player: any): number {
    let sent = 0;
    const ordered = Array.from(this.replacements.values()).sort(
      (a, b) => a.regionId - b.regionId
    );
    for (const replacement of ordered) {
      if (this.sendPayloadToPlayer(player, replacement.payload)) {
        sent++;
      }
    }
    return sent;
  }

  public static sendVisibleReplacementsToPlayer(
    player: any,
    tileX: number,
    tileY: number,
    chunkRadius: number = 6
  ): number {
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      return 0;
    }
    const visibleRegionIds = this.computeVisibleRegionIds(tileX, tileY, chunkRadius);
    if (visibleRegionIds.size === 0) {
      return 0;
    }

    let sent = 0;
    const orderedIds = Array.from(visibleRegionIds).sort((a, b) => a - b);
    for (const regionId of orderedIds) {
      const replacement = this.replacements.get(regionId);
      if (!replacement) {
        continue;
      }
      if (this.sendPayloadToPlayer(player, replacement.payload)) {
        sent++;
      }
    }
    return sent;
  }

  public static sendNonVisibleReplacementsToPlayer(
    player: any,
    tileX: number,
    tileY: number,
    chunkRadius: number = 6
  ): number {
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      return this.sendAllReplacementsToPlayer(player);
    }
    const visibleRegionIds = this.computeVisibleRegionIds(tileX, tileY, chunkRadius);
    let sent = 0;
    const ordered = Array.from(this.replacements.values()).sort(
      (a, b) => a.regionId - b.regionId
    );
    for (const replacement of ordered) {
      if (visibleRegionIds.has(replacement.regionId)) {
        continue;
      }
      if (this.sendPayloadToPlayer(player, replacement.payload)) {
        sent++;
      }
    }
    return sent;
  }

  public static sendReplacementToPlayer(player: any, regionId: number): boolean {
    const replacement = this.replacements.get(regionId);
    if (!replacement) {
      return false;
    }
    return this.sendPayloadToPlayer(player, replacement.payload);
  }

  private static sendPayloadToPlayer(
    player: any,
    payload: ProceduralRegionPayload
  ): boolean {
    const session = player?.getSession?.();
    if (!session || typeof session.write !== "function") {
      return false;
    }

    const requestId = ++this.requestCounter & 0xffff;
    const json = JSON.stringify(payload);
    const chunks = this.splitIntoChunks(json, this.CHUNK_TEXT_SIZE);
    const meta = JSON.stringify({
      v: payload.v,
      requestId,
      regionId: payload.regionId,
      regionX: payload.regionX,
      regionY: payload.regionY,
      chunkCount: chunks.length,
      jsonLength: json.length,
    });

    this.sendProceduralPacket(
      player,
      this.PACKET_TYPE.META,
      requestId,
      payload.regionId,
      0,
      chunks.length,
      meta
    );

    for (let i = 0; i < chunks.length; i++) {
      this.sendProceduralPacket(
        player,
        this.PACKET_TYPE.CHUNK,
        requestId,
        payload.regionId,
        i,
        chunks.length,
        chunks[i]
      );
    }

    this.sendProceduralPacket(
      player,
      this.PACKET_TYPE.END,
      requestId,
      payload.regionId,
      chunks.length,
      chunks.length,
      String(json.length)
    );
    return true;
  }

  private static sendProceduralPacket(
    player: any,
    type: number,
    requestId: number,
    regionId: number,
    chunkIndex: number,
    chunkCount: number,
    payloadText: string
  ): void {
    const session = player?.getSession?.();
    if (!session || typeof session.write !== "function") {
      return;
    }
    const packet = new PacketBuilder(this.PACKET_OPCODE, PacketType.VARIABLE);
    packet
      .put(type)
      .putShort(requestId)
      .putInt(regionId)
      .putShort(chunkIndex)
      .putShort(chunkCount)
      .putString(payloadText || "");
    session.write(packet);
  }

  private static splitIntoChunks(text: string, maxChunkSize: number): string[] {
    if (!text || text.length === 0) {
      return [""];
    }
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxChunkSize) {
      chunks.push(text.slice(i, i + maxChunkSize));
    }
    return chunks;
  }

  private static computeVisibleRegionIds(
    tileX: number,
    tileY: number,
    chunkRadius: number
  ): Set<number> {
    const chunkX = tileX >> 3;
    const chunkY = tileY >> 3;
    const minRegionX = (chunkX - chunkRadius) >> 3;
    const maxRegionX = (chunkX + chunkRadius) >> 3;
    const minRegionY = (chunkY - chunkRadius) >> 3;
    const maxRegionY = (chunkY + chunkRadius) >> 3;
    const ids = new Set<number>();

    for (let regionX = minRegionX; regionX <= maxRegionX; regionX++) {
      if (regionX < 0 || regionX > 0xff) {
        continue;
      }
      for (let regionY = minRegionY; regionY <= maxRegionY; regionY++) {
        if (regionY < 0 || regionY > 0xff) {
          continue;
        }
        ids.add(((regionX & 0xff) << 8) | (regionY & 0xff));
      }
    }
    return ids;
  }

  private static buildProceduralPayload(
    regionId: number,
    terrainData: Uint8Array,
    objectData: Uint8Array | null
  ): ProceduralRegionPayload {
    const regionX = (regionId >> 8) & 0xff;
    const regionY = regionId & 0xff;
    const terrain = this.decodeTerrain(regionId, terrainData);
    const placements = this.decodeObjectPlacements(objectData);

    return {
      v: 1,
      regionId,
      regionX,
      regionY,
      seed: regionId,
      size: this.REGION_SIZE,
      planes: this.REGION_PLANES,
      heightsB64: terrain.heights.toString("base64"),
      overlaysB64: terrain.overlays.toString("base64"),
      overlayTypesB64: terrain.overlayTypes.toString("base64"),
      overlayOrientationsB64: terrain.overlayOrientations.toString("base64"),
      underlaysB64: terrain.underlays.toString("base64"),
      flagsB64: terrain.flags.toString("base64"),
      buildingPlacements: placements,
    };
  }

  private static decodeTerrain(
    regionId: number,
    data: Uint8Array
  ): TerrainDecodeResult {
    const tileCount = this.REGION_PLANES * this.REGION_SIZE * this.REGION_SIZE;
    const heights = Buffer.alloc(tileCount * 2);
    const overlays = Buffer.alloc(tileCount);
    const overlayTypes = Buffer.alloc(tileCount);
    const overlayOrientations = Buffer.alloc(tileCount);
    const underlays = Buffer.alloc(tileCount);
    const flags = Buffer.alloc(tileCount);
    const stream = new CollisionBuffer(data);

    const absX = ((regionId >> 8) & 0xff) * this.REGION_SIZE;
    const absY = (regionId & 0xff) * this.REGION_SIZE;
    const heightRaw = Array.from({ length: this.REGION_PLANES }, () =>
      Array.from({ length: this.REGION_SIZE }, () =>
        new Array<number>(this.REGION_SIZE).fill(0)
      )
    );

    for (let z = 0; z < this.REGION_PLANES; z++) {
      for (let localX = 0; localX < this.REGION_SIZE; localX++) {
        for (let localY = 0; localY < this.REGION_SIZE; localY++) {
          while (true) {
            if (stream.offset >= stream.length()) {
              throw new Error(
                `terrain decode overflow region=${regionId} z=${z} x=${localX} y=${localY}`
              );
            }

            const tileType = stream.readUnsignedByte();
            if (tileType === 0) {
              if (z === 0) {
                heightRaw[0][localX][localY] = this.terrainVertexHeight(
                  932731 + absX + localX,
                  556238 + absY + localY
                );
              } else {
                heightRaw[z][localX][localY] = Math.max(
                  0,
                  heightRaw[z - 1][localX][localY] - 30
                );
              }
              break;
            }

            if (tileType === 1) {
              if (stream.offset >= stream.length()) {
                throw new Error(
                  `terrain decode overflow (height byte) region=${regionId} z=${z} x=${localX} y=${localY}`
                );
              }
              let heightByte = stream.readUnsignedByte();
              if (heightByte === 1) {
                heightByte = 0;
              }
              if (z === 0) {
                heightRaw[0][localX][localY] = heightByte;
              } else {
                heightRaw[z][localX][localY] = Math.max(
                  0,
                  heightRaw[z - 1][localX][localY] - heightByte
                );
              }
              break;
            }

            if (tileType <= 49) {
              if (stream.offset >= stream.length()) {
                throw new Error(
                  `terrain decode overflow (overlay byte) region=${regionId} z=${z} x=${localX} y=${localY}`
                );
              }
              const idx =
                z * this.REGION_SIZE * this.REGION_SIZE +
                localX * this.REGION_SIZE +
                localY;
              overlays[idx] = stream.readUnsignedByte() & 0xff;
              overlayTypes[idx] = Math.floor((tileType - 2) / 4) & 0xff;
              overlayOrientations[idx] = (tileType - 2) & 0x3;
            } else if (tileType <= 81) {
              const idx =
                z * this.REGION_SIZE * this.REGION_SIZE +
                localX * this.REGION_SIZE +
                localY;
              flags[idx] = (tileType - 49) & 0xff;
            } else {
              const idx =
                z * this.REGION_SIZE * this.REGION_SIZE +
                localX * this.REGION_SIZE +
                localY;
              underlays[idx] = (tileType - 81) & 0xff;
            }
          }

          const idx =
            z * this.REGION_SIZE * this.REGION_SIZE +
            localX * this.REGION_SIZE +
            localY;
          const raw = this.clampHeightRaw(heightRaw[z][localX][localY]);
          heights.writeUInt16LE(raw, idx * 2);
        }
      }
    }

    return {
      heights,
      overlays,
      overlayTypes,
      overlayOrientations,
      underlays,
      flags,
    };
  }

  private static clampHeightRaw(value: number): number {
    const v = Number.isFinite(value) ? Math.floor(value) : 0;
    if (v < 0) {
      return 0;
    }
    if (v > 0xffff) {
      return 0xffff;
    }
    return v;
  }

  private static decodeObjectPlacements(
    data: Uint8Array | null
  ): ProceduralObjectPlacement[] {
    if (!data || data.length === 0) {
      return [];
    }

    const stream = new CollisionBuffer(data);
    const placements: ProceduralObjectPlacement[] = [];
    let objectId = -1;

    while (stream.offset < stream.length()) {
      const idIncrement = stream.getUSmart();
      if (idIncrement === 0) {
        break;
      }
      objectId += idIncrement;
      let location = 0;

      while (stream.offset < stream.length()) {
        const locationIncrement = stream.getUSmart();
        if (locationIncrement === 0) {
          break;
        }
        location += locationIncrement - 1;

        if (stream.offset >= stream.length()) {
          break;
        }
        const hash = stream.readUnsignedByte();
        const localX = (location >> 6) & 0x3f;
        const localY = location & 0x3f;
        const z = location >> 12;
        const type = hash >> 2;
        const orientation = hash & 0x3;

        if (
          localX < 0 ||
          localX >= this.REGION_SIZE ||
          localY < 0 ||
          localY >= this.REGION_SIZE ||
          z < 0 ||
          z >= this.REGION_PLANES
        ) {
          continue;
        }

        placements.push({
          id: objectId,
          x: localX,
          y: localY,
          z,
          type,
          orientation,
        });
      }
    }

    return placements;
  }

  private static loadSource(
    regionId: number,
    source: ReplaceMapRegionSource
  ): { terrainData: Uint8Array; objectData: Uint8Array | null; resolvedSource: string } {
    if (Array.isArray(source)) {
      if (source.length !== 2) {
        throw new Error("array source must be [terrainPath, objectPath]");
      }
      const terrainPath = this.resolveSourcePath(source[0]);
      const objectPath = this.resolveSourcePath(source[1]);
      return {
        terrainData: this.readMapFile(terrainPath),
        objectData: this.readMapFile(objectPath),
        resolvedSource: `[${terrainPath}, ${objectPath}]`,
      };
    }

    if (typeof source !== "string" || source.trim().length === 0) {
      throw new Error("source must be a non-empty string or [terrainPath, objectPath]");
    }

    const sourcePath = this.resolveSourcePath(source);
    if (sourcePath.toLowerCase().endsWith(".pack")) {
      return this.readPackSource(regionId, sourcePath);
    }

    throw new Error(
      `single-file source '${sourcePath}' is unsupported; use .pack or [terrainPath, objectPath]`
    );
  }

  private static readPackSource(
    regionId: number,
    packPath: string
  ): { terrainData: Uint8Array; objectData: Uint8Array | null; resolvedSource: string } {
    const data = fs.readFileSync(packPath);
    if (data.length < 28) {
      throw new Error(`pack file too short: ${packPath}`);
    }

    const firstFileId = data.readInt32BE(4);
    const secondFileId = data.readInt32BE(8);
    const firstLength = data.readInt32BE(20);
    if (firstLength <= 0) {
      throw new Error(`invalid first entry length in pack: ${packPath}`);
    }

    const firstDataStart = 24;
    const firstDataEnd = firstDataStart + firstLength;
    if (firstDataEnd + 4 > data.length) {
      throw new Error(`truncated first entry in pack: ${packPath}`);
    }

    const secondLength = data.readInt32BE(firstDataEnd);
    if (secondLength < 0) {
      throw new Error(`invalid second entry length in pack: ${packPath}`);
    }
    const secondDataStart = firstDataEnd + 4;
    const secondDataEnd = secondDataStart + secondLength;
    if (secondDataEnd > data.length) {
      throw new Error(`truncated second entry in pack: ${packPath}`);
    }

    const firstData = data.subarray(firstDataStart, firstDataEnd);
    const secondData = data.subarray(secondDataStart, secondDataEnd);
    const mapFiles = this.lookupMapFiles(regionId);

    let terrainData: Uint8Array | null = null;
    let objectData: Uint8Array | null = null;
    if (mapFiles) {
      if (firstFileId === mapFiles.terrainFile) {
        terrainData = firstData;
      } else if (firstFileId === mapFiles.objectFile) {
        objectData = firstData;
      }

      if (secondFileId === mapFiles.terrainFile) {
        terrainData = secondData;
      } else if (secondFileId === mapFiles.objectFile) {
        objectData = secondData;
      }
    }

    if (!terrainData && !objectData) {
      if (firstData.length >= secondData.length) {
        terrainData = firstData;
        objectData = secondData;
      } else {
        terrainData = secondData;
        objectData = firstData;
      }
    } else if (!terrainData) {
      terrainData = objectData === firstData ? secondData : firstData;
    } else if (!objectData) {
      objectData = terrainData === firstData ? secondData : firstData;
    }

    return {
      terrainData: this.decodeMapFileBytes(terrainData, `${packPath}#terrain`),
      objectData: objectData
        ? this.decodeMapFileBytes(objectData, `${packPath}#object`)
        : null,
      resolvedSource: packPath,
    };
  }

  private static resolveSourcePath(rawPath: string): string {
    const trimmed = String(rawPath ?? "").trim();
    if (!trimmed) {
      throw new Error("source path must not be empty");
    }
    if (path.isAbsolute(trimmed)) {
      return trimmed;
    }
    return path.resolve(process.cwd(), trimmed);
  }

  private static readMapFile(filePath: string): Uint8Array {
    const data = fs.readFileSync(filePath);
    return this.decodeMapFileBytes(data, filePath);
  }

  private static decodeMapFileBytes(
    data: Uint8Array,
    sourceLabel: string
  ): Uint8Array {
    if (!data || data.length === 0) {
      throw new Error(`empty map data: ${sourceLabel}`);
    }

    const raw = Buffer.from(data);
    if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
      try {
        return zlib.gunzipSync(raw);
      } catch (err) {
        throw new Error(
          `failed to gunzip '${sourceLabel}': ${(err as Error)?.message ?? String(err)}`
        );
      }
    }
    return raw;
  }

  private static lookupMapFiles(regionId: number): RegionMapFiles | null {
    if (!this.mapIndexCache) {
      this.mapIndexCache = new Map<number, RegionMapFiles>();
      const mapIndexPath = path.resolve(
        process.cwd(),
        GameConstants.CLIPPING_DIRECTORY,
        "map_index"
      );
      if (!fs.existsSync(mapIndexPath)) {
        return null;
      }
      const stream = new CollisionBuffer(fs.readFileSync(mapIndexPath));
      const size = stream.readUShort();
      for (let i = 0; i < size; i++) {
        const id = stream.readUShort();
        const terrainFile = stream.readUShort();
        const objectFile = stream.readUShort();
        this.mapIndexCache.set(id, { terrainFile, objectFile });
      }
    }
    return this.mapIndexCache.get(regionId) ?? null;
  }

  private static terrainNoise(x: number, y: number): number {
    let n = x + y * 57;
    n = (n << 13) ^ n;
    const raw =
      (Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) &
      0x7fffffff;
    return (raw >> 19) & 0xff;
  }

  private static terrainSmoothNoise(x: number, y: number): number {
    const corners =
      this.terrainNoise(x - 1, y - 1) +
      this.terrainNoise(x + 1, y - 1) +
      this.terrainNoise(x - 1, y + 1) +
      this.terrainNoise(x + 1, y + 1);
    const sides =
      this.terrainNoise(x - 1, y) +
      this.terrainNoise(x + 1, y) +
      this.terrainNoise(x, y - 1) +
      this.terrainNoise(x, y + 1);
    const center = this.terrainNoise(x, y);
    return ((corners >> 4) + (sides >> 3) + (center >> 2)) | 0;
  }

  private static terrainInterpolate(
    a: number,
    b: number,
    angle: number,
    frequencyReciprocal: number
  ): number {
    const theta = (angle * Math.PI) / frequencyReciprocal;
    const cosine = (65536 - ((Math.cos(theta) * 65536) | 0)) >> 1;
    return ((a * (65536 - cosine)) >> 16) + ((b * cosine) >> 16);
  }

  private static terrainInterpolatedNoise(
    x: number,
    y: number,
    frequencyReciprocal: number
  ): number {
    const l = Math.floor(x / frequencyReciprocal);
    const i1 = x & (frequencyReciprocal - 1);
    const j1 = Math.floor(y / frequencyReciprocal);
    const k1 = y & (frequencyReciprocal - 1);
    const l1 = this.terrainSmoothNoise(l, j1);
    const i2 = this.terrainSmoothNoise(l + 1, j1);
    const j2 = this.terrainSmoothNoise(l, j1 + 1);
    const k2 = this.terrainSmoothNoise(l + 1, j1 + 1);
    const l2 = this.terrainInterpolate(l1, i2, i1, frequencyReciprocal);
    const i3 = this.terrainInterpolate(j2, k2, i1, frequencyReciprocal);
    return this.terrainInterpolate(l2, i3, k1, frequencyReciprocal);
  }

  private static terrainVertexHeight(x: number, y: number): number {
    let mapHeight =
      this.terrainInterpolatedNoise(x + 45365, y + 91923, 4) -
      128 +
      ((this.terrainInterpolatedNoise(x + 10294, y + 37821, 2) - 128) >> 1) +
      ((this.terrainInterpolatedNoise(x, y, 1) - 128) >> 2);
    mapHeight = (mapHeight * 0.3 + 35) | 0;
    if (mapHeight < 10) {
      mapHeight = 10;
    } else if (mapHeight > 60) {
      mapHeight = 60;
    }
    return mapHeight;
  }
}
