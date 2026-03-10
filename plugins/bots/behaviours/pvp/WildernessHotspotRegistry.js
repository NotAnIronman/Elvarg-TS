"use strict";

const { Location } = require("../../../../src/main/typescript/elvarg/game/model/Location");

function freezeArea(area) {
  return Object.freeze({
    minX: area.minX,
    maxX: area.maxX,
    minY: area.minY,
    maxY: area.maxY,
    z: area.z ?? 0,
  });
}

function freezeHotspot(hotspot) {
  return Object.freeze({
    ...hotspot,
    area: freezeArea(hotspot.area),
    anchor: Object.freeze({ ...(hotspot.anchor ?? {}) }),
    roamRadius: Number.isFinite(hotspot.roamRadius)
      ? Math.max(1, Math.floor(hotspot.roamRadius))
      : 3,
    lingerMs: Number.isFinite(hotspot.lingerMs)
      ? Math.max(0, Math.floor(hotspot.lingerMs))
      : 10000,
    maxSimultaneousFights: Number.isFinite(hotspot.maxSimultaneousFights)
      ? Math.max(1, Math.floor(hotspot.maxSimultaneousFights))
      : null,
    allowedProfiles: Object.freeze([...(hotspot.allowedProfiles ?? [])]),
    allowedLoadouts: Object.freeze([...(hotspot.allowedLoadouts ?? [])]),
    styleWeights: Object.freeze({ ...(hotspot.styleWeights ?? {}) }),
    activityWeights: Object.freeze({ ...(hotspot.activityWeights ?? {}) }),
  });
}

const WILDERNESS_HOTSPOTS = Object.freeze({
  edge_ditch: freezeHotspot({
    id: "edge_ditch",
    label: "Edge Ditch",
    dangerTier: "medium",
    enabled: true,
    targetBots: 16,
    maxBots: 24,
    roamRadius: 3,
    lingerMs: 9000,
    maxSimultaneousFights: 3,
    area: { minX: 3084, maxX: 3094, minY: 3523, maxY: 3530, z: 0 },
    anchor: { x: 3089, y: 3526, z: 0 },
    allowedProfiles: ["standard", "veteran", "elite"],
    allowedLoadouts: [
      "edge_main_melee",
      "edge_ranged_melee",
      "rusher",
      "budget_pk",
    ],
    styleWeights: { melee: 0.45, range: 0.25, hybrid: 0.3 },
    activityWeights: { seek: 0.62, bait: 0.25, fight: 0.05, escape: 0.08 },
  }),
  varrock_ditch: freezeHotspot({
    id: "varrock_ditch",
    label: "Varrock Ditch (F2P)",
    dangerTier: "low",
    enabled: true,
    targetBots: 60,
    maxBots: 72,
    roamRadius: 3,
    lingerMs: 10000,
    maxSimultaneousFights: 6,
    area: { minX: 3232, maxX: 3255, minY: 3523, maxY: 3537, z: 0 },
    anchor: { x: 3243, y: 3524, z: 0 },
    allowedProfiles: ["novice", "standard", "veteran", "elite"],
    allowedLoadouts: [
      "f2p_strength_pure",
      "f2p_rune_pure",
      "f2p_range_ko",
      "f2p_bind_pure",
      "f2p_addy_pure",
      "f2p_mage_pure",
      "f2p_bind_ko",
    ],
    styleWeights: { melee: 0.48, range: 0.3, hybrid: 0.22 },
    activityWeights: { seek: 0.65, bait: 0.2, fight: 0.05, escape: 0.1 },
  }),
  revs_entrance: freezeHotspot({
    id: "revs_entrance",
    label: "Revs Entrance",
    dangerTier: "high",
    enabled: true,
    targetBots: 6,
    maxBots: 12,
    roamRadius: 4,
    lingerMs: 9500,
    area: { minX: 3129, maxX: 3139, minY: 3833, maxY: 3843, z: 0 },
    anchor: { x: 3134, y: 3838, z: 0 },
    allowedProfiles: ["standard", "veteran", "elite"],
    allowedLoadouts: ["deep_wild_hybrid", "anti_pk_hybrid", "edge_ranged_melee"],
    styleWeights: { melee: 0.12, range: 0.28, hybrid: 0.6 },
    activityWeights: { seek: 0.46, bait: 0.14, fight: 0.1, escape: 0.3 },
  }),
  green_drags_gate: freezeHotspot({
    id: "green_drags_gate",
    label: "Green Drags Gate",
    dangerTier: "medium",
    enabled: true,
    targetBots: 6,
    maxBots: 12,
    roamRadius: 4,
    lingerMs: 9500,
    area: { minX: 2981, maxX: 2991, minY: 3602, maxY: 3612, z: 0 },
    anchor: { x: 2986, y: 3607, z: 0 },
    allowedProfiles: ["novice", "standard", "veteran"],
    allowedLoadouts: ["budget_pk", "anti_pk_hybrid", "edge_main_melee"],
    styleWeights: { melee: 0.44, range: 0.18, hybrid: 0.38 },
    activityWeights: { seek: 0.54, bait: 0.16, fight: 0.08, escape: 0.22 },
  }),
});

const WILDERNESS_HOTSPOT_IDS = Object.freeze(Object.keys(WILDERNESS_HOTSPOTS));

function getWildernessHotspot(hotspotId) {
  return WILDERNESS_HOTSPOTS[hotspotId] ?? null;
}

function listWildernessHotspots() {
  return WILDERNESS_HOTSPOT_IDS.map((hotspotId) => WILDERNESS_HOTSPOTS[hotspotId]);
}

function getEnabledWildernessHotspots() {
  return listWildernessHotspots().filter((hotspot) => hotspot.enabled === true);
}

function hotspotContainsLocation(hotspot, location) {
  if (!hotspot?.area || !location) {
    return false;
  }
  const x = location.getX?.();
  const y = location.getY?.();
  const z = location.getZ?.();
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return false;
  }
  return (
    z === hotspot.area.z &&
    x >= hotspot.area.minX &&
    x <= hotspot.area.maxX &&
    y >= hotspot.area.minY &&
    y <= hotspot.area.maxY
  );
}

function createHotspotAnchorLocation(hotspot) {
  if (!hotspot?.anchor) {
    return null;
  }
  return new Location(hotspot.anchor.x, hotspot.anchor.y, hotspot.anchor.z ?? 0);
}

module.exports = {
  WILDERNESS_HOTSPOT_IDS,
  WILDERNESS_HOTSPOTS,
  createHotspotAnchorLocation,
  getEnabledWildernessHotspots,
  getWildernessHotspot,
  hotspotContainsLocation,
  listWildernessHotspots,
};
