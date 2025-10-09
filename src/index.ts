import 'dotenv/config';
import { APP_ENV } from './config.js';
import { logger } from './logger.js';
import { createPlaylistRunner } from './playlist-runner.js';
import { createScheduler } from './scheduler.js';
import type { PlaylistWindow } from './windows.js';
import { getGenreWindows } from './windows.js';
import { closeDb } from './db/index.js';
import { resetPlexServer } from './plex/client.js';

export interface App {
  start(): Promise<void>;
  stop(): void;
  runOnce(window: PlaylistWindow): Promise<void>;
}

export const createApp = (): App => {
  const runner = createPlaylistRunner();
  const scheduler = createScheduler(window => runner.run(window));

  return {
    async start() {
      // Build cron schedule with time-based and dynamic genre playlists
      const cronExpressions: Record<string, string> = {
        morning: APP_ENV.MORNING_CRON,
        afternoon: APP_ENV.AFTERNOON_CRON,
        evening: APP_ENV.EVENING_CRON
      };

      // Load genre playlists from config (pinned + auto-discovered)
      const genreWindows = await getGenreWindows();
      for (const genreWindow of genreWindows) {
        if (genreWindow.cron) {
          cronExpressions[genreWindow.window] = genreWindow.cron;
        }
      }

      logger.info(
        {
          timeWindows: 3,
          genreWindows: genreWindows.length,
          pinnedGenres: genreWindows.filter(g => !g.autoDiscovered).length,
          autoDiscovered: genreWindows.filter(g => g.autoDiscovered).length
        },
        'loading playlist schedules'
      );

      scheduler.start(cronExpressions as Record<PlaylistWindow, string>);
      logger.info('scheduler started with daily and genre playlists');
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
    }
  };
};
