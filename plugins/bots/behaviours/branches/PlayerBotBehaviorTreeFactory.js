const {
  ActionNode,
  CooldownNode,
  SelectorNode,
  SequenceNode,
} = require("../../../../src/main/typescript/elvarg/game/bot/BehaviorTree");
const { FollowBackActionNode } = require("../nodes/actions/FollowBackActionNode");
const { EatFoodActionNode } = require("../nodes/actions/EatFoodActionNode");
const {
  ProcessPendingMovementActionNode,
} = require("../nodes/actions/ProcessPendingMovementActionNode");
const { ReturnHomeActionNode } = require("../nodes/actions/ReturnHomeActionNode");
const { BotReadyConditionNode } = require("../nodes/conditions/BotReadyConditionNode");

function requireModeBehavior(modeHandlers, modeValue, label) {
  const behavior = modeHandlers?.[modeValue];
  if (!behavior || typeof behavior.tick !== "function") {
    throw new Error(
      `PlayerBotBehaviorTreeFactory missing mode handler for ${label} (${modeValue}) with tick(context).`
    );
  }
  return behavior;
}

class PlayerBotBehaviorTreeFactory {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.followRepathIntervalMs = options.followRepathIntervalMs;
    this.botEatLowHpRatio = options.botEatLowHpRatio;
    this.botEatHealMin = options.botEatHealMin;
    this.botEatHealMax = options.botEatHealMax;
    this.botEatMaxCharges = options.botEatMaxCharges;
    this.botHomeRadius = options.botHomeRadius;
    this.blockedRetargetMinDelayMs = options.blockedRetargetMinDelayMs;
    this.modeHandlers = options.modeHandlers;
    this.traversalService = options.traversalService ?? null;
    this.roamingBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.ROAMING,
      "ROAMING"
    );
    this.pvpBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.PVP,
      "PVP"
    );
    this.woodcuttingBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.WOODCUTTING,
      "WOODCUTTING"
    );
    this.miningBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.MINING,
      "MINING"
    );
    this.smeltingBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.SMELTING,
      "SMELTING"
    );
    this.bankRunBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.BANK_RUN,
      "BANK_RUN"
    );
    this.firemakingBehavior = requireModeBehavior(
      this.modeHandlers,
      this.behaviorMode.FIREMAKING,
      "FIREMAKING"
    );
    this.eatFoodActionNode = new EatFoodActionNode(botStatesByName, api, {
      lowHpRatio: this.botEatLowHpRatio,
      minHeal: this.botEatHealMin,
      maxHeal: this.botEatHealMax,
      maxCharges: this.botEatMaxCharges,
    });
  }

  create(cooldownMs, initialDelayMs) {
    return new SelectorNode([
      new ProcessPendingMovementActionNode(this.botStatesByName, this.api, {
        traversalService: this.traversalService,
      }),
      new ActionNode((context) => this.eatFoodActionNode.tick(context)),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.RETURN_HOME,
        }),
        new ReturnHomeActionNode(this.botStatesByName, this.api, {
          behaviorMode: this.behaviorMode,
          botHomeRadius: this.botHomeRadius,
          blockedRetargetMinDelayMs: this.blockedRetargetMinDelayMs,
        }),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.FOLLOW_BACK,
        }),
        new FollowBackActionNode(this.botStatesByName, this.api, {
          behaviorMode: this.behaviorMode,
          followRepathIntervalMs: this.followRepathIntervalMs,
        }),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.BANK_RUN,
          requireNotBusy: false,
          requireNotInCombat: false,
        }),
        new ActionNode((context) =>
          this.bankRunBehavior.tick({
            ...context,
            traversalService: this.traversalService,
          })
        ),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.WOODCUTTING,
        }),
        new ActionNode((context) => this.woodcuttingBehavior.tick(context)),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.MINING,
        }),
        new ActionNode((context) => this.miningBehavior.tick(context)),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.SMELTING,
          requireNotInCombat: false,
          requireNotBusy: false,
        }),
        new ActionNode((context) => this.smeltingBehavior.tick(context)),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.FIREMAKING,
          requireNotBusy: false,
          requireNotInCombat: false,
        }),
        new ActionNode((context) => this.firemakingBehavior.tick(context)),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.PVP,
          requireNotInCombat: false,
          requireNotBusy: false,
        }),
        new ActionNode((context) => this.pvpBehavior.tick(context)),
      ]),
      new SequenceNode([
        new BotReadyConditionNode(this.botStatesByName, {
          requiredMode: this.behaviorMode.ROAMING,
        }),
        new CooldownNode(
          cooldownMs,
          new ActionNode((context) => this.roamingBehavior.tick(context)),
          initialDelayMs
        ),
      ]),
    ]);
  }
}

module.exports = {
  PlayerBotBehaviorTreeFactory,
};
