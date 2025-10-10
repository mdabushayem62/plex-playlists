#!/usr/bin/env node
import 'dotenv/config';
import { getGenreWindows, TIME_WINDOWS, type PlaylistWindow } from './windows.js';
import { createApp } from './index.js';
import { logger } from './logger.js';
import { importRatingsFromCSVs } from './import/importer-fast.js';
import { closeDb } from './db/index.js';
import { resetPlexServer } from './plex/client.js';
import { warmCache, warmAlbumCache, getCacheStats, clearExpiredCache, clearAllCache } from './cache/cache-cli.js';
import { APP_ENV } from './config.js';

const usage = `Usage:
  plex-playlists --help                        Show this help message
  plex-playlists start                         Start the scheduler
  plex-playlists run <window>                  Run a single playlist window
    Time windows: morning, afternoon, evening
    Genre windows: (loaded from playlists.config.json + auto-discovery)
  plex-playlists run-all                       Run all three daily playlists sequentially
  plex-playlists cache warm [--dry-run] [--concurrency=N]
                                               Pre-populate artist genre cache
  plex-playlists cache warm-albums [--dry-run] [--concurrency=N]
                                               Pre-populate album genre cache (more data-intensive)
  plex-playlists cache stats                   Show cache statistics
  plex-playlists cache clear [--all]           Clear expired (or all) cache entries
  plex-playlists import <csv-dir> [--dry-run]  Import ratings from CSV files`;

const args = process.argv.slice(2);
const app = createApp();

// Graceful shutdown handler
const shutdown = (signal: string) => {
  logger.info({ signal }, 'received shutdown signal');
  app.stop();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function main(): Promise<void> {
  const command = args[0];

  // Handle help flags
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
    return;
  }

  if (command === 'start') {
    await app.start();
    logger.info('scheduler running; press Ctrl+C to exit');
    // keep process alive
    process.stdin.resume();
    return;
  }

  if (command === 'run') {
    const windowArg = args[1] as PlaylistWindow | undefined;
    if (!windowArg) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }

    // Validate window - check if it's a time window or genre window
    const isTimeWindow = (TIME_WINDOWS as readonly string[]).includes(windowArg);
    const genreWindows = await getGenreWindows();
    const isGenreWindow = genreWindows.some(g => g.window === windowArg);

    if (!isTimeWindow && !isGenreWindow) {
      console.error(`Error: Unknown window '${windowArg}'`);
      console.error(`\nAvailable windows:`);
      console.error(`  Time: ${TIME_WINDOWS.join(', ')}`);
      console.error(`  Genre: ${genreWindows.map(g => g.window).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    await app.runOnce(windowArg);
    return;
  }

  if (command === 'run-all') {
    await app.runAllDaily();
    return;
  }

  if (command === 'import') {
    const csvDir = args[1];
    if (!csvDir) {
      console.error('Error: CSV directory path required');
      console.error(usage);
      process.exitCode = 1;
      return;
    }

    const dryRun = args.includes('--dry-run');

    try {
      logger.info({ csvDir, dryRun }, 'Starting rating import');
      const result = await importRatingsFromCSVs(csvDir, dryRun);

      console.log('\n=== Import Results ===');
      console.log(`Total tracks in CSV files: ${result.totalTracks}`);
      console.log(`Matched to Plex library: ${result.matchedTracks}`);
      console.log(`Ratings set: ${result.ratingsSet}`);
      console.log(`Skipped (already rated): ${result.skippedExisting}`);
      console.log(`Failed to match: ${result.totalTracks - result.matchedTracks}`);

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        result.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more`);
        }
      }

      if (dryRun) {
        console.log('\n[DRY RUN] No ratings were actually set. Run without --dry-run to apply changes.');
      }
    } finally {
      closeDb();
      resetPlexServer();
    }

    return;
  }

  if (command === 'cache') {
    const subcommand = args[1];

    if (subcommand === 'warm') {
      const dryRun = args.includes('--dry-run');
      const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
      const concurrency = concurrencyArg
        ? parseInt(concurrencyArg.split('=')[1], 10)
        : APP_ENV.CACHE_WARM_CONCURRENCY;

      if (isNaN(concurrency) || concurrency < 1) {
        console.error('Error: Invalid concurrency value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      try {
        console.log(
          `\nWarming genre cache for all Plex artists (concurrency: ${concurrency}, safely under Spotify rate limits)${dryRun ? ' [DRY RUN]' : ''}...\n`
        );

        const result = await warmCache({
          concurrency,
          dryRun,
          onProgress: (completed, total) => {
            const percent = ((completed / total) * 100).toFixed(1);
            process.stdout.write(
              `\rProgress: ${completed}/${total} artists (${percent}%)`
            );
          }
        });

        console.log('\n');
        console.log(`✓ Cached genres for ${result.cached} of ${result.totalArtists} artists`);

        if (result.errors.length > 0) {
          console.log(`\nErrors (${result.errors.length}):`);
          result.errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
          if (result.errors.length > 5) {
            console.log(`  ... and ${result.errors.length - 5} more`);
          }
        }

        if (dryRun) {
          console.log('\n[DRY RUN] No cache entries were written.');
        }
      } finally {
        closeDb();
        resetPlexServer();
      }

      return;
    }

    if (subcommand === 'warm-albums') {
      const dryRun = args.includes('--dry-run');
      const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
      const concurrency = concurrencyArg
        ? parseInt(concurrencyArg.split('=')[1], 10)
        : APP_ENV.CACHE_WARM_CONCURRENCY;

      if (isNaN(concurrency) || concurrency < 1) {
        console.error('Error: Invalid concurrency value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      try {
        console.log(
          `\nWarming album genre cache for all Plex albums (concurrency: ${concurrency})${dryRun ? ' [DRY RUN]' : ''}...\n`
        );

        const result = await warmAlbumCache({
          concurrency,
          dryRun,
          onProgress: (completed, total) => {
            const percent = ((completed / total) * 100).toFixed(1);
            process.stdout.write(
              `\rProgress: ${completed}/${total} albums (${percent}%)`
            );
          }
        });

        console.log('\n');
        console.log(`✓ Cached genres for ${result.cached} of ${result.totalAlbums} albums`);

        if (result.errors.length > 0) {
          console.log(`\nErrors (${result.errors.length}):`);
          result.errors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
          if (result.errors.length > 5) {
            console.log(`  ... and ${result.errors.length - 5} more`);
          }
        }

        if (dryRun) {
          console.log('\n[DRY RUN] No cache entries were written.');
        }
      } finally {
        closeDb();
        resetPlexServer();
      }

      return;
    }

    if (subcommand === 'stats') {
      try {
        const stats = await getCacheStats();

        console.log('\n=== Genre Cache Statistics ===');

        console.log('\nArtist Cache:');
        console.log(`  Total Entries: ${stats.artists.totalEntries}`);
        console.log(`  By Source:`);
        Object.entries(stats.artists.bySource)
          .sort((a, b) => b[1] - a[1])
          .forEach(([source, count]) => {
            console.log(`    ${source.padEnd(12)}: ${count}`);
          });
        if (stats.artists.oldestEntry) {
          console.log(`  Oldest Entry: ${stats.artists.oldestEntry.toISOString().split('T')[0]}`);
        }
        if (stats.artists.newestEntry) {
          console.log(`  Newest Entry: ${stats.artists.newestEntry.toISOString().split('T')[0]}`);
        }
        console.log(`  Expiring within 7 days: ${stats.artists.expiringWithin7Days}`);
        console.log(`  Expired: ${stats.artists.expired}`);

        console.log('\nAlbum Cache:');
        console.log(`  Total Entries: ${stats.albums.totalEntries}`);
        console.log(`  By Source:`);
        Object.entries(stats.albums.bySource)
          .sort((a, b) => b[1] - a[1])
          .forEach(([source, count]) => {
            console.log(`    ${source.padEnd(12)}: ${count}`);
          });
        if (stats.albums.oldestEntry) {
          console.log(`  Oldest Entry: ${stats.albums.oldestEntry.toISOString().split('T')[0]}`);
        }
        if (stats.albums.newestEntry) {
          console.log(`  Newest Entry: ${stats.albums.newestEntry.toISOString().split('T')[0]}`);
        }
        console.log(`  Expiring within 7 days: ${stats.albums.expiringWithin7Days}`);
        console.log(`  Expired: ${stats.albums.expired}`);
        console.log('');
      } finally {
        closeDb();
      }

      return;
    }

    if (subcommand === 'clear') {
      const all = args.includes('--all');

      try {
        const count = all ? await clearAllCache() : await clearExpiredCache();
        console.log(`\n✓ Cleared ${count} cache ${count === 1 ? 'entry' : 'entries'}${all ? ' (all)' : ' (expired)'}\n`);
      } finally {
        closeDb();
      }

      return;
    }

    console.error(`Error: Unknown cache subcommand '${subcommand}'`);
    console.error('\nAvailable subcommands:');
    console.error('  warm         - Pre-populate artist genre cache');
    console.error('  warm-albums  - Pre-populate album genre cache (more data-intensive)');
    console.error('  stats        - Show cache statistics');
    console.error('  clear        - Clear expired or all cache entries');
    process.exitCode = 1;
    return;
  }

  console.error(usage);
  process.exitCode = 1;
}

main().catch(error => {
  logger.error({ err: error }, 'CLI execution failed');
  process.exitCode = 1;
});
