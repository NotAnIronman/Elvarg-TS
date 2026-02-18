function resolveBotNodeContext(context, botStatesByName, options = {}) {
  const {
    requiredMode = null,
    requireRegistered = true,
    requireNotBusy = true,
    requireNoTraversalTransition = true,
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
