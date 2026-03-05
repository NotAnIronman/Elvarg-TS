const { Location } = require("../../../src/main/typescript/elvarg/game/model/Location");
const { MapObjects } = require("../../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { RegionManager } = require("../../../src/main/typescript/elvarg/game/collision/RegionManager");

function regionBounds(regionId) {
  return {
    absX: (regionId >> 8) * 64,
    absY: (regionId & 0xff) * 64,
  };
}

function regionIdsForBounds(minX, maxX, minY, maxY) {
  const startRegionX = minX >> 6;
  const endRegionX = maxX >> 6;
  const startRegionY = minY >> 6;
  const endRegionY = maxY >> 6;
  const ids = [];
  for (let regionX = startRegionX; regionX <= endRegionX; regionX++) {
    for (let regionY = startRegionY; regionY <= endRegionY; regionY++) {
      ids.push(RegionManager.regionIdForTile(regionX << 6, regionY << 6));
    }
  }
  return ids;
}

function distanceSquared(aX, aY, bX, bY) {
  const dx = aX - bX;
  const dy = aY - bY;
  return dx * dx + dy * dy;
}

function createTraversalAssist(api, options = {}) {
  const trackedObjectIds = new Set(options.objectIds ?? []);
  const objectsByRegion = new Map();
  const indexedRegions = new Set();
  const regionScanInProgress = new Set();
  const regionScanBackoffUntil = new Map();
  const REGION_SCAN_RETRY_BACKOFF_MS = 1000;

  function isCachedObjectStillPresent(object, expectedObjectId = null) {
    if (!object) {
      return false;
    }
    const objectId =
      Number.isFinite(expectedObjectId) && expectedObjectId >= 0
        ? expectedObjectId
        : object.getId?.();
    const loc = object.getLocation?.();
    if (!Number.isFinite(objectId) || !loc) {
      return false;
    }
    const hash = MapObjects.getHash(loc.getX(), loc.getY(), loc.getZ());
    const bucket = MapObjects.mapObjects.get(hash);
    if (!bucket || bucket.length === 0) {
      return false;
    }
    if (bucket.includes(object)) {
      return true;
    }
    for (const candidate of bucket) {
      if (!candidate || candidate.getId?.() !== objectId) {
        continue;
      }
      const candidateLoc = candidate.getLocation?.();
      if (!candidateLoc) {
        continue;
      }
      if (
        candidateLoc.getX() === loc.getX() &&
        candidateLoc.getY() === loc.getY() &&
        candidateLoc.getZ() === loc.getZ()
      ) {
        return true;
      }
    }
    return false;
  }

  function trackObjectId(objectId) {
    if (trackedObjectIds.has(objectId)) {
      return;
    }
    trackedObjectIds.add(objectId);
    // Rebuild lazily with the expanded id set.
    indexedRegions.clear();
    objectsByRegion.clear();
  }

  function trackObjectIds(objectIds = []) {
    for (const objectId of objectIds) {
      trackObjectId(objectId);
    }
  }

  function upsertIndexedObject(regionId, objectId, object) {
    let byId = objectsByRegion.get(regionId);
    if (!byId) {
      byId = new Map();
      objectsByRegion.set(regionId, byId);
    }
    let list = byId.get(objectId);
    if (!list) {
      list = [];
      byId.set(objectId, list);
    }
    list.push(object);
  }

  function indexRegion(regionId) {
    if (indexedRegions.has(regionId)) {
      return;
    }

    const region = RegionManager.getRegionid(regionId);
    if (!region || !region.isLoaded()) {
      return;
    }

    const byId = new Map();
    for (const objectId of trackedObjectIds) {
      byId.set(objectId, []);
    }

    const { absX, absY } = regionBounds(regionId);
    for (let z = 0; z < 4; z++) {
      for (let localX = 0; localX < 64; localX++) {
        for (let localY = 0; localY < 64; localY++) {
          const x = absX + localX;
          const y = absY + localY;
          const hash = MapObjects.getHash(x, y, z);
          const objects = MapObjects.mapObjects.get(hash);
          if (!objects || objects.length === 0) {
            continue;
          }
          for (const object of objects) {
            const objectId = object?.getId?.();
            if (!trackedObjectIds.has(objectId)) {
              continue;
            }
            byId.get(objectId).push(object);
          }
        }
      }
    }

    objectsByRegion.set(regionId, byId);
    indexedRegions.add(regionId);
  }

  function ensureIndexedForBounds(minX, maxX, minY, maxY) {
    const regionIds = regionIdsForBounds(minX, maxX, minY, maxY);
    const nowMs = Date.now();
    for (const regionId of regionIds) {
      if (indexedRegions.has(regionId)) {
        continue;
      }
      const retryAt = regionScanBackoffUntil.get(regionId) ?? 0;
      if (retryAt > nowMs) {
        continue;
      }
      if (regionScanInProgress.has(regionId)) {
        continue;
      }
      regionScanInProgress.add(regionId);
      const { absX, absY } = regionBounds(regionId);
      try {
        RegionManager.loadMapFiles(absX, absY);
        indexRegion(regionId);
      } finally {
        regionScanInProgress.delete(regionId);
      }
      if (!indexedRegions.has(regionId)) {
        regionScanBackoffUntil.set(regionId, nowMs + REGION_SCAN_RETRY_BACKOFF_MS);
      } else if (regionScanBackoffUntil.has(regionId)) {
        regionScanBackoffUntil.delete(regionId);
      }
    }
    return regionIds;
  }

  function bruteFindInBounds(
    player,
    objectId,
    minX,
    maxX,
    minY,
    maxY,
    z,
    privateArea
  ) {
    let closest = null;
    let closestDistance = Number.MAX_SAFE_INTEGER;
    const playerX = player.getLocation().getX();
    const playerY = player.getLocation().getY();
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const object = MapObjects.get(
          objectId,
          new Location(x, y, z),
          privateArea
        );
        if (!object) {
          continue;
        }
        const dist = distanceSquared(playerX, playerY, x, y);
        if (dist < closestDistance) {
          closestDistance = dist;
          closest = object;
        }
      }
    }
    return closest;
  }

  function indexedFindInBounds(player, objectId, minX, maxX, minY, maxY, z) {
    const playerX = player.getLocation().getX();
    const playerY = player.getLocation().getY();
    let closest = null;
    let closestDistance = Number.MAX_SAFE_INTEGER;
    const regionIds = ensureIndexedForBounds(minX, maxX, minY, maxY);

    for (const regionId of regionIds) {
      const byId = objectsByRegion.get(regionId);
      if (!byId) {
        continue;
      }
      const objects = byId.get(objectId);
      if (!objects || objects.length === 0) {
        continue;
      }
      for (const object of objects) {
        const loc = object.getLocation();
        const x = loc.getX();
        const y = loc.getY();
        if (loc.getZ() !== z) {
          continue;
        }
        if (x < minX || x > maxX || y < minY || y > maxY) {
          continue;
        }
        // Skip stale cached references if the object has been removed.
        if (!isCachedObjectStillPresent(object, objectId)) {
          continue;
        }
        const dist = distanceSquared(playerX, playerY, x, y);
        if (dist < closestDistance) {
          closestDistance = dist;
          closest = object;
        }
      }
    }

    return closest;
  }

  function findNearestObject(player, objectId, radius = 10) {
    if (!player) {
      return null;
    }
    trackObjectId(objectId);

    const loc = player.getLocation();
    const baseX = loc.getX();
    const baseY = loc.getY();
    const z = loc.getZ();
    const minX = baseX - radius;
    const maxX = baseX + radius;
    const minY = baseY - radius;
    const maxY = baseY + radius;

    const privateArea = player.getPrivateArea();
    if (privateArea) {
      return bruteFindInBounds(
        player,
        objectId,
        minX,
        maxX,
        minY,
        maxY,
        z,
        privateArea
      );
    }

    return (
      indexedFindInBounds(player, objectId, minX, maxX, minY, maxY, z) ??
      bruteFindInBounds(player, objectId, minX, maxX, minY, maxY, z, null)
    );
  }

  function findObjectOnRoute(player, from, to, objectId, margin = 1) {
    if (!player || !from || !to) {
      return null;
    }
    trackObjectId(objectId);

    const z = from.z ?? player.getLocation().getZ();
    const minX = Math.min(from.x, to.x) - margin;
    const maxX = Math.max(from.x, to.x) + margin;
    const minY = Math.min(from.y, to.y) - margin;
    const maxY = Math.max(from.y, to.y) + margin;

    const privateArea = player.getPrivateArea();
    if (privateArea) {
      return bruteFindInBounds(
        player,
        objectId,
        minX,
        maxX,
        minY,
        maxY,
        z,
        privateArea
      );
    }

    return (
      indexedFindInBounds(player, objectId, minX, maxX, minY, maxY, z) ??
      bruteFindInBounds(player, objectId, minX, maxX, minY, maxY, z, null)
    );
  }

  function regionIdsAroundPlayer(player, regionRadius = 1) {
    if (!player) {
      return [];
    }
    const loc = player.getLocation?.();
    if (!loc) {
      return [];
    }
    const radius = Math.max(0, Math.floor(regionRadius));
    const minX = loc.getX() - radius * 64;
    const maxX = loc.getX() + radius * 64;
    const minY = loc.getY() - radius * 64;
    const maxY = loc.getY() + radius * 64;
    return ensureIndexedForBounds(minX, maxX, minY, maxY);
  }

  function preloadRegionsAround(x, y, regionRadius = 1) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }
    const radius = Math.max(0, Math.floor(regionRadius));
    const minX = x - radius * 64;
    const maxX = x + radius * 64;
    const minY = y - radius * 64;
    const maxY = y + radius * 64;
    return ensureIndexedForBounds(minX, maxX, minY, maxY);
  }

  function rebuildTrackedIndexFromLoadedMapObjects() {
    objectsByRegion.clear();
    indexedRegions.clear();
    if (trackedObjectIds.size === 0) {
      return 0;
    }

    const seenByRegion = new Map();
    let trackedCount = 0;
    for (const bucket of MapObjects.mapObjects.values()) {
      if (!bucket || bucket.length === 0) {
        continue;
      }
      for (const object of bucket) {
        const objectId = object?.getId?.();
        if (!trackedObjectIds.has(objectId)) {
          continue;
        }
        const loc = object.getLocation?.();
        if (!loc) {
          continue;
        }
        const regionId = RegionManager.regionIdForTile(loc.getX(), loc.getY());
        upsertIndexedObject(regionId, objectId, object);
        trackedCount++;

        let regionSeen = seenByRegion.get(regionId);
        if (!regionSeen) {
          regionSeen = new Set();
          seenByRegion.set(regionId, regionSeen);
        }
        regionSeen.add(objectId);
      }
    }

    for (const [regionId, seenIds] of seenByRegion.entries()) {
      const byId = objectsByRegion.get(regionId);
      if (!byId) {
        continue;
      }
      for (const objectId of trackedObjectIds) {
        if (!seenIds.has(objectId)) {
          byId.set(objectId, []);
        }
      }
      indexedRegions.add(regionId);
    }

    return trackedCount;
  }

  function findCandidatesByIds(player, objectIds, options = {}) {
    if (!player || !Array.isArray(objectIds) || objectIds.length === 0) {
      return [];
    }
    const loc = player.getLocation?.();
    if (!loc) {
      return [];
    }

    const privateArea = options.privateArea ?? player.getPrivateArea?.() ?? null;
    const targetZ = Number.isFinite(options.z) ? Math.floor(options.z) : loc.getZ();
    const regionRadius = Number.isFinite(options.regionRadius)
      ? Math.max(0, Math.floor(options.regionRadius))
      : 1;

    const uniqueIds = [...new Set(objectIds.filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) {
      return [];
    }

    if (privateArea) {
      const objects = privateArea.getObjects?.() ?? [];
      const regionX = loc.getX() >> 6;
      const regionY = loc.getY() >> 6;
      const result = [];
      for (const object of objects) {
        const objectId = object?.getId?.();
        if (!uniqueIds.includes(objectId)) {
          continue;
        }
        const objectLoc = object.getLocation?.();
        if (!objectLoc || objectLoc.getZ() !== targetZ) {
          continue;
        }
        const objectRegionX = objectLoc.getX() >> 6;
        const objectRegionY = objectLoc.getY() >> 6;
        if (
          Math.abs(objectRegionX - regionX) > regionRadius ||
          Math.abs(objectRegionY - regionY) > regionRadius
        ) {
          continue;
        }
        result.push(object);
      }
      return result;
    }

    for (const objectId of uniqueIds) {
      trackObjectId(objectId);
    }
    const regionIds = regionIdsAroundPlayer(player, regionRadius);
    const candidates = [];

    for (const regionId of regionIds) {
      const byId = objectsByRegion.get(regionId);
      if (!byId) {
        continue;
      }
      for (const objectId of uniqueIds) {
        const objects = byId.get(objectId);
        if (!objects || objects.length === 0) {
          continue;
        }
        for (const object of objects) {
          const objectLoc = object?.getLocation?.();
          if (!objectLoc || objectLoc.getZ() !== targetZ) {
            continue;
          }
          // Skip stale cached references if the object has been removed.
          if (!isCachedObjectStillPresent(object, objectId)) {
            continue;
          }
          candidates.push(object);
        }
      }
    }

    return candidates;
  }

  if (api && typeof api.onRegionLoaded === "function") {
    api.onRegionLoaded((event) => {
      indexRegion(event.regionId);
    });
  }

  return {
    regionIdForTile: RegionManager.regionIdForTile,
    findNearestObject,
    findObjectOnRoute,
    findCandidatesByIds,
    trackObjectId,
    trackObjectIds,
    preloadRegionsAround,
    rebuildTrackedIndexFromLoadedMapObjects,
  };
}

module.exports = {
  createTraversalAssist,
};
