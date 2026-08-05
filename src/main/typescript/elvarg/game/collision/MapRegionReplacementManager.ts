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

export type ReplaceMapRegionSource = string | [string, string];

type RegionReplacement = {
  regionId: number;
  source: string;
  terrainData: Uint8Array;
  objectData: Uint8Array | null;
};

export type ReplaceMapRegionResult = {
  regionId: number;
  source: string;
  terrainBytes: number;
  objectBytes: number;
  objectCount: number;
};

export class MapRegionReplacementManager {
  private static readonly PACKET_OPCODE = 12;
  private static readonly MAX_PACKET_PAYLOAD = 0xffff;
  private static readonly PACKET_TYPE = Object.freeze({
    REGION_DATA: 0,
    ERROR: 3,
    CLEAR: 4,
  });
  private static readonly PACKET_FLAG_ALLOW_RELOAD = 0x1;

  private static replacements: Map<number, RegionReplacement> = new Map();
  private static mapIndexCache: Map<number, RegionMapFiles> | null = null;
  private static pendingSceneLoads: WeakSet<object> = new WeakSet();

  public static replaceMapRegion(
    regionId: number,
    source: ReplaceMapRegionSource
  ): ReplaceMapRegionResult {
    if (!Number.isInteger(regionId) || regionId < 0 || regionId > 0xffff) {
      throw new Error(`invalid regionId: ${regionId}`);
    }

    const loadedSource = this.loadSource(regionId, source);
    const payloadLength =
      1 + // packet type
      1 + // flags
      4 + // region id
      4 + // terrain length
      4 + // object length
      loadedSource.terrainData.length +
      (loadedSource.objectData?.length ?? 0);
    if (payloadLength > this.MAX_PACKET_PAYLOAD) {
      throw new Error(
        `region replacement is too large: region=${regionId} bytes=${payloadLength} max=${this.MAX_PACKET_PAYLOAD}`
      );
    }
    const objectCount = this.countObjectPlacements(loadedSource.objectData);

    this.replacements.set(regionId, {
      regionId,
      source: loadedSource.resolvedSource,
      terrainData: loadedSource.terrainData,
      objectData: loadedSource.objectData,
    });

    return {
      regionId,
      source: loadedSource.resolvedSource,
      terrainBytes: loadedSource.terrainData.length,
      objectBytes: loadedSource.objectData?.length ?? 0,
      objectCount,
    };
  }

  public static markSceneLoadStarted(player: any): void {
    if (player && typeof player === "object") {
      this.pendingSceneLoads.add(player);
    }
  }

  public static consumeSceneLoadStarted(player: any): boolean {
    if (!player || typeof player !== "object" || !this.pendingSceneLoads.has(player)) {
      return false;
    }
    this.pendingSceneLoads.delete(player);
    return true;
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
      if (this.sendPayloadToPlayer(player, replacement, true)) {
        sent++;
      }
    }
    return sent;
  }

  public static sendVisibleReplacementsToPlayer(
    player: any,
    tileX: number,
    tileY: number,
    chunkRadius: number = 6,
    excludeRegionIds: readonly number[] = [],
    allowReload: boolean = true
  ): number {
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      return 0;
    }
    const excluded = new Set<number>(excludeRegionIds);
    const visibleRegionIds = this.computeVisibleRegionIds(tileX, tileY, chunkRadius);
    if (visibleRegionIds.size === 0) {
      return 0;
    }

    let sent = 0;
    const orderedIds = Array.from(visibleRegionIds).sort((a, b) => a - b);
    for (const regionId of orderedIds) {
      if (excluded.has(regionId)) {
        continue;
      }
      const replacement = this.replacements.get(regionId);
      if (!replacement) {
        continue;
      }
      if (this.sendPayloadToPlayer(player, replacement, allowReload)) {
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
      if (this.sendPayloadToPlayer(player, replacement, true)) {
        sent++;
      }
    }
    return sent;
  }

  public static sendReplacementToPlayer(
    player: any,
    regionId: number,
    allowReload: boolean = true
  ): boolean {
    const replacement = this.replacements.get(regionId);
    if (!replacement) {
      return false;
    }
    return this.sendPayloadToPlayer(player, replacement, allowReload);
  }

  private static sendPayloadToPlayer(
    player: any,
    replacement: RegionReplacement,
    allowReload: boolean
  ): boolean {
    const session = player?.getSession?.();
    if (!session || typeof session.write !== "function") {
      return false;
    }

    return this.sendRegionReplacementPacket(player, replacement, allowReload);
  }

  private static sendRegionReplacementPacket(
    player: any,
    replacement: RegionReplacement,
    allowReload: boolean
  ): boolean {
    const session = player?.getSession?.();
    if (!session || typeof session.write !== "function") {
      return false;
    }
    const terrainBuffer = Buffer.from(replacement.terrainData);
    const objectBuffer = replacement.objectData
      ? Buffer.from(replacement.objectData)
      : null;
    const objectLength = objectBuffer ? objectBuffer.length : -1;
    const flags = allowReload ? this.PACKET_FLAG_ALLOW_RELOAD : 0;
    const payloadLength =
      1 + // packet type
      1 + // flags
      4 + // region id
      4 + // terrain length
      4 + // object length
      terrainBuffer.length +
      (objectBuffer?.length ?? 0);

    if (payloadLength > this.MAX_PACKET_PAYLOAD) {
      const errorPacket = new PacketBuilder(
        this.PACKET_OPCODE,
        PacketType.VARIABLE_SHORT
      );
      errorPacket
        .put(this.PACKET_TYPE.ERROR)
        .putString(
          `region_override_too_large region=${replacement.regionId} bytes=${payloadLength}`
        );
      session.write(errorPacket);
      return false;
    }

    const packet = new PacketBuilder(
      this.PACKET_OPCODE,
      PacketType.VARIABLE_SHORT
    );
    packet
      .put(this.PACKET_TYPE.REGION_DATA)
      .put(flags)
      .putInt(replacement.regionId)
      .putInt(terrainBuffer.length)
      .putInt(objectLength)
      .writeBuffer(terrainBuffer);
    if (objectBuffer) {
      packet.writeBuffer(objectBuffer);
    }
    session.write(packet);
    return true;
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

  private static countObjectPlacements(data: Uint8Array | null): number {
    if (!data || data.length === 0) {
      return 0;
    }

    const stream = new CollisionBuffer(data);
    let count = 0;

    while (stream.offset < stream.length()) {
      const objectIdDelta = stream.getUSmart();
      if (objectIdDelta === 0) {
        break;
      }

      let location = 0;
      while (stream.offset < stream.length()) {
        const locationDelta = stream.getUSmart();
        if (locationDelta === 0) {
          break;
        }
        location += locationDelta - 1;

        if (stream.offset >= stream.length()) {
          break;
        }
        stream.readUnsignedByte();
        count++;
      }
    }

    return count;
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
}
