import 'dotenv/config';
import { APP_ENV } from './config.js';
import { logger } from './logger.js';
import { createPlaylistRunner } from './playlist-runner.js';
import { createScheduler } from './scheduler.js';
import type { PlaylistWindow } from './windows.js';
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

      // NOTE: PlayQueue IDs persist as long as Plex server is running
      // They survive OUR server restarts, so we don't clear them on startup
      // Invalid queue IDs will be handled gracefully and trigger rediscovery

      // Build cron schedule with time-based and dynamic genre playlists
      const cronExpressions: Record<string, string> = {};

      // Batch mode: single schedule for all three daily playlists
      cronExpressions['__daily_batch__'] = APP_ENV.DAILY_PLAYLISTS_CRON;
      logger.info(
        { cron: APP_ENV.DAILY_PLAYLISTS_CRON },
        'daily playlists will run sequentially at scheduled time'
      );

      // Add discovery playlist (weekly rediscovery of forgotten gems)
      if (APP_ENV.DISCOVERY_CRON) {
        cronExpressions['discovery'] = APP_ENV.DISCOVERY_CRON;
      }

      // Add throwback playlist (nostalgia from 2-5 years ago)
      if (APP_ENV.THROWBACK_CRON) {
        cronExpressions['throwback'] = APP_ENV.THROWBACK_CRON;
      }

      // Note: Custom genre/mood playlists are managed via web UI (database-driven)
      // and run via the CUSTOM_PLAYLISTS_CRON schedule below

      // Add custom playlists job
      if (APP_ENV.CUSTOM_PLAYLISTS_CRON) {
        cronExpressions['custom-playlists'] = APP_ENV.CUSTOM_PLAYLISTS_CRON;
      }

      // Add cache maintenance jobs (genre cache)
      if (APP_ENV.CACHE_WARM_CRON) {
        cronExpressions['cache-warm'] = APP_ENV.CACHE_WARM_CRON;
      }
      if (APP_ENV.CACHE_REFRESH_CRON) {
        cronExpressions['cache-refresh'] = APP_ENV.CACHE_REFRESH_CRON;
      }

      // Add track cache maintenance jobs
      if (APP_ENV.TRACK_CACHE_REFRESH_CRON) {
        cronExpressions['track-cache-refresh'] = APP_ENV.TRACK_CACHE_REFRESH_CRON;
      }
      if (APP_ENV.TRACK_CACHE_SYNC_RECENT_CRON) {
        cronExpressions['track-cache-sync-recent'] = APP_ENV.TRACK_CACHE_SYNC_RECENT_CRON;
      }

      logger.info(
        {
          dailyPlaylists: 3,
          discoveryPlaylist: cronExpressions['discovery'] ? 'enabled' : 'disabled',
          throwbackPlaylist: cronExpressions['throwback'] ? 'enabled' : 'disabled',
          customPlaylists: cronExpressions['custom-playlists'] ? 'enabled' : 'disabled',
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
