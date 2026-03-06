const { callModeHook } = require("../hooks/ModeHookContract");

class NpcAggroPolicyHandler {
  constructor({ botStatesByName, modeHandlers, api }) {
    this.botStatesByName = botStatesByName;
    this.modeHandlers = modeHandlers ?? {};
    this.api = api ?? null;
  }

  resolveBotState(player) {
    if (!player?.isPlayerBot?.()) {
      return null;
    }
    const username = player.getUsername?.();
    if (!username) {
      return null;
    }
    const state = this.botStatesByName.get(username);
    if (!state || typeof state.mode !== "string" || state.mode.length === 0) {
      return null;
    }
    return { username, state };
  }

  handleCanAttack(event) {
    const attacker = event?.attacker;
    const target = event?.target;
    if (!attacker?.isNpc?.() || !target?.isPlayer?.()) {
      return;
    }

    const player = target.getAsPlayer?.() ?? target;
    const resolved = this.resolveBotState(player);
    if (!resolved) {
      return;
    }
    const npc = attacker.getAsNpc?.() ?? attacker;

    callModeHook({
      modeHandlers: this.modeHandlers,
      mode: resolved.state.mode,
      hookName: "onNpcAggroAttempt",
      payload: { event, player, state: resolved.state, attacker: npc },
      fallback: false,
      api: this.api,
      errorEvent: "bot_mode_npc_aggro_attempt_error",
    });
  }

  handlePlayerProcess({ player, nowMs = Date.now() }) {
    const resolved = this.resolveBotState(player);
    if (!resolved) {
      return;
    }
    const combat = player.getCombat?.();
    if (!combat) {
      return;
    }
    const attacker = combat.getAttacker?.();
    const target = combat.getTarget?.();
    const attackerIsNpc = attacker?.isNpc?.() === true;
    const targetIsNpc = target?.isNpc?.() === true;
    if (!attackerIsNpc && !targetIsNpc) {
      return;
    }

    callModeHook({
      modeHandlers: this.modeHandlers,
      mode: resolved.state.mode,
      hookName: "onNpcCombatDetected",
      payload: {
        player,
        state: resolved.state,
        nowMs,
        combat,
        attacker,
        target,
      },
      fallback: false,
      api: this.api,
      errorEvent: "bot_mode_npc_combat_detected_error",
    });
  }
}

module.exports = {
  NpcAggroPolicyHandler,
};

