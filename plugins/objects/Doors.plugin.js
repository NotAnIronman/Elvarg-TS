"use strict";

const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { GameObject } = require("../../src/main/typescript/elvarg/game/entity/impl/object/GameObject");
const { ObjectManager } = require("../../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager");

const CLOSED_DOOR_IDS = new Set([1535, 14749, 14751]);

const COORD_OFFSETS = Object.freeze([
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]);

function cloneLocation(x, y, z) {
  return new Location(x, y, z);
}

function handleMappedDoor(player, object, objectId, location) {
  if (!object || !location) {
    return false;
  }

  const closedId = CLOSED_DOOR_IDS.has(objectId) ? objectId : objectId - 1;
  if (!CLOSED_DOOR_IDS.has(closedId)) {
    return false;
  }

  const open = objectId !== closedId;
  const nextId = open ? closedId : closedId + 1;
  const type = Number(object.getType?.() ?? object.type ?? 0);
  const rotation = Number(object.getFace?.() ?? object.face ?? 0) & 0x3;
  const nextRotation = open ? ((rotation + 1) & 0x3) : rotation;
  const offsetIndex = type === 9 ? ((nextRotation + 1) & 0x3) : nextRotation;
  const [dx, dy] = COORD_OFFSETS[offsetIndex] ?? [0, 0];
  const privateArea = player?.getPrivateArea?.() ?? null;

  const previousObject =
    object ??
    new GameObject(objectId, cloneLocation(location.x, location.y, location.z), type, rotation, privateArea);
  const nextObject = new GameObject(
    nextId,
    cloneLocation(location.x + dx, location.y + dy, location.z),
    type,
    open ? ((rotation - 1) & 0x3) : ((rotation + 1) & 0x3),
    privateArea
  );

  ObjectManager.register(nextObject, true);
  ObjectManager.deregister(previousObject, true);
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
  },
};
