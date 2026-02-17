const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Equipment } = require("../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { Task } = require("../../src/main/typescript/elvarg/game/task/Task");
const { TaskManager } = require("../../src/main/typescript/elvarg/game/task/TaskManager");
const { MapObjects } = require("../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { GameObject } = require("../../src/main/typescript/elvarg/game/entity/impl/object/GameObject");
const { ObjectManager } = require("../../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager");
const { ItemIds, ObjectIds } = require("../../src/main/typescript/elvarg/util/IdEnums");

const TREE_STUMP_OBJECT_ID = ObjectIds.TREE_STUMP_3;
const CHOP_ANIMATION_INTERVAL_TICKS = 4;
const MULTI_TREE_DEPLETION_ROLL_MAX = 15;
const MULTI_TREE_DEPLETION_THRESHOLD = 2;

const AXES = [
  { id: ItemIds.BRONZE_AXE, requiredLevel: 1, speed: 0.03, animationId: 879 },
  { id: ItemIds.IRON_AXE, requiredLevel: 1, speed: 0.05, animationId: 877 },
  { id: ItemIds.STEEL_AXE, requiredLevel: 6, speed: 0.09, animationId: 875 },
  { id: ItemIds.BLACK_AXE, requiredLevel: 6, speed: 0.11, animationId: 873 },
  { id: ItemIds.MITHRIL_AXE, requiredLevel: 21, speed: 0.13, animationId: 871 },
  { id: ItemIds.ADAMANT_AXE, requiredLevel: 31, speed: 0.16, animationId: 869 },
  { id: ItemIds.RUNE_AXE, requiredLevel: 41, speed: 0.19, animationId: 867 },
  { id: ItemIds.DRAGON_AXE, requiredLevel: 61, speed: 0.25, animationId: 2846 },
  { id: ItemIds.INFERNAL_AXE, requiredLevel: 61, speed: 0.30, animationId: 2117 },
];

const AXES_BY_REQUIREMENT_DESC = [...AXES].sort(
  (a, b) => b.requiredLevel - a.requiredLevel
);

const TREES = [
  {
    name: "normal tree",
    requiredLevel: 1,
    xpReward: 25,
    logId: ItemIds.LOGS,
    objectIds: [
      ObjectIds.EVERGREEN_3,
      ObjectIds.JUNGLE_TREE_3,
      ObjectIds.TREE,
      ObjectIds.TREE_2,
      ObjectIds.TREE_3,
      ObjectIds.TREE_4,
      ObjectIds.TREE_5,
      ObjectIds.DEAD_TREE,
      ObjectIds.DEAD_TREE_2,
      ObjectIds.DEAD_TREE_3,
      ObjectIds.DEAD_TREE_4,
      ObjectIds.DEAD_TREE_5,
      ObjectIds.DEAD_TREE_8,
      ObjectIds.DEAD_TREE_9,
      ObjectIds.DEAD_TREE_10,
      1315,
      1316,
      ObjectIds.EVERGREEN,
      ObjectIds.EVERGREEN_2,
      ObjectIds.TREE_9,
      ObjectIds.TREE_10,
      ObjectIds.TREE_11,
      ObjectIds.DEAD_TREE_12,
      ObjectIds.DEAD_TREE_13,
      ObjectIds.DEAD_TREE_14,
      3033,
      3034,
      3035,
      3036,
      ObjectIds.TREE_16,
      ObjectIds.TREE_17,
      ObjectIds.TREE_18,
      ObjectIds.DEAD_TREE_18,
      ObjectIds.DEAD_TREE_19,
      ObjectIds.DEAD_TREE_20,
    ],
    cycles: 10,
    respawnTicks: 8,
    multi: false,
  },
  {
    name: "achey tree",
    requiredLevel: 1,
    xpReward: 25,
    logId: ItemIds.ACHEY_TREE_LOGS,
    objectIds: [ObjectIds.ACHEY_TREE],
    cycles: 13,
    respawnTicks: 9,
    multi: false,
  },
  {
    name: "oak",
    requiredLevel: 15,
    xpReward: 38,
    logId: ItemIds.OAK_LOGS,
    objectIds: [1281, ObjectIds.ARCTIC_PINE, ObjectIds.OAK_8, ObjectIds.OAK],
    cycles: 14,
    respawnTicks: 11,
    multi: true,
  },
  {
    name: "willow",
    requiredLevel: 30,
    xpReward: 68,
    logId: ItemIds.WILLOW_LOGS,
    objectIds: [1308, 5551, 5552, 5553, ObjectIds.WILLOW, ObjectIds.WILLOW_3],
    cycles: 15,
    respawnTicks: 14,
    multi: true,
  },
  {
    name: "teak",
    requiredLevel: 35,
    xpReward: 85,
    logId: ItemIds.TEAK_LOGS,
    objectIds: [ObjectIds.TEAK],
    cycles: 16,
    respawnTicks: 16,
    multi: true,
  },
  {
    name: "dramen",
    requiredLevel: 36,
    xpReward: 88,
    logId: ItemIds.DRAMEN_BRANCH,
    objectIds: [ObjectIds.DRAMEN_TREE],
    cycles: 16,
    respawnTicks: 17,
    multi: true,
  },
  {
    name: "maple",
    requiredLevel: 45,
    xpReward: 100,
    logId: ItemIds.MAPLE_LOGS,
    objectIds: [ObjectIds.MAPLE_TREE, ObjectIds.MAPLE_TREE_3],
    cycles: 17,
    respawnTicks: 18,
    multi: true,
  },
  {
    name: "mahogany",
    requiredLevel: 50,
    xpReward: 125,
    logId: ItemIds.MAHOGANY_LOGS,
    objectIds: [ObjectIds.MAHOGANY],
    cycles: 17,
    respawnTicks: 20,
    multi: true,
  },
  {
    name: "yew",
    requiredLevel: 60,
    xpReward: 175,
    logId: ItemIds.YEW_LOGS,
    objectIds: [1309, ObjectIds.YEW],
    cycles: 18,
    respawnTicks: 28,
    multi: true,
  },
  {
    name: "magic",
    requiredLevel: 75,
    xpReward: 250,
    logId: ItemIds.MAGIC_LOGS,
    objectIds: [ObjectIds.MAGIC_TREE],
    cycles: 20,
    respawnTicks: 40,
    multi: true,
  },
  {
    name: "redwood",
    requiredLevel: 90,
    xpReward: 380,
    logId: ItemIds.REDWOOD_LOGS,
    objectIds: [],
    cycles: 22,
    respawnTicks: 43,
    multi: true,
  },
];

const TREES_BY_OBJECT_ID = new Map();
for (const tree of TREES) {
  for (const objectId of tree.objectIds) {
    TREES_BY_OBJECT_ID.set(objectId, tree);
  }
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getWoodcuttingLevel(player) {
  return player.getSkillManager().getCurrentLevel(Skill.WOODCUTTING);
}

function getEquippedWeaponId(player) {
  const equippedWeapon =
    player.getEquipment().getItems()[Equipment.WEAPON_SLOT];
  return equippedWeapon ? equippedWeapon.getId() : -1;
}

function findBestUsableAxe(player) {
  const woodcuttingLevel = getWoodcuttingLevel(player);
  const equippedWeaponId = getEquippedWeaponId(player);
  const inventory = player.getInventory();

  for (const axe of AXES_BY_REQUIREMENT_DESC) {
    if (woodcuttingLevel < axe.requiredLevel) {
      continue;
    }
    if (equippedWeaponId === axe.id || inventory.contains(axe.id)) {
      return axe;
    }
  }

  return null;
}

function calculateCyclesRequired(player, tree, axe) {
  let cycles = tree.cycles + randomIntInclusive(0, 4);
  cycles -= getWoodcuttingLevel(player) * 0.1;
  cycles -= cycles * axe.speed;
  return Math.max(3, Math.floor(cycles));
}

function shouldDepleteTree(tree) {
  if (!tree.multi) {
    return true;
  }
  const roll = randomIntInclusive(0, MULTI_TREE_DEPLETION_ROLL_MAX);
  return roll >= MULTI_TREE_DEPLETION_THRESHOLD;
}

function stopWoodcutting(activeSessions, player, resetAnimation = true) {
  if (!activeSessions.has(player)) {
    return;
  }
  activeSessions.delete(player);
  if (resetAnimation) {
    player.performAnimation(Animation.DEFAULT_RESET_ANIMATION);
  }
}

class TreeRespawnTask extends Task {
  constructor(delayTicks, originalTreeObject, stumpObject) {
    super(Math.max(1, delayTicks));
    this.originalTreeObject = originalTreeObject;
    this.stumpObject = stumpObject;
  }

  execute() {
    const existingStump = MapObjects.get(
      this.stumpObject.getId(),
      this.stumpObject.getLocation(),
      this.stumpObject.getPrivateArea()
    );
    if (existingStump) {
      ObjectManager.deregister(existingStump, true);
    }

    // Always re-register the original tree so clients receive an explicit spawn
    // update, even if cache-backed map objects can still resolve this id/location.
    ObjectManager.register(this.originalTreeObject, true);

    this.stop();
  }
}

function depleteTree(treeObject, tree) {
  const stump = new GameObject(
    TREE_STUMP_OBJECT_ID,
    treeObject.getLocation().clone(),
    treeObject.getType(),
    treeObject.getFace(),
    treeObject.getPrivateArea()
  );
  ObjectManager.deregister(treeObject, true);
  ObjectManager.register(stump, true);
  TaskManager.submit(new TreeRespawnTask(tree.respawnTicks, treeObject, stump));
}

function startWoodcutting(player, treeObject, tree, activeSessions) {
  const axe = findBestUsableAxe(player);
  if (!axe) {
    player
      .getPacketSender()
      .sendMessage("You don't have an axe which you can use.");
    return false;
  }

  const woodcuttingLevel = getWoodcuttingLevel(player);
  if (woodcuttingLevel < tree.requiredLevel) {
    player
      .getPacketSender()
      .sendMessage(
        `You need a Woodcutting level of at least ${tree.requiredLevel} to cut this tree.`
      );
    return false;
  }

  if (player.getInventory().isFull()) {
    player.getInventory().full();
    return false;
  }

  const location = treeObject.getLocation().clone();
  const existingTree = MapObjects.get(
    treeObject.getId(),
    location,
    treeObject.getPrivateArea()
  );
  if (!existingTree) {
    player
      .getPacketSender()
      .sendMessage("You can't reach that tree right now.");
    return false;
  }

  player.getSkillManager()?.stopSkillable?.();
  stopWoodcutting(activeSessions, player, false);

  activeSessions.set(player, {
    tree,
    axe,
    objectId: treeObject.getId(),
    location,
    privateArea: treeObject.getPrivateArea(),
    cyclesUntilReward: calculateCyclesRequired(player, tree, axe),
    nextAnimationTick: 0,
  });

  player.getPacketSender().sendMessage("You swing your axe at the tree..");
  player.performAnimation(new Animation(axe.animationId));
  return true;
}

function processWoodcuttingTick(activeSessions, currentTick) {
  for (const [player, state] of activeSessions) {
    if (!player || !player.isRegistered() || player.getHitpoints() <= 0) {
      activeSessions.delete(player);
      continue;
    }

    if (player.getForceMovement() != null) {
      continue;
    }

    if (player.getMovementQueue()?.size?.() > 0) {
      stopWoodcutting(activeSessions, player);
      continue;
    }

    const activeTree = MapObjects.get(
      state.objectId,
      state.location,
      state.privateArea
    );
    if (!activeTree) {
      stopWoodcutting(activeSessions, player);
      continue;
    }

    if (
      !player.getLocation().isWithinInteractionDistance(activeTree.getLocation())
    ) {
      stopWoodcutting(activeSessions, player);
      continue;
    }

    const axe = findBestUsableAxe(player);
    if (!axe) {
      player
        .getPacketSender()
        .sendMessage("You don't have an axe which you can use.");
      stopWoodcutting(activeSessions, player);
      continue;
    }

    const woodcuttingLevel = getWoodcuttingLevel(player);
    if (woodcuttingLevel < axe.requiredLevel) {
      player
        .getPacketSender()
        .sendMessage(
          "You don't have an axe which you have the required Woodcutting level to use."
        );
      stopWoodcutting(activeSessions, player);
      continue;
    }

    if (woodcuttingLevel < state.tree.requiredLevel) {
      player
        .getPacketSender()
        .sendMessage(
          `You need a Woodcutting level of at least ${state.tree.requiredLevel} to cut this tree.`
        );
      stopWoodcutting(activeSessions, player);
      continue;
    }

    state.axe = axe;

    if (player.getInventory().isFull()) {
      player.getInventory().full();
      stopWoodcutting(activeSessions, player);
      continue;
    }

    if (currentTick >= state.nextAnimationTick) {
      player.performAnimation(new Animation(state.axe.animationId));
      state.nextAnimationTick = currentTick + CHOP_ANIMATION_INTERVAL_TICKS;
    }

    state.cyclesUntilReward--;
    if (state.cyclesUntilReward > 0) {
      continue;
    }

    player.getInventory().adds(state.tree.logId, 1);
    player.getPacketSender().sendMessage("You get some logs.");
    player.getSkillManager().addExperiences(Skill.WOODCUTTING, state.tree.xpReward);

    if (shouldDepleteTree(state.tree)) {
      depleteTree(activeTree, state.tree);
      stopWoodcutting(activeSessions, player);
      continue;
    }

    state.cyclesUntilReward = calculateCyclesRequired(
      player,
      state.tree,
      state.axe
    );
  }
}

class WoodcuttingTask extends Task {
  constructor(activeSessions) {
    super(1);
    this.activeSessions = activeSessions;
    this.currentTick = 0;
  }

  execute() {
    this.currentTick++;
    processWoodcuttingTick(this.activeSessions, this.currentTick);
  }
}

module.exports = {
  name: "Woodcutting",
  register(api) {
    const activeSessions = new Map();

    TaskManager.submit(new WoodcuttingTask(activeSessions));

    api.onPlayerDisconnect(({ player }) => {
      if (!player) {
        return;
      }
      stopWoodcutting(activeSessions, player, false);
    });

    api.onObjectInteraction((event) => {
      if (!event || event.handled || event.clickType !== 1) {
        return;
      }

      const tree = TREES_BY_OBJECT_ID.get(event.objectId);
      if (!tree || !event.player || !event.object) {
        return;
      }

      const started = startWoodcutting(
        event.player,
        event.object,
        tree,
        activeSessions
      );
      if (started) {
        api.log("start", {
          username: event.player.getUsername(),
          tree: tree.name,
          objectId: event.objectId,
          x: event.location?.x,
          y: event.location?.y,
          z: event.location?.z,
        });
      }

      // Tree clicks are fully handled by this plugin (including fail messages).
      event.handled = true;
    });

    api.log("registered", {
      treeObjectIds: TREES_BY_OBJECT_ID.size,
      supportedTrees: TREES.filter((tree) => tree.objectIds.length > 0).length,
      axes: AXES.length,
    });
  },
};
