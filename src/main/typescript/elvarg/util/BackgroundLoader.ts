import { TimeUnit } from 'timeunit'

interface Runnable {
  run(): void;
}

interface Thread {
  start(): void;
  setName(name: string): void;
  setDaemon(daemon: boolean): void;
}

interface ThreadFactory {
  createThread(runnable: Runnable): Thread;
}

interface ExecutorService {
  submit(runnable: Runnable): void;
}

class BackgroundLoaderThread implements Thread {
  constructor(private readonly runnable: Runnable) {}

  start() {
    // Run synchronously in Node; no worker support needed for these small tasks.
    this.runnable.run();
  }

  setName(name: string) {}

  setDaemon(daemon: boolean) {}
}

class BackgroundLoaderThreadFactory implements ThreadFactory {
  createThread(runnable: Runnable): Thread {
    return new BackgroundLoaderThread(runnable);
  }
}

class BackgroundLoaderExecutorService implements ExecutorService {
  private readonly threadFactory: ThreadFactory;
  private terminated = false;

  constructor() {
    this.threadFactory = new BackgroundLoaderThreadFactory();
  }

  submit(runnable: Runnable) {
    const thread = this.threadFactory.createThread(runnable);
    thread.start();
  }

  isTerminated(): boolean {
    return this.terminated;
  }

  shutdown(): void {
    this.terminated = true;
  }

  awaitTermination(timeout: number, unit: TimeUnit): boolean {
    const millis = unit.toMillis(timeout);
    let remaining = millis;
    let terminated = true;

    while (remaining > 0) {
      try {
        this.awaitTermination(remaining, TimeUnit.MILLISECONDS);
        terminated = true;
        break;
      } catch (e) {
        terminated = false;
        remaining -= millis - remaining;
      }
    }

    return terminated;
  }

  execute(runnable: Runnable): void {
    this.submit(runnable);
  }

}

export class BackgroundLoader {

  private service = new BackgroundLoaderExecutorService();

  private tasks: Runnable[] = [];
  private isShutdown = false;

  init(backgroundTasks: Iterable<() => void>) {
    if (this.isShutdown || this.service.isTerminated()) {
      throw new Error("This background loader has been shutdown!");
    }
    for (const fn of backgroundTasks) {
      this.tasks.push({ run: fn });
    }
    let t: Runnable;
    while ((t = this.tasks.shift()!) != null) {
      if (!t) break;
      this.service.execute(t);
    }
  }

  awaitCompletion(): boolean {
    if (this.isShutdown) {
      throw new Error("This background loader has been shutdown!");
    }
    // All tasks run synchronously, so we're effectively done already.
    this.isShutdown = true;
    return true;
  }

  stop() {
    this.service.shutdown();
  }
}
