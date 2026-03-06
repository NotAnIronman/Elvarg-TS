const { readPoint, readTile, formatPoint } = require("../lib/BotValueUtils");

const STUCK_THRESHOLDS_MS = Object.freeze({
  ditchTransition: 10000,
  pendingMove: 12000,
  overdueAction: 12000,
  bankRunPhase: 20000,
});

function msRemainingLabel(targetMs, nowMs) {
  if (!Number.isFinite(targetMs) || targetMs <= 0) {
    return "n/a";
  }
  const remaining = Math.max(0, targetMs - nowMs);
  return `${remaining}ms`;
}

function msElapsedLabel(sinceMs, nowMs) {
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) {
    return "n/a";
  }
  return `${Math.max(0, nowMs - sinceMs)}ms`;
}

function normalizePendingMovement(request) {
  const point = readPoint(request);
  if (!point) {
    return null;
  }
  return {
    point,
    requestedAtMs: Number.isFinite(request?.requestedAtMs) ? request.requestedAtMs : null,
    reason: request?.reason ?? null,
    maxRouteSegmentTiles: Number.isFinite(request?.maxRouteSegmentTiles)
      ? request.maxRouteSegmentTiles
      : null,
  };
}

function formatPendingMovement(request, nowMs) {
  if (!request?.point) {
    return "none";
  }
  const ageMs = Number.isFinite(request.requestedAtMs)
    ? Math.max(0, nowMs - request.requestedAtMs)
    : null;
  return `${formatPoint(request.point)} age=${ageMs ?? "n/a"}ms reason=${
    request.reason ?? "n/a"
  }`;
}

function chatTrim(text, max = 200) {
  if (typeof text !== "string") {
    return "";
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

function resolveModeActionAt(state) {
  switch (state?.mode) {
    case "roaming":
      return state?.roaming?.nextWalkAt ?? null;
    case "woodcutting":
      return state?.woodcutting?.nextActionAt ?? null;
    case "mining":
      return state?.mining?.nextActionAt ?? null;
    case "firemaking":
      return state?.firemaking?.nextActionAt ?? null;
    case "smelting":
      return state?.smelting?.nextActionAt ?? null;
    case "bank_run":
      return state?.bankRun?.nextActionAt ?? null;
    case "sparring":
      return state?.sparring?.nextActionAt ?? null;
    default:
      return null;
  }
}

function isQueueMoving(queue) {
  return queue?.isMovings?.() === true;
}

function resolveQueueSize(queue) {
  const size = queue?.size?.();
  return Number.isFinite(size) ? size : 0;
}

function buildStuckDiagnosis(snapshot) {
  const { state, nowMs, queue, pendingMovement, awaitingDitch, autonomy } = snapshot;
  const moving = isQueueMoving(queue);
  const queueSize = resolveQueueSize(queue);

  if (awaitingDitch) {
    const startedAtMs =
      Number(awaitingDitch?.startedAtMs) ||
      Number(awaitingDitch?.startedAt) ||
      Number(awaitingDitch?.requestedAtMs) ||
      0;
    const elapsedMs = startedAtMs > 0 ? Math.max(0, nowMs - startedAtMs) : 0;
    if (elapsedMs >= STUCK_THRESHOLDS_MS.ditchTransition) {
      return {
        stuck: true,
        reason: `ditch transition pending for ${elapsedMs}ms`,
      };
    }
    return {
      stuck: false,
      reason: `crossing ditch (${elapsedMs}ms elapsed)`,
    };
  }

  if (pendingMovement?.point) {
    const ageMs = Number.isFinite(pendingMovement.requestedAtMs)
      ? Math.max(0, nowMs - pendingMovement.requestedAtMs)
      : null;
    if (Number.isFinite(ageMs) && ageMs >= STUCK_THRESHOLDS_MS.pendingMove) {
      return {
        stuck: true,
        reason: `movement request unresolved for ${ageMs}ms`,
      };
    }
    return {
      stuck: false,
      reason: `movement request in-flight (${ageMs ?? "n/a"}ms)`,
    };
  }

  if (state?.mode === "bank_run") {
    const phase = state?.bankRun?.phase ?? "n/a";
    const phaseStartedAt = Number(state?.bankRun?.phaseStartedAt ?? 0);
    if (phaseStartedAt > 0) {
      const phaseElapsedMs = nowMs - phaseStartedAt;
      if (!moving && phaseElapsedMs >= STUCK_THRESHOLDS_MS.bankRunPhase) {
        return {
          stuck: true,
          reason: `bank-run phase '${phase}' running ${phaseElapsedMs}ms with no movement`,
        };
      }
    }
  }

  const nextActionAt = Number(resolveModeActionAt(state));
  if (Number.isFinite(nextActionAt) && nextActionAt > 0) {
    if (nowMs < nextActionAt) {
      return {
        stuck: false,
        reason: `waiting for mode cooldown (${msRemainingLabel(nextActionAt, nowMs)})`,
      };
    }
    const overdueMs = nowMs - nextActionAt;
    if (!moving && queueSize <= 0 && overdueMs >= STUCK_THRESHOLDS_MS.overdueAction) {
      return {
        stuck: true,
        reason: `mode action overdue by ${overdueMs}ms with no movement`,
      };
    }
  }

  if (moving) {
    return { stuck: false, reason: "currently moving" };
  }
  if (queueSize > 0) {
    return { stuck: false, reason: `movement queue has ${queueSize} step(s)` };
  }
  if (autonomy && nowMs < Number(autonomy.nextDecisionAt ?? 0)) {
    return {
      stuck: false,
      reason: `waiting for next mode decision (${msRemainingLabel(
        autonomy.nextDecisionAt,
        nowMs
      )})`,
    };
  }
  return { stuck: false, reason: "no stuck indicators detected" };
}

function createBotDiagnosticsSnapshot({
  bot,
  state,
  nowMs = Date.now(),
  peekMovementRequest,
  recentBotLogsByUsername,
}) {
  const username = bot?.getUsername?.() ?? null;
  const queue = bot?.getMovementQueue?.();
  const autonomy = state?.autonomy ?? null;
  const awaitingDitch = state?.awaitingDitchTransition ?? null;
  const rawPendingMovement =
    typeof peekMovementRequest === "function" ? peekMovementRequest(bot) : null;
  const pendingMovement = normalizePendingMovement(rawPendingMovement);
  const currentTile = readTile(bot?.getLocation?.());
  const faceTile = readTile(bot?.getPositionToFace?.());
  const followUsername = bot?.getFollowing?.()?.getUsername?.() ?? null;
  const recentHistory =
    username && recentBotLogsByUsername instanceof Map
      ? recentBotLogsByUsername.get(username) ?? []
      : [];

  const snapshot = {
    username,
    state,
    nowMs,
    queue,
    autonomy,
    awaitingDitch,
    pendingMovement,
    currentTile,
    faceTile,
    followUsername,
    recentHistory,
  };
  snapshot.stuckDiagnosis = buildStuckDiagnosis(snapshot);
  return snapshot;
}

function renderBotDiagnosticsLines({
  bot,
  snapshot,
  runtimeEventLoggingEnabled,
  recentLogLines = 8,
}) {
  const lines = [];
  if (!snapshot) {
    return lines;
  }

  const { username, state, nowMs, pendingMovement, currentTile, followUsername, recentHistory } =
    snapshot;
  const diagnosis = snapshot.stuckDiagnosis ?? {
    stuck: false,
    reason: "no stuck diagnosis available",
  };
  const statusLabel = diagnosis.stuck ? "STUCK" : "OK";

  lines.push(
    chatTrim(
      `[Bot Status] ${username ?? "unknown"} idx=${bot?.getIndex?.() ?? "n/a"} mode=${
        state?.mode ?? "n/a"
      } ${statusLabel}`
    )
  );
  lines.push(chatTrim(`[Bot Status] Reason: ${diagnosis.reason}`));

  if (diagnosis.stuck) {
    lines.push(
      chatTrim(
        `[Bot Status] Context: tile=${formatPoint(currentTile)} follow=${
          followUsername ?? "n/a"
        } pending=${formatPendingMovement(pendingMovement, nowMs)}`
      )
    );
    const ditchElapsed = msElapsedLabel(snapshot?.awaitingDitch?.startedAtMs, nowMs);
    if (ditchElapsed !== "n/a") {
      lines.push(chatTrim(`[Bot Status] Ditch pending elapsed=${ditchElapsed}`));
    }
    if (runtimeEventLoggingEnabled && Array.isArray(recentHistory) && recentHistory.length > 0) {
      const linesToShow = Math.min(2, Math.max(1, recentLogLines), recentHistory.length);
      for (const line of recentHistory.slice(-linesToShow)) {
        lines.push(chatTrim(`[Bot Status] Log: ${line}`, 220));
      }
    }
  }

  return lines;
}

module.exports = {
  createBotDiagnosticsSnapshot,
  renderBotDiagnosticsLines,
};
