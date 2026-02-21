const { AreaManager } = require("../../src/main/typescript/elvarg/game/model/areas/AreaManager");
const { BasicAttackResponse } = require("../../src/main/typescript/elvarg/game/model/areas/Area");
const { CanAttackResponse } = require("../../src/main/typescript/elvarg/game/content/combat/CombatFactory");
const { MeleeCombatMethod } = require("../../src/main/typescript/elvarg/game/content/combat/method/impl/MeleeCombatMethod");
const { PathFinder } = require("../../src/main/typescript/elvarg/game/model/movement/path/PathFinder");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { RegionManager } = require("../../src/main/typescript/elvarg/game/collision/RegionManager");
const { CombatType } = require("../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { MovementQueue } = require("../../src/main/typescript/elvarg/game/model/movement/MovementQueue");
const { TimerKey } = require("../../src/main/typescript/elvarg/util/timers/TimerKey");
const { CoordinateState } = require("../../src/main/typescript/elvarg/game/entity/impl/npc/NPCMovementCoordinator");

const meleeMethod = new MeleeCombatMethod();

function normalizeAreaResponse(response) {
  if (response === BasicAttackResponse.CANT_ATTACK_IN_AREA) {
    return CanAttackResponse.CANT_ATTACK_IN_AREA;
  }
  if (response === BasicAttackResponse.CAN_ATTACK) {
    return CanAttackResponse.CAN_ATTACK;
  }
  return response;
}

function stepOut(attacker, target) {
  const tiles = [
    new Location(target.getLocation().getX() - 1, target.getLocation().getY()),
    new Location(target.getLocation().getX() + 1, target.getLocation().getY()),
    new Location(target.getLocation().getX(), target.getLocation().getY() + 1),
    new Location(target.getLocation().getX(), target.getLocation().getY() - 1),
  ];
  const privateArea = attacker.getPrivateArea();
  let closest = null;
  let distance = Number.MAX_VALUE;
  for (const tile of tiles) {
    if (RegionManager.blocked(tile, privateArea)) {
      continue;
    }
    const dist = attacker.getLocation().getDistance(tile);
    if (closest == null || dist < distance) {
      distance = dist;
      closest = tile;
    }
  }
  if (closest != null) {
    PathFinder.calculateWalkRoute(attacker, closest.getX(), closest.getY());
  }
}

function validTarget(attacker, target) {
  if (!attacker || !target) {
    return false;
  }
  if (typeof attacker.isRegistered === "function" && !attacker.isRegistered()) {
    return false;
  }
  if (typeof target.isRegistered === "function" && !target.isRegistered()) {
    return false;
  }
  if ((typeof attacker.getHitpoints === "function" && attacker.getHitpoints() <= 0)
    || (typeof target.getHitpoints === "function" && target.getHitpoints() <= 0)
    || (typeof attacker.isUntargetable === "function" && attacker.isUntargetable())) {
    return false;
  }
  if ((typeof attacker.getLocation === "function")
    && (typeof target.getLocation === "function")
    && attacker.getLocation().getDistance(target.getLocation()) >= 40) {
    return false;
  }

  if (typeof attacker.isNpc === "function" && attacker.isNpc()
    && typeof target.isPlayer === "function" && target.isPlayer()) {
    const owner = typeof attacker.getOwner === "function" ? attacker.getOwner() : null;
    if (owner && owner !== target) {
      return false;
    }
  } else if (typeof attacker.isPlayer === "function" && attacker.isPlayer()
    && typeof target.isNpc === "function" && target.isNpc()) {
    const owner = typeof target.getOwner === "function" ? target.getOwner() : null;
    if (owner && owner !== attacker) {
      if (typeof attacker.getPacketSender === "function") {
        attacker.getPacketSender().sendMessage("This npc was not spawned for you.");
      }
      return false;
    }
  }

  return true;
}

const combatEngine = {
  getMethod(attacker) {
    if (!attacker) {
      return meleeMethod;
    }
    return meleeMethod;
  },
  canReach(attacker, method, target) {
    if (!attacker || !target || !method) {
      return false;
    }

    if (!validTarget(attacker, target)) {
      if (attacker.getCombat && typeof attacker.getCombat === "function") {
        attacker.getCombat().reset();
      }
      return true;
    }

    const attackerMovement = attacker.getMovementQueue && attacker.getMovementQueue();
    const targetMovement = target.getMovementQueue && target.getMovementQueue();
    const targetIsMoving = targetMovement ? targetMovement.isMovings() : false;

    if (typeof attacker.isNpc === "function" && attacker.isNpc()) {
      const npc = attacker;
      const definition = typeof npc.getCurrentDefinition === "function" ? npc.getCurrentDefinition() : null;
      if (definition && typeof definition.doesRetreat === "function" && definition.doesRetreat()) {
        const coordinator = typeof npc.getMovementCoordinator === "function" ? npc.getMovementCoordinator() : null;
        if (coordinator && coordinator.getCoordinateState() === CoordinateState.RETREATING) {
          npc.getCombat().reset();
          return false;
        }
        const spawn = typeof npc.getSpawnPosition === "function" ? npc.getSpawnPosition() : null;
        if (spawn && npc.getLocation().getDistance(spawn) >= (definition.getCombatFollowDistance ? definition.getCombatFollowDistance() : 0)) {
          npc.getCombat().reset();
          if (coordinator) {
            coordinator.setCoordinateState(CoordinateState.RETREATING);
          }
          return false;
        }
      }
    }

    const attackDistance = typeof method.attackDistance === "function" ? method.attackDistance(attacker) : 1;
    const attackerLocation = attacker.getLocation();
    const targetLocation = target.getLocation();

    if (attackerLocation.equals(targetLocation)) {
      if (!attacker.getTimers().has(TimerKey.STEPPING_OUT)) {
        MovementQueue.clippedStep(attacker);
        attacker.getTimers().registers(TimerKey.STEPPING_OUT, 2);
      }
      return false;
    }

    let requiredDistance = attackDistance;
    const distance = attacker.calculateDistance(target);

    if (distance === 0) {
      if (typeof attacker.isPlayer === "function" && attacker.isPlayer()) {
        return false;
      }
      if (typeof attacker.isNpc === "function" && attacker.isNpc()
        && typeof attacker.size === "function" && attacker.size() === 0) {
        return false;
      }
    }

    if (method.type && method.type() === CombatType.MELEE && targetIsMoving
      && attackerMovement && attackerMovement.isMovings()) {
      requiredDistance++;
    }

    if (distance > requiredDistance) {
      return false;
    }

    const avoidDiagonal = method.type && method.type() === CombatType.MELEE
      && attacker.getSize() === 1
      && target.getSize() === 1
      && !targetIsMoving
      && targetMovement
      && !targetMovement.isMovings()
      && PathFinder.isDiagonalLocation(attacker, target);

    if (avoidDiagonal) {
      stepOut(attacker, target);
      return false;
    }

    if (attacker.useProjectileClipping && attacker.useProjectileClipping()
      && !RegionManager.canProjectileAttackReturn(attacker.getLocation(), target.getLocation(), attacker.getSize(), attacker.getPrivateArea())) {
      return false;
    }

    return true;
  },
  canAttack(attacker, method, target) {
    if (!attacker || !target) {
      return CanAttackResponse.INVALID_TARGET;
    }
    if (attacker === target) {
      return CanAttackResponse.INVALID_TARGET;
    }
    if ((typeof attacker.getHitpoints === "function" && attacker.getHitpoints() <= 0) ||
      (typeof target.getHitpoints === "function" && target.getHitpoints() <= 0)) {
      return CanAttackResponse.INVALID_TARGET;
    }

    const areaResponse = AreaManager.canAttack(attacker, target);
    const normalizedResponse = normalizeAreaResponse(areaResponse);

    if (normalizedResponse !== CanAttackResponse.CAN_ATTACK) {
      return normalizedResponse;
    }

    if (method && typeof method.canAttack === "function" && !method.canAttack(attacker, target)) {
      return CanAttackResponse.COMBAT_METHOD_NOT_ALLOWED;
    }

    return CanAttackResponse.CAN_ATTACK;
  },
  addPendingHit(hit) {
    if (!hit) {
      return;
    }
    const target = typeof hit.getTarget === "function" ? hit.getTarget() : null;
    if (!target || typeof target.getCombat !== "function") {
      return;
    }
    const attacker = typeof hit.getAttacker === "function" ? hit.getAttacker() : null;
    if (attacker && typeof target.getCombat().setUnderAttack === "function") {
      target.getCombat().setUnderAttack(attacker);
    }
    target.getCombat().getHitQueue().addPendingHit(hit);
  },
  executeHit(hit) {
    if (!hit) {
      return;
    }
    const target = typeof hit.getTarget === "function" ? hit.getTarget() : null;
    if (!target || typeof target.getCombat !== "function") {
      return;
    }
    const hits = typeof hit.getHits === "function" ? hit.getHits() : [];
    if (hits && hits.length > 0) {
      target.getCombat().getHitQueue().addPendingDamage(hits);
    }

    const attacker = typeof hit.getAttacker === "function" ? hit.getAttacker() : null;
    if (attacker && typeof target.getCombat().addDamage === "function") {
      const damage = typeof hit.getTotalDamage === "function" ? hit.getTotalDamage() : 0;
      target.getCombat().addDamage(attacker, damage);
    }

    if (typeof hit.getHandleAfterHitEffects === "function" && hit.getHandleAfterHitEffects()) {
      const method = typeof hit.getCombatMethod === "function" ? hit.getCombatMethod() : null;
      if (method && typeof method.handleAfterHitEffects === "function") {
        method.handleAfterHitEffects(hit);
      }
    }
  },
};

module.exports = {
  name: "BasicCombat",
  register(api) {
    api.setCombatEngine(combatEngine);
    api.log("combat", { message: "Basic combat engine registered" });
  },
};
