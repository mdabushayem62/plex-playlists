import cron from 'node-cron';
import { logger } from './logger.js';
import type { PlaylistWindow } from './windows.js';
import { warmCache, refreshExpiringCache } from './cache/cache-cli.js';
import { APP_ENV } from './config.js';

export type WindowJobRunner = (window: PlaylistWindow) => Promise<void>;
export type BatchJobRunner = () => Promise<void>;

class Scheduler {
  private tasks: cron.ScheduledTask[] = [];

  constructor(
    private readonly runWindowJob: WindowJobRunner,
    private readonly runBatchJob: BatchJobRunner
  ) {}

  start(cronExpressions: Record<PlaylistWindow, string>): void {
    this.stop();

    for (const [window, expression] of Object.entries(cronExpressions) as Array<[
      PlaylistWindow,
      string
    ]>) {
      // Special handling for batch mode
      if (window === '__daily_batch__') {
        const task = cron.schedule(expression, () => {
          logger.info('starting scheduled batch generation of all daily playlists');
          this.runBatchJob()
            .then(() => logger.info('batch playlist generation complete'))
            .catch(error => logger.error({ err: error }, 'batch playlist generation failed'));
        });
        this.tasks.push(task);
      }
      // Cache warming job
      else if (window === 'cache-warm') {
        const task = cron.schedule(expression, () => {
          logger.info('starting scheduled cache warming');
          warmCache({
            concurrency: APP_ENV.CACHE_WARM_CONCURRENCY,
            skipCached: true
          })
            .then(result => logger.info({ ...result }, 'cache warming complete'))
            .catch(error => logger.error({ err: error }, 'cache warming failed'));
        });
        this.tasks.push(task);
      }
      // Cache refresh job
      else if (window === 'cache-refresh') {
        const task = cron.schedule(expression, () => {
          logger.info('starting scheduled cache refresh');
          refreshExpiringCache({
            daysAhead: 7,
            concurrency: APP_ENV.CACHE_WARM_CONCURRENCY
          })
            .then(result => logger.info({ ...result }, 'cache refresh complete'))
            .catch(error => logger.error({ err: error }, 'cache refresh failed'));
        });
        this.tasks.push(task);
      }
      // Regular playlist windows
      else {
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
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }
}

export const createScheduler = (runner: WindowJobRunner, batchRunner: BatchJobRunner) =>
  new Scheduler(runner, batchRunner);
