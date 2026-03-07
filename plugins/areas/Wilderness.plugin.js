const { Wilderness } = require("../../src/main/typescript/elvarg/game/content/wilderness/Wilderness");
const { BountyHunter } = require("../../src/main/typescript/elvarg/game/content/combat/bountyhunter/BountyHunter");
const { Obelisks } = require("../../src/main/typescript/elvarg/game/content/Obelisks");
const { PlayerRights } = require("../../src/main/typescript/elvarg/game/model/rights/PlayerRights");

function addToWildList(player) {
  if (player?.isPlayerBot?.()) {
    return;
  }
  if (!BountyHunter.PLAYERS_IN_WILD.includes(player)) {
    BountyHunter.PLAYERS_IN_WILD.push(player);
  }
}

function removeFromWildList(player) {
  const index = BountyHunter.PLAYERS_IN_WILD.indexOf(player);
  if (index >= 0) {
    BountyHunter.PLAYERS_IN_WILD.splice(index, 1);
  }
}

module.exports = {
  name: "Wilderness",
  register(api) {
    const inWildState = new Map();

    api.onPlayerProcess(({ player }) => {
      if (player?.isPlayerBot?.()) {
        return;
      }
      const username = player?.getUsername?.();
      if (!username) {
        return;
      }
      const location = player.getLocation();
      const inWilderness = Wilderness.isInLocation(location);
      const wasInWilderness = inWildState.get(username) === true;

      if (inWilderness && !wasInWilderness) {
        player.getPacketSender().sendInteractionOption("Attack", 2, true);
        player.getPacketSender().sendWalkableInterface(197);
        addToWildList(player);
        BountyHunter.updateInterface(player);
      } else if (!inWilderness && wasInWilderness) {
        player.getPacketSender().sendWalkableInterface(-1);
        player.getPacketSender().sendInteractionOption("null", 2, true);
        player.setWildernessLevel(0);
        removeFromWildList(player);
      }

      if (inWilderness) {
        const level = Wilderness.levelForY(location.getY());
        player.setWildernessLevel(level);
        player.getPacketSender().sendString(`Level: ${level}`, 199);

        const multiIcon = Wilderness.isMulti(
          location.getX(),
          location.getY()
        )
          ? 1
          : 0;
        if (player.getMultiIcon() !== multiIcon) {
          player.setMultiIcon(multiIcon);
          player.getPacketSender().sendMultiIcon(multiIcon);
        }
      } else if (player.getMultiIcon() !== 0) {
        player.setMultiIcon(0);
        player.getPacketSender().sendMultiIcon(0);
      }

      inWildState.set(username, inWilderness);
    });

    api.onPlayerDisconnect(({ player, username }) => {
      inWildState.delete(username);
      removeFromWildList(player);
    });

    api.onCanTeleport((event) => {
      if (event.allow !== null) {
        return;
      }
      const { player } = event;
      if (!Wilderness.isIn(player)) {
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
      const attackerInWild = Wilderness.isIn(attacker);
      const targetInWild = Wilderness.isIn(target);
      if (attackerInWild && targetInWild) {
        event.allow = true;
      } else if (attackerInWild || targetInWild) {
        event.allow = false;
      }
    });

    api.onNpcAggressionTolerance((event) => {
      if (event.override !== null) {
        return;
      }
      if (Wilderness.isIn(event.player)) {
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

    api.onPlayerDefeated(({ killer, victim }) => {
      if (!killer || !victim) {
        return;
      }
      if (!Wilderness.isIn(killer) || !Wilderness.isIn(victim)) {
        return;
      }
      BountyHunter.onDeath(killer, victim, true, 50);
    });

    api.log("registered");
  },
};
