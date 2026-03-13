const { callModeHook } = require("../behaviours/hooks/ModeHookContract");

function registerBotCommands(options) {
  const {
    api,
    botApi,
    hasAdminRights,
    runtime,
    behaviorMode,
    assignableBehaviors,
    modeHandlers,
    resetMovementState,
    taskManager,
    flashHintArrowTaskFactory,
  } = options;

  const activateMode = (target, state, mode, reason) =>
    callModeHook({
      modeHandlers,
      mode,
      hookName: "activateMode",
      payload: {
        player: target,
        state,
        nowMs: Date.now(),
        reason,
      },
      fallback: false,
      api: botApi,
      errorEvent: "bot_mode_activation_error",
    }) === true;
  const supportedBehaviorList = [
    ...Object.keys(assignableBehaviors ?? {}).sort((a, b) => a.localeCompare(b)),
    "auto",
  ].join("|");

  api.registerCommand("botme", ({ player, parts }) => {
    if (!hasAdminRights(player)) {
      player
        .getPacketSender()
        .sendMessage("You do not have permission to use this command.");
      return true;
    }

    const mode = (parts[1] ?? "toggle").toLowerCase();
    if (mode === "status") {
      const enabled = runtime.hasControllerForPlayer(player);
      player
        .getPacketSender()
        .sendMessage(`botme: ${enabled ? "enabled" : "disabled"}`);
      return true;
    }

    const shouldEnable =
      mode === "on" ||
      mode === "start" ||
      (mode === "toggle" && !runtime.hasControllerForPlayer(player));

    if (shouldEnable) {
      const enabled = runtime.enableControllerForPlayer(player);
      if (!enabled.ok) {
        const reason =
          enabled.reason === "already_enabled"
            ? "already enabled"
            : enabled.reason === "not_registered"
            ? "player is not active"
            : "unable to enable";
        player.getPacketSender().sendMessage(`botme: ${reason}.`);
        return true;
      }
      player
        .getPacketSender()
        .sendMessage(
          "botme enabled: your character is running PlayerBots behavior."
        );
      botApi.log("botme_enabled", { username: player.getUsername() });
      return true;
    }

    if (mode === "off" || mode === "stop" || mode === "toggle") {
      const disabled = runtime.disableControllerForPlayer(player);
      if (!disabled) {
        player.getPacketSender().sendMessage("botme: already disabled.");
        return true;
      }
      player
        .getPacketSender()
        .sendMessage("botme disabled: your character is no longer bot-driven.");
      botApi.log("botme_disabled", { username: player.getUsername() });
      return true;
    }

    player
      .getPacketSender()
      .sendMessage("Usage: ::botme [on|off|toggle|status]");
    return true;
  });

  api.registerCommand("bh", ({ player, parts }) => {
    if (!hasAdminRights(player)) {
      player
        .getPacketSender()
        .sendMessage("You do not have permission to use this command.");
      return true;
    }

    const usernameArg = parts[1];
    const behaviorArg = parts[2]?.toLowerCase();
    if (!usernameArg || !behaviorArg) {
      player
        .getPacketSender()
        .sendMessage(`Usage: ::bh <username> <${supportedBehaviorList}>`);
      return true;
    }

    const wantsAuto = behaviorArg === "auto";
    const normalizedBehavior =
      assignableBehaviors[behaviorArg] ??
      (behaviorArg === "sparring" ? assignableBehaviors.pvp : null);
    if (!normalizedBehavior && !wantsAuto) {
      player
        .getPacketSender()
        .sendMessage(`Unknown behaviour. Supported: ${supportedBehaviorList}`);
      return true;
    }

    const target = runtime.resolveControlledPlayer(usernameArg);
    if (!target || !target.isRegistered()) {
      player
        .getPacketSender()
        .sendMessage(`bh: player not found: ${usernameArg}`);
      return true;
    }

    const targetUsername = target.getUsername?.();
    if (!targetUsername || !runtime.hasControllerForUsername(targetUsername)) {
      player
        .getPacketSender()
        .sendMessage(`bh: target is not bot-controlled: ${usernameArg}`);
      return true;
    }

    const state = runtime.botStatesByName.get(targetUsername);
    if (!state) {
      player
        .getPacketSender()
        .sendMessage(`bh: missing state for: ${targetUsername}`);
      return true;
    }

    if (wantsAuto) {
      if (!state.autonomy) {
        state.autonomy = {};
      }
      state.autonomy.manualMode = null;
      state.autonomy.modeEndsAt = 0;
      state.autonomy.nextDecisionAt = 0;
      if (!activateMode(target, state, behaviorMode.ROAMING, "manual_override_auto")) {
        player
          .getPacketSender()
          .sendMessage(`bh: failed to switch ${targetUsername} to auto`);
        return true;
      }
      resetMovementState(target);
      taskManager.submit(flashHintArrowTaskFactory(player, target));

      player.getPacketSender().sendMessage(`bh: ${targetUsername} -> auto`);
      botApi.log("bot_behavior_assigned", {
        assignedBy: player.getUsername(),
        target: targetUsername,
        behavior: "auto",
      });
      return true;
    }

    const activated = activateMode(
      target,
      state,
      normalizedBehavior,
      "manual_override_assign"
    );
    if (!activated) {
      player
        .getPacketSender()
        .sendMessage(`bh: failed to activate mode for ${targetUsername}`);
      return true;
    }
    const currentLoc = target.getLocation?.();
    if (currentLoc) {
      state.home = {
        x: currentLoc.getX(),
        y: currentLoc.getY(),
        z: currentLoc.getZ(),
      };
    }
    if (!state.autonomy) {
      state.autonomy = {};
    }
    state.autonomy.manualMode = normalizedBehavior;
    state.autonomy.modeEndsAt = Number.MAX_SAFE_INTEGER;
    state.autonomy.nextDecisionAt = Number.MAX_SAFE_INTEGER;
    resetMovementState(target);
    taskManager.submit(flashHintArrowTaskFactory(player, target));

    player
      .getPacketSender()
      .sendMessage(`bh: ${targetUsername} -> ${normalizedBehavior}`);
    botApi.log("bot_behavior_assigned", {
      assignedBy: player.getUsername(),
      target: targetUsername,
      behavior: normalizedBehavior,
    });
    return true;
  });

  api.registerCommand("bothotspots", ({ player }) => {
    if (!hasAdminRights(player)) {
      player
        .getPacketSender()
        .sendMessage("You do not have permission to use this command.");
      return true;
    }

    const countsByHotspot = new Map();
    const countsByLoadout = new Map();
    const countsByProfile = new Map();

    for (const entry of runtime.entries ?? []) {
      const state = entry?.state;
      if (state?.autonomy?.wildernessRoamerPvp !== true) {
        continue;
      }
      const hotspotId = state?.pvp?.hotspotId ?? "none";
      const loadoutId = state?.pvp?.loadoutId ?? "unknown";
      const profileId = state?.pvp?.profileId ?? "unknown";
      countsByHotspot.set(hotspotId, (countsByHotspot.get(hotspotId) ?? 0) + 1);
      countsByLoadout.set(loadoutId, (countsByLoadout.get(loadoutId) ?? 0) + 1);
      countsByProfile.set(profileId, (countsByProfile.get(profileId) ?? 0) + 1);
    }

    const formatCounts = (map) =>
      [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => `${key}:${count}`)
        .join(", ");

    player.getPacketSender().sendMessage(
      `hotspots ${formatCounts(countsByHotspot) || "none"}`
    );
    player.getPacketSender().sendMessage(
      `loadouts ${formatCounts(countsByLoadout) || "none"}`
    );
    player.getPacketSender().sendMessage(
      `profiles ${formatCounts(countsByProfile) || "none"}`
    );
    return true;
  });
}

module.exports = {
  registerBotCommands,
};
