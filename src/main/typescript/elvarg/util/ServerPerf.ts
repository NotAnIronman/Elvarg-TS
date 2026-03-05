type TickPhaseMap = Map<string, number>;

type TickSample = {
  at: number;
  tickNumber: number;
  driftMs: number;
  durationMs: number;
  players: number;
  npcs: number;
  tasks: number;
  phases: TickPhaseMap;
};

type PhaseSummary = {
  name: string;
  totalMs: number;
  avgMs: number;
  maxMs: number;
};

export class ServerPerf {
  private static readonly SAMPLE_CAP = 300;
  private static samples: TickSample[] = [];
  private static currentTick: TickSample | null = null;

  public static beginTick(
    tickNumber: number,
    driftMs: number,
    players: number,
    npcs: number,
    tasks: number
  ): void {
    ServerPerf.currentTick = {
      at: Date.now(),
      tickNumber,
      driftMs,
      durationMs: 0,
      players,
      npcs,
      tasks,
      phases: new Map<string, number>(),
    };
  }

  public static addPhaseDuration(phase: string, durationMs: number): void {
    const current = ServerPerf.currentTick;
    if (!current) {
      return;
    }
    const prev = current.phases.get(phase) ?? 0;
    current.phases.set(phase, prev + durationMs);
  }

  public static measurePhase<T>(phase: string, fn: () => T): T {
    const started = Date.now();
    try {
      return fn();
    } finally {
      ServerPerf.addPhaseDuration(phase, Date.now() - started);
    }
  }

  public static endTick(
    durationMs: number,
    players: number,
    npcs: number,
    tasks: number
  ): void {
    const current = ServerPerf.currentTick;
    if (!current) {
      return;
    }
    current.durationMs = durationMs;
    current.players = players;
    current.npcs = npcs;
    current.tasks = tasks;
    ServerPerf.samples.push(current);
    if (ServerPerf.samples.length > ServerPerf.SAMPLE_CAP) {
      ServerPerf.samples.shift();
    }
    ServerPerf.currentTick = null;
  }

  public static getSummary(limitTicks = 60): {
    ticks: number;
    avgTickMs: number;
    maxTickMs: number;
    avgDriftMs: number;
    maxDriftMs: number;
    lastTickNumber: number;
    lastPlayers: number;
    lastNpcs: number;
    lastTasks: number;
    topPhases: PhaseSummary[];
  } {
    const count = Math.max(1, Math.min(Math.floor(limitTicks), ServerPerf.samples.length || 1));
    const samples =
      ServerPerf.samples.length > 0
        ? ServerPerf.samples.slice(Math.max(0, ServerPerf.samples.length - count))
        : [];
    const actualCount = samples.length;

    if (actualCount === 0) {
      return {
        ticks: 0,
        avgTickMs: 0,
        maxTickMs: 0,
        avgDriftMs: 0,
        maxDriftMs: 0,
        lastTickNumber: 0,
        lastPlayers: 0,
        lastNpcs: 0,
        lastTasks: 0,
        topPhases: [],
      };
    }

    let tickTotal = 0;
    let tickMax = 0;
    let driftTotal = 0;
    let driftMax = 0;
    const phaseAgg = new Map<
      string,
      {
        totalMs: number;
        maxMs: number;
      }
    >();

    for (const s of samples) {
      tickTotal += s.durationMs;
      tickMax = Math.max(tickMax, s.durationMs);
      driftTotal += s.driftMs;
      driftMax = Math.max(driftMax, s.driftMs);
      for (const [phase, ms] of s.phases.entries()) {
        const prev = phaseAgg.get(phase);
        if (!prev) {
          phaseAgg.set(phase, { totalMs: ms, maxMs: ms });
          continue;
        }
        prev.totalMs += ms;
        prev.maxMs = Math.max(prev.maxMs, ms);
      }
    }

    const topPhases: PhaseSummary[] = Array.from(phaseAgg.entries())
      .map(([name, agg]) => ({
        name,
        totalMs: agg.totalMs,
        avgMs: agg.totalMs / actualCount,
        maxMs: agg.maxMs,
      }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 8);

    const last = samples[samples.length - 1];
    return {
      ticks: actualCount,
      avgTickMs: tickTotal / actualCount,
      maxTickMs: tickMax,
      avgDriftMs: driftTotal / actualCount,
      maxDriftMs: driftMax,
      lastTickNumber: last.tickNumber,
      lastPlayers: last.players,
      lastNpcs: last.npcs,
      lastTasks: last.tasks,
      topPhases,
    };
  }
}

