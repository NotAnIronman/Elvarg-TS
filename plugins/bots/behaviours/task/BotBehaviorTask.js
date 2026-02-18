const { Task } = require("../../../../src/main/typescript/elvarg/game/task/Task");

class BotBehaviorTask extends Task {
  constructor(entries, traversalService, decisionTicks) {
    super(decisionTicks);
    this.entries = entries;
    this.traversalService = traversalService;
  }

  execute() {
    const now = Date.now();
    for (const entry of this.entries) {
      try {
        this.traversalService.processTransition(entry.player, entry.state, now);
        this.traversalService.processPendingRetry(entry.player, entry.state, now);
        entry.controller.tick(now);
      } catch (err) {
        console.error("[bots] behavior tick failed", err);
      }
    }
  }
}

module.exports = {
  BotBehaviorTask,
};
