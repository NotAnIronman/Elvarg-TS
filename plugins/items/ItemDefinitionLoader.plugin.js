const fs = require("fs");
const path = require("path");

const getGameConstants = () =>
  require("../../src/main/typescript/elvarg/game/GameConstants").GameConstants;
const getItemDefinition = () =>
  require("../../src/main/typescript/elvarg/game/definition/ItemDefinition")
    .ItemDefinition;
const getEquipmentType = () =>
  require("../../src/main/typescript/elvarg/game/model/EquipmentType")
    .EquipmentType;
const getWeaponInterfaces = () =>
  require("../../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces")
    .WeaponInterfaces;

function hydrateEquipmentType(raw) {
  const EquipmentType = getEquipmentType();
  if (raw && typeof raw.getSlot === "function") {
    return raw;
  }
  if (typeof raw === "string" && EquipmentType[raw] != null) {
    return EquipmentType[raw];
  }
  return EquipmentType.NONE;
}

function hydrateWeaponInterface(raw) {
  const WeaponInterfaces = getWeaponInterfaces();
  if (raw == null) {
    return null;
  }
  if (raw && typeof raw.getInterfaceId === "function") {
    return raw;
  }
  if (typeof raw === "string" && WeaponInterfaces[raw] != null) {
    return WeaponInterfaces[raw];
  }
  return null;
}

function getItemDefinitionsPath() {
  const GameConstants = getGameConstants();
  return path.resolve(
    process.cwd(),
    GameConstants.DEFINITIONS_DIRECTORY,
    "items.json"
  );
}

function loadItemDefinitions() {
  const ItemDefinition = getItemDefinition();
  const filePath = getItemDefinitionsPath();
  const content = fs.readFileSync(filePath, "utf8");
  const rawDefs = JSON.parse(content);
  const defs = Array.isArray(rawDefs) ? rawDefs : Object.values(rawDefs);

  ItemDefinition.definitions.clear();

  let loaded = 0;
  for (const rawDef of defs) {
    if (!rawDef || typeof rawDef !== "object") {
      continue;
    }

    const def = Object.assign(new ItemDefinition(), rawDef);
    def.equipmentType = hydrateEquipmentType(rawDef.equipmentType);
    def.weaponInterface = hydrateWeaponInterface(rawDef.weaponInterface);

    const id = rawDef.id ?? def.getId?.();
    if (!Number.isInteger(id) || id < 0) {
      continue;
    }

    ItemDefinition.definitions.set(id, def);
    loaded += 1;
  }

  return {
    filePath,
    loaded,
    total: ItemDefinition.definitions.size,
  };
}

module.exports = {
  name: "ItemDefinitionLoader",
  register(api) {
    const startedAt = Date.now();
    const result = loadItemDefinitions();
    api.log("loaded", {
      file: path.relative(process.cwd(), result.filePath),
      loaded: result.loaded,
      total: result.total,
      elapsedMs: Date.now() - startedAt,
    });
  },
};
