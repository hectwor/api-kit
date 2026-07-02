import type { LoggerLike } from "../logging/logger";

export interface StartupTask {
  /** Label used in logs. */
  name: string;
  /** The work to run (seeding, cache warm-up, parameter sync, …). */
  run: () => Promise<void> | void;
  /**
   * When true, a failure aborts startup (error re-thrown). When false the
   * error is logged and the remaining tasks continue. Default: `false`.
   */
  fatal?: boolean;
}

export interface RunStartupTasksOptions {
  logger?: Pick<LoggerLike, "info" | "warn" | "error">;
  /** Run tasks in parallel instead of sequentially. Default: `false`. */
  parallel?: boolean;
}

/**
 * Run one-time startup tasks with uniform logging and failure policy.
 * Non-fatal tasks that throw are logged and skipped; fatal tasks abort startup.
 * Replaces the ad-hoc `.then/.catch` init blocks in `app.ts`.
 */
export async function runStartupTasks(tasks: StartupTask[], options: RunStartupTasksOptions = {}): Promise<void> {
  const log = options.logger ?? console;

  const execute = async (task: StartupTask): Promise<void> => {
    try {
      await task.run();
      log.info(`Startup task completed: ${task.name}`);
    } catch (err) {
      if (task.fatal) {
        log.error(`Fatal startup task failed: ${task.name}`, { err });
        throw err;
      }
      log.warn(`Startup task failed (non-fatal): ${task.name}`, { err: (err as Error)?.message ?? err });
    }
  };

  if (options.parallel) {
    await Promise.all(tasks.map(execute));
    return;
  }
  for (const task of tasks) {
    await execute(task);
  }
}
