import 'dotenv/config';
import { APP_ENV } from './config.js';
import { logger } from './logger.js';
import { createPlaylistRunner } from './playlist-runner.js';
import { createScheduler } from './scheduler.js';
import type { PlaylistWindow } from './windows.js';
import { getGenreWindows } from './windows.js';
import { closeDb } from './db/index.js';
import { resetPlexServer } from './plex/client.js';
import { initializeDirectories } from './init.js';
import { createWebServer } from './web/server.js';

export interface App {
  start(): Promise<void>;
  stop(): void;
  runOnce(window: PlaylistWindow): Promise<void>;
  runAllDaily(): Promise<void>;
}

export const createApp = (): App => {
  const runner = createPlaylistRunner();
  const scheduler = createScheduler(window => runner.run(window), () => runner.runAllDaily());
  const webServer = createWebServer({
    port: APP_ENV.WEB_UI_PORT,
    enabled: APP_ENV.WEB_UI_ENABLED
  });

  return {
    async start() {
      // Initialize config and data directories
      await initializeDirectories();

      // Build cron schedule with time-based and dynamic genre playlists
      const cronExpressions: Record<string, string> = {};

      // Batch mode: single schedule for all three daily playlists
      cronExpressions['__daily_batch__'] = APP_ENV.DAILY_PLAYLISTS_CRON;
      logger.info(
        { cron: APP_ENV.DAILY_PLAYLISTS_CRON },
        'daily playlists will run sequentially at scheduled time'
      );

      // Load genre playlists from config (pinned + auto-discovered)
      const genreWindows = await getGenreWindows();
      for (const genreWindow of genreWindows) {
        if (genreWindow.cron) {
          cronExpressions[genreWindow.window] = genreWindow.cron;
        }
      }

      // Add cache maintenance jobs
      if (APP_ENV.CACHE_WARM_CRON) {
        cronExpressions['cache-warm'] = APP_ENV.CACHE_WARM_CRON;
      }
      if (APP_ENV.CACHE_REFRESH_CRON) {
        cronExpressions['cache-refresh'] = APP_ENV.CACHE_REFRESH_CRON;
      }

      logger.info(
        {
          dailyPlaylists: 3,
          genreWindows: genreWindows.length,
          pinnedGenres: genreWindows.filter(g => !g.autoDiscovered).length,
          autoDiscovered: genreWindows.filter(g => g.autoDiscovered).length,
          cacheJobs: Object.keys(cronExpressions).filter(k => k.startsWith('cache-')).length
        },
        'loading playlist schedules'
      );

      scheduler.start(cronExpressions as Record<PlaylistWindow, string>);
      logger.info('scheduler started with daily and genre playlists');

      // Start web UI server
      webServer.start();
    },
    stop() {
      scheduler.stop();
      closeDb();
      resetPlexServer();
      logger.info('scheduler stopped');
    },
    runOnce(window) {
      logger.info({ window }, 'manually triggering playlist generation');
      return runner.run(window);
    },
    runAllDaily() {
      logger.info('manually triggering batch generation of all daily playlists');
      return runner.runAllDaily();
    }
  };
};
