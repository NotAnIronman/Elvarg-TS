import { ClanChatManager } from './content/clan/ClanChatManager';
import { GameConstants } from './GameConstants';
import { World } from '../game/World';
import { TaskManager } from './task/TaskManager';
import { ServerPerf } from '../util/ServerPerf';


/**
 * The engine which processes the game.
 *
 * @author Professor Oak
 */
export class GameEngine  {
    private scheduler: NodeJS.Timeout;
    private tickInProgress = false;
    private nextExpectedTickAt = 0;
    private tickNumber = 0;
    private lastLagLogAt = 0;
    private lastOverrunLogAt = 0;
    private lastOverlapLogAt = 0;
    private readonly tickRateMs = GameConstants.GAME_ENGINE_PROCESSING_CYCLE_RATE;
    private readonly lagLogThresholdMs = Math.max(120, Math.floor(this.tickRateMs * 0.25));
    private readonly overrunLogThresholdMs = this.tickRateMs;
    private readonly lagLogCooldownMs = 1000;
    
    constructor() {
        // ...
    }
    
    public init() {
        const now = Date.now();
        this.nextExpectedTickAt = now + this.tickRateMs;
        // Tick the game engine at the configured interval (milliseconds).
        this.scheduler = setInterval(this.run.bind(this), this.tickRateMs);
    }
    
    public async run() {
        const tickStartedAt = Date.now();
        this.tickNumber++;

        if (this.tickInProgress) {
            this.logOverlap(tickStartedAt);
            return;
        }

        const driftMs = this.logTickLag(tickStartedAt);
        ServerPerf.beginTick(
            this.tickNumber,
            driftMs,
            World.getPlayers().sizeReturn(),
            World.getNpcs().sizeReturn(),
            TaskManager.getTaskAmount()
        );
        this.tickInProgress = true;

        try {
            await World.process();
        } catch (e) {
            console.log(e);
            World.savePlayers();
            ClanChatManager.save();
        } finally {
            const tickEndedAt = Date.now();
            const tickDurationMs = tickEndedAt - tickStartedAt;
            this.logTickOverrun(tickDurationMs, tickEndedAt);
            ServerPerf.endTick(
                tickDurationMs,
                World.getPlayers().sizeReturn(),
                World.getNpcs().sizeReturn(),
                TaskManager.getTaskAmount()
            );
            this.tickInProgress = false;
        }
    }

    private logTickLag(tickStartedAt: number): number {
        if (this.nextExpectedTickAt <= 0) {
            this.nextExpectedTickAt = tickStartedAt + this.tickRateMs;
            return 0;
        }

        const driftMs = tickStartedAt - this.nextExpectedTickAt;
        // Move expected schedule forward for the next cycle, even if we lagged.
        this.nextExpectedTickAt += this.tickRateMs;
        if (tickStartedAt > this.nextExpectedTickAt + this.tickRateMs) {
            this.nextExpectedTickAt = tickStartedAt + this.tickRateMs;
        }

        if (driftMs < this.lagLogThresholdMs) {
            return driftMs;
        }

        if (tickStartedAt - this.lastLagLogAt < this.lagLogCooldownMs) {
            return driftMs;
        }
        this.lastLagLogAt = tickStartedAt;

        console.warn(
            `[engine] tick_start_lag tick=${this.tickNumber} driftMs=${driftMs} ` +
            `expected=${new Date(this.nextExpectedTickAt - this.tickRateMs).toISOString()} ` +
            `started=${new Date(tickStartedAt).toISOString()} players=${World.getPlayers().sizeReturn()} ` +
            `npcs=${World.getNpcs().sizeReturn()} tasks=${TaskManager.getTaskAmount()}`
        );
        return driftMs;
    }

    private logTickOverrun(tickDurationMs: number, nowMs: number): void {
        if (tickDurationMs < this.overrunLogThresholdMs) {
            return;
        }
        if (nowMs - this.lastOverrunLogAt < this.lagLogCooldownMs) {
            return;
        }
        this.lastOverrunLogAt = nowMs;

        console.warn(
            `[engine] tick_overrun tick=${this.tickNumber} durationMs=${tickDurationMs} ` +
            `budgetMs=${this.tickRateMs} players=${World.getPlayers().sizeReturn()} ` +
            `npcs=${World.getNpcs().sizeReturn()} tasks=${TaskManager.getTaskAmount()}`
        );
    }

    private logOverlap(nowMs: number): void {
        if (nowMs - this.lastOverlapLogAt < this.lagLogCooldownMs) {
            return;
        }
        this.lastOverlapLogAt = nowMs;

        console.warn(
            `[engine] tick_overlap tick=${this.tickNumber} ` +
            `players=${World.getPlayers().sizeReturn()} npcs=${World.getNpcs().sizeReturn()} ` +
            `tasks=${TaskManager.getTaskAmount()}`
        );
    }
}
