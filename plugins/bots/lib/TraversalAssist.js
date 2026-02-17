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

  function trackObjectId(objectId) {
    if (trackedObjectIds.has(objectId)) {
      return;
    }
    trackedObjectIds.add(objectId);
    // Rebuild lazily with the expanded id set.
    indexedRegions.clear();
    objectsByRegion.clear();
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
    for (const regionId of regionIds) {
      if (indexedRegions.has(regionId)) {
        continue;
      }
      const { absX, absY } = regionBounds(regionId);
      RegionManager.loadMapFiles(absX, absY);
      indexRegion(regionId);
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
        if (!MapObjects.get(objectId, loc, null)) {
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

  if (api && typeof api.onRegionLoaded === "function") {
    api.onRegionLoaded((event) => {
      if (!event || !Number.isInteger(event.regionId)) {
        return;
      }
      indexRegion(event.regionId);
    });
  }

  return {
    regionIdForTile: RegionManager.regionIdForTile,
    findNearestObject,
    findObjectOnRoute,
  };
}

module.exports = {
  createTraversalAssist,
};
