const { PluginManager } = require("../../../../src/main/typescript/elvarg/plugins/PluginManager");
const { MapObjects } = require("../../../../src/main/typescript/elvarg/game/entity/impl/object/MapObjects");
const { ItemOnGroundManager } = require("../../../../src/main/typescript/elvarg/game/entity/impl/grounditem/ItemOnGroundManager");
const { Item } = require("../../../../src/main/typescript/elvarg/game/model/Item");
const { Skill } = require("../../../../src/main/typescript/elvarg/game/model/Skill");
const { Equipment } = require("../../../../src/main/typescript/elvarg/game/model/container/impl/Equipment");
const { Flag } = require("../../../../src/main/typescript/elvarg/game/model/Flag");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");
const Woodcutting = require("../../../skills/Woodcutting.plugin");

const RETRY_SEARCH_MS = 1500;
const WALK_COMMAND_COOLDOWN_MS = 900;
const DROP_LOGS_COOLDOWN_MS = 300;

class WoodcuttingBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.WOODCUTTING,
      requireNotBusy: false,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    if (!state.woodcutting) {
      return "failure";
    }

    if (Woodcutting.isWoodcuttingActive(player)) {
      return "running";
    }

    if (nowMs < (state.woodcutting.nextActionAt ?? 0)) {
      return "running";
    }

    if (player.getInventory().isFull()) {
      const dropped = this.dropAllWoodcuttingLogs(player);
      state.woodcutting.nextActionAt = nowMs + DROP_LOGS_COOLDOWN_MS;
      if (dropped) {
        this.api.log("woodcutting_drop_logs", { username: player.getUsername() });
      }
      return "running";
    }

    const axe = this.equipBestAxeForWoodcutting(player);
    if (!axe) {
      state.woodcutting.nextActionAt = nowMs + RETRY_SEARCH_MS;
      return "failure";
    }

    let targetTree = this.resolveTargetTreeObject(player, state);
    if (!targetTree) {
      if (nowMs < (state.woodcutting.nextSearchAt ?? 0)) {
        return "running";
      }
      state.woodcutting.nextSearchAt = nowMs + RETRY_SEARCH_MS;

      const treeTiers = this.resolveBestTreeTiersForLevel(
        this.getWoodcuttingLevel(player)
      );
      if (!treeTiers || treeTiers.length === 0) {
        return "failure";
      }
      for (const treeTier of treeTiers) {
        targetTree = this.findNearestTreeObjectForTier(player, treeTier);
        if (targetTree) {
          break;
        }
      }
      if (!targetTree) {
        state.woodcutting.target = null;
        return "failure";
      }
      state.woodcutting.target = {
        objectId: targetTree.getId(),
        x: targetTree.getLocation().getX(),
        y: targetTree.getLocation().getY(),
        z: targetTree.getLocation().getZ(),
      };
    }

    if (player.getForceMovement() != null) {
      return "running";
    }
    if (player.getMovementQueue()?.size?.() > 0) {
      return "running";
    }

    const targetLocation = targetTree.getLocation();
    player.getMovementQueue().walkToObject(targetTree, {
      execute: () => {
        PluginManager.emitObjectInteraction({
          player,
          object: targetTree,
          objectId: targetTree.getId(),
          clickType: 1,
          location: {
            x: targetLocation.getX(),
            y: targetLocation.getY(),
            z: targetLocation.getZ(),
          },
          sourceLocation: {
            x: player.getLocation().getX(),
            y: player.getLocation().getY(),
            z: player.getLocation().getZ(),
          },
          handled: false,
        });
      },
    });
    state.woodcutting.nextActionAt = nowMs + WALK_COMMAND_COOLDOWN_MS;
    return "running";
  }

  getWoodcuttingLevel(player) {
    return player.getSkillManager().getCurrentLevel(Skill.WOODCUTTING);
  }

  resolveBestTreeTiersForLevel(level) {
    return Woodcutting.TREES.filter(
      (tree) => tree.objectIds?.length && tree.requiredLevel <= level
    ).sort((a, b) => b.requiredLevel - a.requiredLevel);
  }

  findNearestTreeObjectForTier(player, treeTier) {
    if (!player || !treeTier) {
      return null;
    }
    const loc = player.getLocation();
    const privateArea = player.getPrivateArea();
    const treeIds = new Set(treeTier.objectIds);
    let bestObject = null;
    let bestDistSq = Number.MAX_SAFE_INTEGER;

    for (const objects of MapObjects.mapObjects.values()) {
      if (!objects || objects.length === 0) {
        continue;
      }
      for (const object of objects) {
        if (!object || !treeIds.has(object.getId())) {
          continue;
        }
        if (object.getPrivateArea() !== privateArea) {
          continue;
        }
        const objectLoc = object.getLocation();
        if (!objectLoc || objectLoc.getZ() !== loc.getZ()) {
          continue;
        }
        const dx = objectLoc.getX() - loc.getX();
        const dy = objectLoc.getY() - loc.getY();
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestObject = object;
        }
      }
    }

    return bestObject;
  }

  equipBestAxeForWoodcutting(player) {
    const level = this.getWoodcuttingLevel(player);
    const axe = Woodcutting.findBestUsableAxeByLevel(level);
    if (!axe) {
      return null;
    }

    const equipment = player.getEquipment();
    const equipped = equipment.getItems()[Equipment.WEAPON_SLOT];
    if (equipped && equipped.getId() === axe.id) {
      return axe;
    }

    equipment.set(Equipment.WEAPON_SLOT, new Item(axe.id, 1));
    equipment.refreshItems();
    player.getUpdateFlag().flag(Flag.APPEARANCE);
    return axe;
  }

  dropAllWoodcuttingLogs(player) {
    const inventory = player.getInventory();
    let droppedAny = false;
    for (const logId of Woodcutting.TREE_LOG_IDS) {
      const amount = inventory.getAmount(logId);
      if (amount <= 0) {
        continue;
      }
      inventory.delete(logId, amount);
      ItemOnGroundManager.registerLocation(
        player,
        new Item(logId, amount),
        player.getLocation().clone()
      );
      droppedAny = true;
    }
    return droppedAny;
  }

  resolveTargetTreeObject(player, state) {
    const target = state?.woodcutting?.target;
    if (!target) {
      return null;
    }
    const location = player.getLocation().clone();
    location.set(target.x, target.y, target.z);
    return MapObjects.get(target.objectId, location, player.getPrivateArea());
  }
}

module.exports = {
  WoodcuttingBehavior,
};
