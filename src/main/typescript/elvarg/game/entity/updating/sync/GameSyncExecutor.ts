import { GameSyncTask } from './GameSyncTask';
import { World } from '../../../World';

export class GameSyncExecutor {

  /**
   * The executor that will execute the synchronization tasks. This value may
   * or may not be `null`.
   */
  private service: any;

  /**
   * The synchronizer that ensures that the thread waits until tasks are
   * completed before proceeding. This value may or may not be `null`.
   */
  private phaser: any;

  /**
   * Creates a new `GameSyncExecutor`. It automatically determines how
   * many threads; if any, are needed for game synchronization.
   */
  constructor() {
    this.service = null;
    this.phaser = null;
  }

  /**
   * Submits `syncTask` to be executed as a synchronization task under
   * this executor. This method can and probably will block the calling thread
   * until it completes.
   *
   * @param syncTask the synchronization task to execute.
   */
  public sync(syncTask: GameSyncTask): void {
    const runInline = () => {
      for (let index = 1; index < syncTask.getCapacity(); index++) {
        if (!syncTask.checkIndex(index)) {
          continue;
        }
        const entity = syncTask.isPlayers() ? World.getPlayers().get(index) : World.getNpcs().get(index);
        if (!entity) {
          continue;
        }
        syncTask.execute(index);
      }
    };

    if (this.service == null || this.phaser == null || !syncTask.isConcurrent()) {
      runInline();
      return;
    }

    this.phaser.bulkRegister(syncTask.getAmount());
    for (let index = 1; index < syncTask.getCapacity(); index++) {
      if (!syncTask.checkIndex(index)) {
        continue;
      }
      const finalIndex = index;
      this.service.execute(() => {
        try {
          const entity = syncTask.isPlayers() ? World.getPlayers().get(finalIndex) : World.getNpcs().get(finalIndex);
          if (entity) {
            syncTask.execute(finalIndex);
          }
        } finally {
          this.phaser.arriveAndDeregister();
        }
      });
    }
    this.phaser.arriveAndAwaitAdvance();
  }

  /**
   * Creates and configures the update service for this game sync executor.
   * The returned executor is <b>unconfigurable</b> meaning it's configuration
   * can no longer be modified.
   *
   * @param nThreads the amount of threads to create this service.
   * @return the newly created and configured service.
   */
  private create(nThreads: number): any {
    if (nThreads <= 1) {
      return null;
    }
    return {
      execute(task: () => void) {
        setImmediate(task);
      },
      on(_event: string, _handler: (task: any) => void) {
        // no-op compatibility hook
      },
    };
  }
}
