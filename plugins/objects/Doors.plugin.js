"use strict";

const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { GameObject } = require("../../src/main/typescript/elvarg/game/entity/impl/object/GameObject");
const { ObjectManager } = require("../../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager");
const { MapObjects } = require("../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");

const CLOSED_DOOR_IDS = new Set([1521, 1524, 1535, 11727, 14749, 14751]);
const OPEN_DOOR_STATES = new Map();
const DOOR_RESYNC_TICKS_ATTR = "doors:resyncTicks";

const COORD_OFFSETS = Object.freeze([
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]);

function cloneLocation(x, y, z) {
  return new Location(x, y, z);
}

function locationKey(location) {
  if (!location) {
    return "0,0,0";
  }
  const x = location.getX?.() ?? location.x ?? 0;
  const y = location.getY?.() ?? location.y ?? 0;
  const z = location.getZ?.() ?? location.z ?? 0;
  return `${x},${y},${z}`;
}

function locationRegionId(location) {
  const x = location.getX?.() ?? location.x ?? 0;
  const y = location.getY?.() ?? location.y ?? 0;
  return ((x >> 6) << 8) | (y >> 6);
}

function toObjectSnapshot(object) {
  const location = object?.getLocation?.() ?? object?.location;
  return {
    id: Number(object?.getId?.() ?? object?.id ?? -1),
    type: Number(object?.getType?.() ?? object?.type ?? 0),
    face: Number(object?.getFace?.() ?? object?.face ?? 0) & 0x3,
    location: {
      x: location?.getX?.() ?? location?.x ?? 0,
      y: location?.getY?.() ?? location?.y ?? 0,
      z: location?.getZ?.() ?? location?.z ?? 0,
    },
  };
}

function objectFromSnapshot(snapshot, privateArea = null) {
  return new GameObject(
    snapshot.id,
    cloneLocation(snapshot.location.x, snapshot.location.y, snapshot.location.z),
    snapshot.type,
    snapshot.face,
    privateArea
  );
}

function resolveClosedId(objectId) {
  const closedId = CLOSED_DOOR_IDS.has(objectId) ? objectId : objectId - 1;
  return CLOSED_DOOR_IDS.has(closedId) ? closedId : null;
}

function findOpenDoorState(closedId, location) {
  const directKey = locationKey(location);
  const direct = OPEN_DOOR_STATES.get(directKey);
  if (direct?.closedId === closedId) {
    return [directKey, direct];
  }

  for (const [anchorKey, state] of OPEN_DOOR_STATES.entries()) {
    if (state.closedId !== closedId) {
      continue;
    }
    if (locationKey(state.current.location) === directKey) {
      return [anchorKey, state];
    }
  }

  return [directKey, null];
}

function rememberOpenDoor(anchorKey, closedObject, openObject) {
  OPEN_DOOR_STATES.set(anchorKey, {
    closedId: closedObject.id,
    closed: toObjectSnapshot(closedObject),
    current: toObjectSnapshot(openObject),
  });
}

function clearOpenDoor(anchorKey) {
  OPEN_DOOR_STATES.delete(anchorKey);
}

function stateMatchesPlayer(player, state) {
  if (!player || !state) {
    return false;
  }
  if (player.getPrivateArea?.() != null) {
    return false;
  }
  const playerLocation = player.getLocation?.();
  if (!playerLocation) {
    return false;
  }
  const closedLocation = cloneLocation(
    state.closed.location.x,
    state.closed.location.y,
    state.closed.location.z
  );
  const currentLocation = cloneLocation(
    state.current.location.x,
    state.current.location.y,
    state.current.location.z
  );
  return (
    playerLocation.isWithinDistance?.(closedLocation, 64) === true ||
    playerLocation.isWithinDistance?.(currentLocation, 64) === true
  );
}

function syncOpenDoorsToPlayer(player) {
  if (!player || player.getPrivateArea?.() != null) {
    return;
  }
  for (const state of OPEN_DOOR_STATES.values()) {
    if (!stateMatchesPlayer(player, state)) {
      continue;
    }
    player.getPacketSender?.().sendObjectRemoval?.(objectFromSnapshot(state.closed));
    player.getPacketSender?.().sendObject?.(objectFromSnapshot(state.current));
  }
}

function requestDoorResync(player, ticks = 3) {
  if (!player || player.getPrivateArea?.() != null) {
    return;
  }
  const current = Number(player.getAttribute?.(DOOR_RESYNC_TICKS_ATTR) ?? 0);
  if (ticks > current) {
    player.setAttribute?.(DOOR_RESYNC_TICKS_ATTR, ticks);
  }
}

function reapplyOpenDoorsForRegion(regionId) {
  for (const state of OPEN_DOOR_STATES.values()) {
    if (
      locationRegionId(state.closed.location) !== regionId &&
      locationRegionId(state.current.location) !== regionId
    ) {
      continue;
    }
    MapObjects.remove(objectFromSnapshot(state.closed));
    MapObjects.add(objectFromSnapshot(state.current));
  }
}

function handleMappedDoor(player, object, objectId, location) {
  if (!object || !location) {
    return false;
  }

  const closedId = resolveClosedId(objectId);
  if (closedId == null) {
    return false;
  }

  const [anchorKey, existingState] = findOpenDoorState(closedId, location);
  const activeObject = existingState?.current
    ? objectFromSnapshot(existingState.current, player?.getPrivateArea?.() ?? null)
    : object;
  const activeLocation = activeObject.getLocation?.() ?? location;
  const open = (activeObject.getId?.() ?? objectId) !== closedId;
  const nextId = open ? closedId : closedId + 1;
  const type = Number(activeObject.getType?.() ?? activeObject.type ?? 0);
  const rotation = Number(activeObject.getFace?.() ?? activeObject.face ?? 0) & 0x3;
  const nextRotation = open ? ((rotation + 1) & 0x3) : rotation;
  const offsetIndex = type === 9 ? ((nextRotation + 1) & 0x3) : nextRotation;
  const [dx, dy] = COORD_OFFSETS[offsetIndex] ?? [0, 0];
  const privateArea = player?.getPrivateArea?.() ?? null;

  const previousObject = activeObject;
  const nextObject = new GameObject(
    nextId,
    cloneLocation(
      (activeLocation.getX?.() ?? activeLocation.x ?? 0) + dx,
      (activeLocation.getY?.() ?? activeLocation.y ?? 0) + dy,
      activeLocation.getZ?.() ?? activeLocation.z ?? 0
    ),
    type,
    open ? ((rotation - 1) & 0x3) : ((rotation + 1) & 0x3),
    privateArea
  );

  ObjectManager.register(nextObject, true);
  ObjectManager.deregister(previousObject, true);
  requestDoorResync(player);

  if (open) {
    clearOpenDoor(anchorKey);
  } else {
    const closedObject = new GameObject(
      closedId,
      cloneLocation(
        location.getX?.() ?? location.x ?? 0,
        location.getY?.() ?? location.y ?? 0,
        location.getZ?.() ?? location.z ?? 0
      ),
      type,
      rotation,
      privateArea
    );
    rememberOpenDoor(anchorKey, closedObject, nextObject);
  }

  return true;
}

module.exports = {
  name: "Doors",
  register: (api) => {
    const objectIds = [...CLOSED_DOOR_IDS].flatMap((closedId) => [closedId, closedId + 1]);
    api.onObjectFirstClick(objectIds, ({ player, object, objectId, location }) => {
      if (!player || !object || !location) {
        return false;
      }
      return handleMappedDoor(player, object, objectId, location);
    });
    api.onRegionLoaded(({ regionId }) => {
      if (!Number.isInteger(regionId)) {
        return;
      }
      reapplyOpenDoorsForRegion(regionId);
    });
    api.onPlayerProcess(({ player }) => {
      if (!player || player.isPlayerBot?.() === true) {
        return;
      }
      if (player.isNeedsPlacement?.() === true || player.isAllowRegionChangePacket?.() === true) {
        requestDoorResync(player, 4);
      }
      const remaining = Number(player.getAttribute?.(DOOR_RESYNC_TICKS_ATTR) ?? 0);
      if (remaining <= 0) {
        return;
      }
      if (player.isAllowRegionChangePacket?.() === true) {
        return;
      }
      syncOpenDoorsToPlayer(player);
      player.setAttribute?.(DOOR_RESYNC_TICKS_ATTR, remaining - 1);
    });
  },
};
