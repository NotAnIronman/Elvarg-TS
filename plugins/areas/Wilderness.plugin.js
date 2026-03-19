const { Wilderness } = require("../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { Obelisks } = require("../../src/main/typescript/elvarg/game/content/Obelisks");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

function readPlayerTile(player) {
  const location = player?.getLocation?.();
  const tile = Location.readTile(location);
  if (!location || !tile) {
    return null;
  }
  return { location, ...tile };
}

function shareClanChat(attacker, target) {
  if (!attacker || !target || attacker === target) {
    return false;
  }
  const attackerClan = attacker.getCurrentClanChat?.();
  const targetClan = target.getCurrentClanChat?.();
  return attackerClan != null && attackerClan === targetClan;
}

function formatWildernessLevelText(tile) {
  const level = Wilderness.levelForY(tile.y);
  return `Level ${level}`;
}

function refreshWildernessUi(player, tile, inWilderness) {
  if (!player || player?.isPlayerBot?.() === true || !tile) {
    return;
  }

  if (inWilderness) {
    player.getPacketSender().sendInteractionOption("Attack", 2, true);
    player.getPacketSender().sendWalkableInterface(197);

    const level = Wilderness.levelForY(tile.y);
    if (player.getWildernessLevel() !== level) {
      player.setWildernessLevel(level);
    }
    player.getPacketSender().sendString(formatWildernessLevelText(tile), 199);

    const multiIcon = Wilderness.isMulti(tile.x, tile.y) ? 1 : 0;
    if (player.getMultiIcon() !== multiIcon) {
      player.setMultiIcon(multiIcon);
    }
    return;
  }

  player.getPacketSender().sendWalkableInterface(-1);
  player.getPacketSender().sendInteractionOption("null", 2, true);

  if (player.getWildernessLevel() !== 0) {
    player.setWildernessLevel(0);
  }
  if (player.getMultiIcon() !== 0) {
    player.setMultiIcon(0);
  }
}

function isInWildernessCached(cache, player) {
  const tile = readPlayerTile(player);
  if (!tile) {
    return false;
  }
  const state = cache.get(player);
  if (Location.isSameTile(state, tile) && typeof state.inWilderness === "boolean") {
    return state.inWilderness;
  }
    const inWilderness = Wilderness.isInLocation(tile.location);
  cache.set(player, {
    ...state,
    x: tile.x,
    y: tile.y,
    z: tile.z,
    inWilderness,
  });
  return inWilderness;
}

function getCachedInWilderness(cache, player) {
  if (!player) {
    return false;
  }
  const state = cache.get(player);
  const tile = readPlayerTile(player);
  if (tile && Location.isSameTile(state, tile) && typeof state?.inWilderness === "boolean") {
    return state.inWilderness;
  }
  if (!tile && state && typeof state.inWilderness === "boolean") {
    return state.inWilderness;
  }
  const inWilderness = tile
    ? Wilderness.isInLocation(tile.location)
    : Wilderness.isIn(player);
  cache.set(player, {
    ...state,
    ...(tile ?? {}),
    inWilderness,
  });
  return inWilderness;
}

function getCachedCanAttackDecision(cache, attacker, target, attackerState, targetState) {
  const attackerEntries = cache.get(attacker);
  const entry = attackerEntries?.get(target);
  if (!entry) {
    return null;
  }
  if (
    entry.attackerLevel !== (attacker?.getWildernessLevel?.() | 0) ||
    entry.targetLevel !== (target?.getWildernessLevel?.() | 0) ||
    !Location.isSameTile(entry.attackerTile, attackerState) ||
    !Location.isSameTile(entry.targetTile, targetState)
  ) {
    return null;
  }
  return entry.allow;
}

function cacheCanAttackDecision(cache, attacker, target, attackerState, targetState, allow) {
  let attackerEntries = cache.get(attacker);
  if (!attackerEntries) {
    attackerEntries = new WeakMap();
    cache.set(attacker, attackerEntries);
  }
  attackerEntries.set(target, {
    attackerLevel: attacker?.getWildernessLevel?.() | 0,
    targetLevel: target?.getWildernessLevel?.() | 0,
    attackerTile: attackerState ? { x: attackerState.x, y: attackerState.y, z: attackerState.z } : null,
    targetTile: targetState ? { x: targetState.x, y: targetState.y, z: targetState.z } : null,
    allow,
  });
}

module.exports = {
  name: "Wilderness",
  register(api) {
    const inWildState = new Map();
    const canAttackCache = new WeakMap();

    api.onPlayerProcess(({ player }) => {
      const tile = readPlayerTile(player);
      if (!tile) {
        return;
      }
      const isBot = player?.isPlayerBot?.() === true;
      const previous = inWildState.get(player);
      if (Location.isSameTile(previous, tile) && typeof previous.inWilderness === "boolean") {
        return;
      }

      const inWilderness = Wilderness.isInLocation(tile.location);
      const wasInWilderness = previous?.inWilderness === true;
      const nextState = {
        ...previous,
        x: tile.x,
        y: tile.y,
        z: tile.z,
        inWilderness,
      };

      if (inWilderness) {
        if (!isBot) {
          // Reassert wilderness UI while moving in wild; other interface/setup
          // packets can clear the attack option or walkable interface after entry.
          refreshWildernessUi(player, tile, true);
        }

        const level = Wilderness.levelForY(tile.y);
        if (player.getWildernessLevel() !== level) {
          player.setWildernessLevel(level);
          if (!isBot) {
            player.getPacketSender().sendString(formatWildernessLevelText(tile), 199);
          }
        }

        if (!isBot) {
          const multiIcon = Wilderness.isMulti(tile.x, tile.y) ? 1 : 0;
          if (player.getMultiIcon() !== multiIcon) {
            player.setMultiIcon(multiIcon);
          }
        }
      } else {
        if (!isBot && wasInWilderness) {
          refreshWildernessUi(player, tile, false);
        }

        if (player.getWildernessLevel() !== 0) {
          player.setWildernessLevel(0);
        }
        if (!isBot && player.getMultiIcon() !== 0) {
          player.setMultiIcon(0);
        }
      }

      inWildState.set(player, nextState);
    });

    api.onPlayerLogin(({ player }) => {
      const tile = readPlayerTile(player);
      if (!tile) {
        return;
      }
      const inWilderness = Wilderness.isInLocation(tile.location);
      inWildState.set(player, {
        x: tile.x,
        y: tile.y,
        z: tile.z,
        inWilderness,
      });
      refreshWildernessUi(player, tile, inWilderness);
    });

    api.onPlayerDisconnect(({ player }) => {
      inWildState.delete(player);
    });

    api.onCanTeleport((event) => {
      if (event.allow !== null) {
        return;
      }
      const { player } = event;
      const wildernessLevel = player?.getWildernessLevel?.() | 0;
      if (wildernessLevel <= 0 && !getCachedInWilderness(inWildState, player)) {
        return;
      }
      if (
        player.getWildernessLevel() > 20 &&
        player.getRights() !== PlayerRights.DEVELOPER
      ) {
        player
          .getPacketSender()
          .sendMessage("Teleport spells are blocked in this level of Wilderness.");
        player
          .getPacketSender()
          .sendMessage(
            "You must be below level 20 of Wilderness to use teleportation spells."
          );
        event.allow = false;
      }
    });

    api.onCanAttack((event) => {
      if (event.allow !== null) {
        return;
      }
      const { attacker, target } = event;
      if (!attacker?.isPlayer?.() || !target?.isPlayer?.()) {
        return;
      }
      if (shareClanChat(attacker, target)) {
        attacker
          .getPacketSender?.()
          .sendMessage?.("You cannot attack a player who is in your clan chat.");
        event.allow = false;
        return;
      }
      const attackerLevel = attacker?.getWildernessLevel?.() | 0;
      const targetLevel = target?.getWildernessLevel?.() | 0;

      if (attackerLevel > 0 && targetLevel > 0) {
        event.allow = true;
        return;
      }

      const attackerState = readPlayerTile(attacker) ?? inWildState.get(attacker) ?? null;
      const targetState = readPlayerTile(target) ?? inWildState.get(target) ?? null;
      const cachedDecision = getCachedCanAttackDecision(
        canAttackCache,
        attacker,
        target,
        attackerState,
        targetState
      );
      if (typeof cachedDecision === "boolean") {
        event.allow = cachedDecision;
        return;
      }

      const attackerInWild = getCachedInWilderness(inWildState, attacker);
      const targetInWild = getCachedInWilderness(inWildState, target);
      if (attackerInWild && targetInWild) {
        event.allow = true;
      } else if (attackerInWild || targetInWild) {
        event.allow = false;
      }
      if (typeof event.allow === "boolean") {
        cacheCanAttackDecision(
          canAttackCache,
          attacker,
          target,
          attackerState,
          targetState,
          event.allow
        );
      }
    });

    api.onNpcAggressionTolerance((event) => {
      if (event.override !== null) {
        return;
      }
      const wildernessLevel = event.player?.getWildernessLevel?.() | 0;
      if (wildernessLevel > 0 || getCachedInWilderness(inWildState, event.player)) {
        event.override = true;
      }
    });

    api.onObjectFirstClick(Obelisks.OBELISK_IDS, (event) => {
      if (!Wilderness.isIn(event.player)) {
        return;
      }
      if (Obelisks.activate(event.objectId)) {
        event.handled = true;
      }
    });

    api.log("registered");
  },
};
