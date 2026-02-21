function resolveBotNodeContext(context, botStatesByName, options = {}) {
  const {
    requiredMode = null,
    requireRegistered = true,
    requireNotBusy = true,
    requireNoTraversalTransition = true,
    requireNotInCombat = true,
  } = options;

  const player = context?.player;
  if (!player) {
    return null;
  }
  if (requireRegistered && !player.isRegistered()) {
    return null;
  }

  const username = player.getUsername?.();
  if (!username) {
    return null;
  }

  const state = botStatesByName.get(username);
  if (!state) {
    return null;
  }

  if (requireNotBusy && player.busy()) {
    return null;
  }
  if (requireNotInCombat) {
    const combat = typeof player.getCombat === "function" ? player.getCombat() : null;
    const hasTarget = combat && typeof combat.getTarget === "function" && combat.getTarget();
    const hasAttacker = combat && typeof combat.getAttacker === "function" && combat.getAttacker();
    const isCombatFollowing =
      typeof player.getCombatFollowing === "function" && player.getCombatFollowing();
    if (hasTarget || hasAttacker || isCombatFollowing) {
      return null;
    }
  }
  if (requireNoTraversalTransition && state.awaitingDitchTransition) {
    return null;
  }
  if (requiredMode && state.mode !== requiredMode) {
    return null;
  }

  const nowMs = Number.isFinite(context?.nowMs) ? context.nowMs : Date.now();
  return { player, state, username, nowMs };
}

module.exports = {
  resolveBotNodeContext,
};
