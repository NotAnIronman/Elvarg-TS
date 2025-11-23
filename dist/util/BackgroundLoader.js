"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundLoader = void 0;
const double_ended_queue_1 = require("double-ended-queue");
const timeunit_1 = require("timeunit");
class BackgroundLoaderThread {
    constructor(runnable) {
        this.worker = new Worker(URL.createObjectURL(new Blob([`(${runnable.run.toString()})()`], { type: 'text/javascript' })));
    }
    start() {
        // Não faz nada, o worker já está rodando
    }
    setName(name) {
        // Não faz nada, não temos acesso ao nome do worker
    }
    setDaemon(daemon) {
        // Não faz nada, não podemos mudar a natureza do worker
    }
}
class BackgroundLoaderThreadFactory {
    createThread(runnable) {
        return new BackgroundLoaderThread(runnable);
    }
}
class BackgroundLoaderExecutorService {
    constructor() {
        this.terminated = false;
        this.threadFactory = new BackgroundLoaderThreadFactory();
    }
    submit(runnable) {
        const thread = this.threadFactory.createThread(runnable);
        thread.start();
    }
    isTerminated() {
        return this.terminated;
    }
    shutdown() {
        this.terminated = true;
    }
    awaitTermination(timeout, unit) {
        const millis = unit.toMillis(timeout);
        let remaining = millis;
        let terminated = true;
        while (remaining > 0) {
            try {
                this.awaitTermination(remaining, timeunit_1.TimeUnit.MILLISECONDS);
                terminated = true;
                break;
            }
            catch (e) {
                terminated = false;
                remaining -= millis - remaining;
            }
        }
        return terminated;
    }
    execute(runnable) {
        this.submit(runnable);
    }
}
class BackgroundLoader {
    constructor() {
        this.service = new BackgroundLoaderExecutorService();
        this.tasks = new double_ended_queue_1.ArrayDeque();
        this.isShutdown = false;
    }
    init(backgroundTasks) {
        if (this.isShutdown || this.service.isTerminated()) {
            throw new Error("This background loader has been shutdown!");
        }
        this.tasks.addAll(backgroundTasks);
        let t;
        while ((t = this.tasks.poll()) != null) {
            this.service.execute(t);
        }
    }
    awaitCompletion() {
        if (this.isShutdown) {
            throw new Error("This background loader has been shutdown!");
        }
        try {
            this.service.awaitTermination(1, timeunit_1.TimeUnit.HOURS);
        }
        catch (e) {
            console.log(`The background service loader was interrupted. ${e}`);
            return false;
        }
        this.isShutdown = true;
        return true;
    }
    stop() {
        this.service.shutdown();
    }
}
exports.BackgroundLoader = BackgroundLoader;
//# sourceMappingURL=BackgroundLoader.js.map