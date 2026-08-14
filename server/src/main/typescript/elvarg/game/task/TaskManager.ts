import { Task } from './Task';
import { ServerPerf } from '../../util/ServerPerf';
import { FreezeDiagnostics } from '../../util/FreezeDiagnostics';
import { FastDeque } from '../../util/FastDeque';
 
export class TaskManager {
    private static pendingTasks: FastDeque<Task> = new FastDeque<Task>();
    private static activeTasks: Task[] = [];
    private static readonly SLOW_TASK_WARN_MS = 50;
    private static readonly SLOW_TASK_LOG_COOLDOWN_MS = 3000;
    private static readonly SLOW_TASK_WARN_ENABLED = (process.env.TASK_SLOW_WARN_ENABLED ?? "1") !== "0";
    private static lastSlowTaskLogAtByName = new Map<string, number>();
    
    private constructor() {
        throw new Error("This class cannot be instantiated!");
    }
    
    public static process(): void {
        try {
            let t: Task;
            while ((t = TaskManager.pendingTasks.shift()) != null) {
                if (t.isRunning()) {
                    TaskManager.activeTasks.push(t);
                }
            }

            let writeIndex = 0;
            for (let i = 0; i < TaskManager.activeTasks.length; i++) {
                t = TaskManager.activeTasks[i];
                const taskName = t?.constructor?.name ?? "UnknownTask";
                const startedAt = Date.now();
                const keepRunning = t.tick();
                const durationMs = Date.now() - startedAt;
                ServerPerf.addPhaseDuration(`task.${taskName}`, durationMs);
                TaskManager.logSlowTaskTick(taskName, durationMs);
                if (keepRunning) {
                    TaskManager.activeTasks[writeIndex++] = t;
                }
            }
            TaskManager.activeTasks.length = writeIndex;
        } catch (e) {
            console.error(e);
        }
    }
    
    public static submit(task: Task): void {
        if (task.isRunning()) {
            return;
        }
    
        task.setRunning(true);
    
        if (task.isImmediate()) {
            task.execute();
        }
    
        TaskManager.pendingTasks.push(task);
    }

    public static cancelTask(keys: any[]): void {
        for (const key of keys) {
        TaskManager.cancelTask(key);
        }
    }
        
    
    public static cancelTasks(key: Object): void {
            try {
                for (const task of TaskManager.pendingTasks.toArray()) {
                    if (task.key === key) {
                        task.stop();
                    }
                }
                TaskManager.activeTasks.filter(t => t.key === key).forEach(t => t.stop());
            } catch (e) {
                console.error(e);
            }
    }
        
    public static getTaskAmount(): number {
            return (TaskManager.pendingTasks.length + TaskManager.activeTasks.length);
    }

    private static logSlowTaskTick(taskName: string, durationMs: number): void {
        if (!TaskManager.SLOW_TASK_WARN_ENABLED) {
            return;
        }
        if (durationMs < TaskManager.SLOW_TASK_WARN_MS) {
            return;
        }
        const nowMs = Date.now();
        const lastLoggedAt = TaskManager.lastSlowTaskLogAtByName.get(taskName) ?? 0;
        if (nowMs - lastLoggedAt < TaskManager.SLOW_TASK_LOG_COOLDOWN_MS) {
            return;
        }
        TaskManager.lastSlowTaskLogAtByName.set(taskName, nowMs);
        FreezeDiagnostics.log("slow_task_tick", {
            taskName,
            durationMs,
            slowThresholdMs: TaskManager.SLOW_TASK_WARN_MS,
            activeTasks: TaskManager.activeTasks.length,
            pendingTasks: TaskManager.pendingTasks.length,
        });
        console.warn(
            `[task] slow_task_tick task=${taskName} durationMs=${durationMs} ` +
            `active=${TaskManager.activeTasks.length} pending=${TaskManager.pendingTasks.length}`
        );
    }
}
