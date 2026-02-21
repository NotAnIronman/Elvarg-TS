const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const { randomInRange } = require("../navigation/BotNavigation");
const {
  resetMovementState,
  setModeRoaming,
} = require("../state/PlayerBotState");
const { resolveBotNodeContext } = require("../nodes/context/BotNodeContext");

const RETRY_ACTION_MIN_MS = 550;
const RETRY_ACTION_MAX_MS = 1800;
const POST_SPARRING_DECISION_MIN_MS = 3500;
const POST_SPARRING_DECISION_MAX_MS = 9000;
const POST_SPARRING_COOLDOWN_MIN_MS = 35000;
const POST_SPARRING_COOLDOWN_MAX_MS = 110000;

class SparringBehavior {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
  }

  tick(context) {
    const resolved = resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.behaviorMode.SPARRING,
      requireNotBusy: false,
      requireNotInCombat: false,
    });
    if (!resolved) {
      return "failure";
    }
    const { player, state, nowMs } = resolved;
    const sparring = state.sparring;
    if (!sparring?.targetUsername) {
      this.stopSparring(player, state, nowMs, "missing_target");
      return "success";
    }

    if (nowMs >= (sparring.endsAt ?? 0)) {
      this.stopSparring(player, state, nowMs, "expired");
      return "success";
    }

    const target = World.getPlayerByName(sparring.targetUsername);
    if (!this.isValidTarget(player, target)) {
      this.stopSparring(player, state, nowMs, "invalid_target");
      return "success";
    }

    const targetCombat = target.getCombat?.();
    const targetTarget = targetCombat?.getTarget?.();
    if (targetTarget && targetTarget !== player) {
      // Keep sparring one-on-one only.
      this.stopSparring(player, state, nowMs, "target_in_other_combat");
      return "success";
    }

    if (player.getForceMovement() != null) {
      return "running";
    }
    if (nowMs < (sparring.nextActionAt ?? 0)) {
      return "running";
    }

    const combat = player.getCombat?.();
    if (!combat) {
      return "failure";
    }
    const currentTarget = combat.getTarget?.();
    if (currentTarget && currentTarget !== target) {
      combat.reset?.();
    }

    if (combat.getTarget?.() !== target) {
      player.getMovementQueue?.().reset?.();
      player.setFollowing?.(target);
      player.setMobileInteraction?.(target);
      player.setPositionToFace?.(target.getLocation());
      combat.attack(target);
    }

    sparring.nextActionAt = nowMs + randomInRange(RETRY_ACTION_MIN_MS, RETRY_ACTION_MAX_MS);
    return "running";
  }

  isValidTarget(player, target) {
    if (!player || !target || target === player) {
      return false;
    }
    if (!target.isRegistered?.()) {
      return false;
    }
    if ((player.getHitpoints?.() ?? 0) <= 0 || (target.getHitpoints?.() ?? 0) <= 0) {
      return false;
    }
    if (player.getPrivateArea?.() !== target.getPrivateArea?.()) {
      return false;
    }
    return true;
  }

  stopSparring(player, state, nowMs, reason) {
    resetMovementState(player);
    setModeRoaming(player, state, this.behaviorMode);
    if (state?.autonomy) {
      state.autonomy.modeEndsAt = 0;
      state.autonomy.pvpCooldownUntil = Math.max(
        state.autonomy.pvpCooldownUntil ?? 0,
        nowMs + randomInRange(POST_SPARRING_COOLDOWN_MIN_MS, POST_SPARRING_COOLDOWN_MAX_MS)
      );
      state.autonomy.nextDecisionAt =
        nowMs + randomInRange(POST_SPARRING_DECISION_MIN_MS, POST_SPARRING_DECISION_MAX_MS);
    }
    this.api?.log?.("sparring_stopped", {
      username: player.getUsername?.(),
      reason,
    });
  }
}

module.exports = {
  SparringBehavior,
};
