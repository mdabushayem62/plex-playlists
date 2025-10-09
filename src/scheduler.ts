import cron from 'node-cron';
import { logger } from './logger.js';
import type { PlaylistWindow } from './windows.js';

export type WindowJobRunner = (window: PlaylistWindow) => Promise<void>;

class Scheduler {
  private tasks: cron.ScheduledTask[] = [];

  constructor(private readonly runWindowJob: WindowJobRunner) {}

  start(cronExpressions: Record<PlaylistWindow, string>): void {
    this.stop();

    for (const [window, expression] of Object.entries(cronExpressions) as Array<[
      PlaylistWindow,
      string
    ]>) {
      // Use cron from node-cron; default timezone from process env (tz of container)
      const task = cron.schedule(expression, () => {
        logger.info({ window }, 'starting scheduled playlist generation');
        this.runWindowJob(window)
          .then(() => logger.info({ window }, 'playlist generation complete'))
          .catch(error => logger.error({ window, err: error }, 'playlist generation failed'));
      });

      this.tasks.push(task);
    }
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }
}

export const createScheduler = (runner: WindowJobRunner) => new Scheduler(runner);
