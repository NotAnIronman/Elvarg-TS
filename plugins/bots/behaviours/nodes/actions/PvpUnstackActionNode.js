const { RegionManager } = require("../../../../../src/main/typescript/elvarg/game/collision/RegionManager");
const { ActionNode } = require("../../../../../src/main/typescript/elvarg/game/bot/BehaviorTree");
const { Location } = require("../../../../../src/main/typescript/elvarg/game/model/Location");
const {GameConstants} = require("../../../../../src/main/typescript/elvarg/game/GameConstants");

const UNSTACK_CHECK_INTERVAL_MS = GameConstants.GAME_ENGINE_PROCESSING_CYCLE_RATE * 2;
const UNSTACK_COOLDOWN_MS = 900;

class PvpUnstackActionNode extends ActionNode {
  constructor(botStatesByName, api, options = {}) {
    super((context) => this.tick(context));
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
  }

  tick(context) {
    const player = context?.player;
    const nowMs = Number(context?.nowMs ?? Date.now());
    const username = player?.getUsername?.();
    const state = username ? this.botStatesByName.get(username) : null;
    if (!player || !state || state.mode !== this.behaviorMode?.PVP) {
      return "failure";
    }

    const pvp = state.pvp;
    const preferredTarget =
      pvp?.targetPlayer ??
      player.getCombat?.()?.getTarget?.() ??
      player.getInteractingMobile?.() ??
      null;
    const overlapTarget = this.findOverlapTarget(player, preferredTarget);
    if (!overlapTarget) {
      return "failure";
    }
    if (player.getPrivateArea?.() !== overlapTarget.getPrivateArea?.()) {
      return "failure";
    }
    if (player.getForceMovement?.() != null) {
      return "failure";
    }
    const playerLoc = player.getLocation?.();
    const targetLoc = overlapTarget.getLocation?.();
    if (!playerLoc || !targetLoc || !playerLoc.equals(targetLoc)) {
      return "failure";
    }
    // Do not reject stacked bots just because combat-follow already queued steps.
    // When they are standing on top of the target, the purpose of this node is to
    // replace that queued path with a single sidestep.
    // The check interval is meant to skip repeated unstack evaluation work while
    // bots are in stable PvP states. Keep it after the trivial state guards above
    // so normal non-candidates do not consume the timer, but before the same-tile
    // and adjacent-tile search below because those are the comparatively expensive
    // parts of the node.
    if (nowMs < Number(pvp?.nextUnstackCheckAt ?? 0)) {
      return "failure";
    }
    pvp.nextUnstackCheckAt = nowMs + UNSTACK_CHECK_INTERVAL_MS;
    // The action cooldown is separate from the evaluation throttle: we still rate
    // limit actual sidesteps even if the node is allowed to re-check whether the
    // bot is stacked on its target.
    if (nowMs < Number(pvp?.nextUnstackAt ?? 0)) {
      return "failure";
    }

    const nextTile = this.chooseAdjacentTile(player, overlapTarget);
    pvp.nextUnstackAt = nowMs + UNSTACK_COOLDOWN_MS;
    if (!nextTile) {
      return "failure";
    }

    player.getMovementQueue?.().reset?.();
    player.getMovementQueue?.().addFirstStep?.(nextTile);
    player.setPositionToFaceCoordinates?.(
      targetLoc.getX(),
      targetLoc.getY(),
      targetLoc.getZ()
    );
    return "success";
  }

  findOverlapTarget(player, preferredTarget) {
    const playerLoc = player.getLocation?.();
    const privateArea = player.getPrivateArea?.();
    if (!playerLoc) {
      return null;
    }

    const matchesTile = (candidate) => {
      if (!candidate || candidate === player || !candidate.isRegistered?.()) {
        return false;
      }
      if (candidate.getPrivateArea?.() !== privateArea) {
        return false;
      }
      const loc = candidate.getLocation?.();
      return !!(
        loc &&
        loc.getX() === playerLoc.getX() &&
        loc.getY() === playerLoc.getY() &&
        loc.getZ() === playerLoc.getZ()
      );
    };

    if (matchesTile(preferredTarget)) {
      return preferredTarget;
    }

    const localPlayers = player.getLocalPlayers?.() ?? [];
    for (const candidate of localPlayers) {
      if (matchesTile(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  isOccupiedByOtherPlayer(tile, player, target) {
    const tileX = tile.getX();
    const tileY = tile.getY();
    const tileZ = tile.getZ();
    const privateArea = player.getPrivateArea?.();
    const localPlayers = player.getLocalPlayers?.() ?? [];
    for (const candidate of localPlayers) {
      if (!candidate || candidate === player || candidate === target) {
        continue;
      }
      if (!candidate.isRegistered?.()) {
        continue;
      }
      if (candidate.getPrivateArea?.() !== privateArea) {
        continue;
      }
      const loc = candidate.getLocation?.();
      if (!loc) {
        continue;
      }
      if (loc.getX() === tileX && loc.getY() === tileY && loc.getZ() === tileZ) {
        return true;
      }
    }
    return false;
  }

  chooseAdjacentTile(player, target) {
    const current = player.getLocation?.();
    const privateArea = player.getPrivateArea?.() ?? null;
    const size = Number(player.getSize?.() ?? 1);
    if (!current) {
      return null;
    }

    const candidates = [
      new Location(current.getX() - 1, current.getY(), current.getZ()),
      new Location(current.getX() + 1, current.getY(), current.getZ()),
      new Location(current.getX(), current.getY() - 1, current.getZ()),
      new Location(current.getX(), current.getY() + 1, current.getZ()),
    ];

    let bestTile = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of candidates) {
      if (RegionManager.blocked(tile, privateArea)) {
        continue;
      }
      if (!RegionManager.canMovestart(current, tile, size, size, privateArea)) {
        continue;
      }
      if (this.isOccupiedByOtherPlayer(tile, player, target)) {
        continue;
      }
      const distance = tile.getDistance(target.getLocation?.());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTile = tile;
      }
    }
    return bestTile;
  }
}

module.exports = {
  PvpUnstackActionNode,
};
