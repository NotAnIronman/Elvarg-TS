const { resolveBotNodeContext } = require("../context/BotNodeContext");

class BotReadyConditionNode {
  constructor(botStatesByName, options = {}) {
    this.botStatesByName = botStatesByName;
    this.requiredMode = options.requiredMode ?? null;
  }

  tick(context) {
    return resolveBotNodeContext(context, this.botStatesByName, {
      requiredMode: this.requiredMode,
    })
      ? "success"
      : "failure";
  }
}

module.exports = {
  BotReadyConditionNode,
};
