const {
  ActionNode,
  CooldownNode,
  SelectorNode,
  SequenceNode,
} = require("../../../../src/main/typescript/elvarg/game/bot/BehaviorTree");
const { FollowBackActionNode } = require("../nodes/actions/FollowBackActionNode");
const { ReturnHomeActionNode } = require("../nodes/actions/ReturnHomeActionNode");
const { BotReadyConditionNode } = require("../nodes/conditions/BotReadyConditionNode");
const { RoamingBehavior } = require("../modes/RoamingBehavior");
const { WoodcuttingBehavior } = require("../modes/WoodcuttingBehavior");

class PlayerBotBehaviorTreeFactory {
  constructor(botStatesByName, api, options) {
    this.botStatesByName = botStatesByName;
    this.api = api;
    this.behaviorMode = options.behaviorMode;
    this.endpointLingerMs = options.endpointLingerMs;
    this.followRepathIntervalMs = options.followRepathIntervalMs;
    this.botHomeRadius = options.botHomeRadius;
    this.blockedRetargetMinDelayMs = options.blockedRetargetMinDelayMs;
    this.botWalkRadius = options.botWalkRadius;
    this.roamingBehavior = new RoamingBehavior(botStatesByName, {
      behaviorMode: this.behaviorMode,
      endpointLingerMs: this.endpointLingerMs,
      botWalkRadius: this.botWalkRadius,
    });
    this.woodcuttingBehavior = new WoodcuttingBehavior(botStatesByName, api, {
      behaviorMode: this.behaviorMode,
    });
  }

  create(cooldownMs, initialDelayMs) {
    return new SelectorNode([
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
          requiredMode: this.behaviorMode.WOODCUTTING,
        }),
        new ActionNode((context) => this.woodcuttingBehavior.tick(context)),
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
