const { World } = require("../../../../src/main/typescript/elvarg/game/World");
const {
  chooseNextTarget,
  retargetAfterBlocked,
} = require("../navigation/BotNavigation");
const { setModeReturnHome } = require("../state/PlayerBotState");

class PathBlockedHandler {
  constructor({ botStatesByName, traversalService, api, options }) {
    this.botStatesByName = botStatesByName;
    this.traversalService = traversalService;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.followBlockedRetryMs = options.followBlockedRetryMs;
    this.blockedRetargetMinDelayMs = options.blockedRetargetMinDelayMs;
    this.blockedRetargetMaxDelayMs = options.blockedRetargetMaxDelayMs;
    this.botWalkRadius = options.botWalkRadius;
  }

  handle(event, nowMs = Date.now()) {
    const state = this.botStatesByName.get(event.username);
    if (!state || state.awaitingDitchTransition) {
      return;
    }
    if (nowMs < (state.roaming?.nextWalkAt ?? 0)) {
      return;
    }

    const player = event.entity;
    if (!player || !player.isRegistered()) {
      return;
    }
    if (player.getForceMovement() != null) {
      return;
    }
    if (player.getMovementQueue()?.size?.() > 0) {
      return;
    }

    if (state.mode === this.behaviorMode.RETURN_HOME) {
      return;
    }

    if (state.mode === this.behaviorMode.FOLLOW_BACK) {
      this.handleFollowBackBlocked(player, state, event, nowMs);
      return;
    }

    if (state.mode === this.behaviorMode.WOODCUTTING) {
      this.handleWoodcuttingBlocked(player, state, event, nowMs);
      return;
    }

    if (state.mode === this.behaviorMode.MINING) {
      this.handleMiningBlocked(player, state, event, nowMs);
      return;
    }

    if (state.mode === this.behaviorMode.BANK_RUN) {
      this.handleBankRunBlocked(player, state, event, nowMs);
      return;
    }

    if (state.mode === this.behaviorMode.SPARRING) {
      return;
    }

    this.handleRoamBlocked(player, state, event, nowMs);
  }

  handleFollowBackBlocked(player, state, event, nowMs) {
    const followTarget = state.followTargetUsername
      ? World.getPlayerByName(state.followTargetUsername)
      : null;

    if (!followTarget || !followTarget.isRegistered()) {
      setModeReturnHome(player, state, this.behaviorMode);
      return;
    }

    if (!state.roaming) {
      return;
    }
    state.roaming.target = {
      x: followTarget.getLocation().getX(),
      y: followTarget.getLocation().getY(),
      z: followTarget.getLocation().getZ(),
    };

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      state.roaming.target
    );
    if (!traversalObject) {
      state.roaming.nextWalkAt = nowMs + this.followBlockedRetryMs;
      return;
    }

    const currentY = player.getLocation().getY();
    const targetY = state.roaming.target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, targetY, objectY)) {
      state.roaming.nextWalkAt = nowMs + this.followBlockedRetryMs;
      return;
    }

    this.traversalService.requestCross(player, state, traversalObject, nowMs);
  }

  handleRoamBlocked(player, state, event, nowMs) {
    if (!state.roaming?.target) {
      const fallbackTarget = chooseNextTarget(
        player,
        state,
        this.botWalkRadius
      );
      if (!fallbackTarget) {
        return;
      }
      state.roaming.target = fallbackTarget;
    }

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      state.roaming.target
    );
    if (!traversalObject) {
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "no_ditch_on_route",
        event,
        nowMs,
        this.blockedRetargetMinDelayMs,
        this.blockedRetargetMaxDelayMs,
        this.botWalkRadius
      );
      return;
    }

    const currentY = player.getLocation().getY();
    const targetY = state.roaming.target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, targetY, objectY)) {
      retargetAfterBlocked(
        player,
        state,
        this.api,
        "ditch_not_between_current_and_target",
        event,
        nowMs,
        this.blockedRetargetMinDelayMs,
        this.blockedRetargetMaxDelayMs,
        this.botWalkRadius
      );
      return;
    }

    this.traversalService.requestCross(player, state, traversalObject, nowMs);
  }

  handleWoodcuttingBlocked(player, state, event, nowMs) {
    const target = state.woodcutting?.target;
    if (!target) {
      return;
    }

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      target
    );
    if (!traversalObject) {
      state.woodcutting.target = null;
      state.woodcutting.nextSearchAt = nowMs + this.blockedRetargetMaxDelayMs;
      state.woodcutting.nextActionAt = nowMs + this.blockedRetargetMinDelayMs;
      return;
    }

    const currentY = player.getLocation().getY();
    const targetY = target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, targetY, objectY)) {
      state.woodcutting.target = null;
      state.woodcutting.nextSearchAt = nowMs + this.blockedRetargetMaxDelayMs;
      state.woodcutting.nextActionAt = nowMs + this.blockedRetargetMinDelayMs;
      return;
    }

    this.traversalService.requestCross(player, state, traversalObject, nowMs);
  }

  handleMiningBlocked(player, state, event, nowMs) {
    const target = state.mining?.target;
    if (!target) {
      return;
    }

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      target
    );
    if (!traversalObject) {
      state.mining.target = null;
      state.mining.nextSearchAt = nowMs + this.blockedRetargetMaxDelayMs;
      state.mining.nextActionAt = nowMs + this.blockedRetargetMinDelayMs;
      return;
    }

    const currentY = player.getLocation().getY();
    const targetY = target.y;
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, targetY, objectY)) {
      state.mining.target = null;
      state.mining.nextSearchAt = nowMs + this.blockedRetargetMaxDelayMs;
      state.mining.nextActionAt = nowMs + this.blockedRetargetMinDelayMs;
      return;
    }

    this.traversalService.requestCross(player, state, traversalObject, nowMs);
  }

  handleBankRunBlocked(player, state, event, nowMs) {
    const bankRun = state.bankRun;
    const target = bankRun?.travelTarget;
    if (!target) {
      this.api.log("bank_run_blocked_no_target", {
        username: player.getUsername?.(),
        bankRunId: bankRun?.id ?? null,
        phase: bankRun?.phase ?? null,
        fromX: event?.from?.x ?? null,
        fromY: event?.from?.y ?? null,
        fromZ: event?.from?.z ?? null,
      });
      return;
    }

    const traversalObject = this.traversalService.findObjectOnRoute(
      player,
      event.from,
      target
    );
    if (!traversalObject) {
      this.api.log("bank_run_blocked_no_traversal_object", {
        username: player.getUsername?.(),
        bankRunId: bankRun?.id ?? null,
        phase: bankRun?.phase ?? null,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
        fromX: event?.from?.x ?? null,
        fromY: event?.from?.y ?? null,
        fromZ: event?.from?.z ?? null,
      });
      if (bankRun.phase === "to_bank") {
        bankRun.bankTarget = null;
      }
      bankRun.nextActionAt = nowMs + this.blockedRetargetMinDelayMs;
      return;
    }

    const currentY = player.getLocation().getY();
    const objectY = traversalObject.getLocation().getY();
    if (!this.traversalService.isObjectBetween(currentY, target.y, objectY)) {
      this.api.log("bank_run_blocked_traversal_not_between", {
        username: player.getUsername?.(),
        bankRunId: bankRun?.id ?? null,
        phase: bankRun?.phase ?? null,
        currentY,
        targetY: target.y,
        objectX: traversalObject.getLocation().getX(),
        objectY,
        objectZ: traversalObject.getLocation().getZ(),
      });
      if (bankRun.phase === "to_bank") {
        bankRun.bankTarget = null;
      }
      bankRun.nextActionAt = nowMs + this.blockedRetargetMinDelayMs;
      return;
    }

    const requested = this.traversalService.requestCross(
      player,
      state,
      traversalObject,
      nowMs
    );
    this.api.log("bank_run_blocked_request_cross", {
      username: player.getUsername?.(),
      bankRunId: bankRun?.id ?? null,
      phase: bankRun?.phase ?? null,
      requested,
      objectX: traversalObject.getLocation().getX(),
      objectY: traversalObject.getLocation().getY(),
      objectZ: traversalObject.getLocation().getZ(),
      targetX: target.x,
      targetY: target.y,
      targetZ: target.z,
    });
  }
}

module.exports = {
  PathBlockedHandler,
};
