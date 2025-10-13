#!/usr/bin/env node
import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { TIME_WINDOWS, SPECIAL_WINDOWS, type PlaylistWindow } from './windows.js';
import { createApp } from './index.js';
import { logger } from './logger.js';
import { importRatingsFromCSVs } from './import/importer-fast.js';
import { closeDb } from './db/index.js';
import { resetPlexServer } from './plex/client.js';
import { warmCache, warmAlbumCache, getCacheStats, clearExpiredCache, clearAllCache } from './cache/cache-cli.js';
import { diagnoseHistory, printDiagnostics } from './history/history-diagnostics.js';
import { APP_ENV } from './config.js';

// Load config from /config/.env if it exists (Docker setup)
const configEnvPath = join(process.env.CONFIG_DIR || './config', '.env');
if (existsSync(configEnvPath)) {
  dotenvConfig({ path: configEnvPath, override: true });
  logger.debug({ path: configEnvPath }, 'loaded config from /config/.env');
}

const usage = `Usage:
  plex-playlists --help                        Show this help message
  plex-playlists start                         Start the scheduler
  plex-playlists run <window>                  Run a single playlist window
    Time windows: morning, afternoon, evening
    Special windows:
      - discovery: Weekly rediscovery of forgotten gems
      - throwback: Nostalgic tracks from 2-5 years ago
    Custom/cache windows: custom-playlists, cache-warm, cache-refresh
  plex-playlists run-all                       Run all three daily playlists sequentially
  plex-playlists history diagnose              Test Plex history tracking and provide recommendations

Metadata Cache (for enrichment):
  plex-playlists cache warm [--dry-run] [--concurrency=N]
                                               Pre-populate artist cache
  plex-playlists cache warm-albums [--dry-run] [--concurrency=N]
                                               Pre-populate album cache (more data-intensive)
  plex-playlists cache stats                   Show metadata cache statistics
  plex-playlists cache clear [--all]           Clear expired (or all) metadata cache entries

Track Cache (for quality playlists):
  plex-playlists cache sync-library [--batch-size=N] [--max-tracks=N]
                                               Sync entire library to track cache (initial setup, ~30-45min)
  plex-playlists cache refresh-stats [--limit=N]
                                               Refresh expired track stats (daily maintenance, ~2-3min)
  plex-playlists cache sync-recent [--days=N]  Sync recently added tracks (detect new additions)
  plex-playlists cache health                  Show track cache health statistics

AudioMuse Integration (audio features):
  plex-playlists audiomuse sync [--dry-run] [--force] [--concurrency=N]
                                               Sync audio features from AudioMuse to Plex tracks
  plex-playlists audiomuse stats               Show AudioMuse sync statistics

Other:
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

    // Validate window - check if it's a time window, special window, cache job, or custom playlist
    const isTimeWindow = (TIME_WINDOWS as readonly string[]).includes(windowArg);
    const isSpecialWindow = (SPECIAL_WINDOWS as readonly string[]).includes(windowArg);
    const isCacheWindow = ['cache-warm', 'cache-refresh'].includes(windowArg);
    const isCustomWindow = windowArg === 'custom-playlists' || windowArg.startsWith('custom-');

    if (!isTimeWindow && !isSpecialWindow && !isCacheWindow && !isCustomWindow) {
      console.error(`Error: Unknown window '${windowArg}'`);
      console.error(`\nAvailable windows:`);
      console.error(`  Time: ${TIME_WINDOWS.join(', ')}`);
      console.error(`  Special: ${SPECIAL_WINDOWS.join(', ')}, custom-playlists`);
      console.error(`  Cache: cache-warm, cache-refresh`);
      console.error(`  Custom: Any 'custom-*' playlist window from database`);
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

  if (command === 'history') {
    const subcommand = args[1];

    if (subcommand === 'diagnose') {
      try {
        const diagnostics = await diagnoseHistory();
        printDiagnostics(diagnostics);
      } finally {
        closeDb();
        resetPlexServer();
      }
      return;
    }

    console.error(`Error: Unknown history subcommand '${subcommand}'`);
    console.error('\nAvailable subcommands:');
    console.error('  diagnose  - Test Plex history tracking and provide recommendations');
    process.exitCode = 1;
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
          `\nWarming artist cache for all Plex artists (concurrency: ${concurrency})${dryRun ? ' [DRY RUN]' : ''}...\n`
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
          `\nWarming album cache for all Plex albums (concurrency: ${concurrency})${dryRun ? ' [DRY RUN]' : ''}...\n`
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

        console.log('\n=== Metadata Cache Statistics ===');

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

    // ========== TRACK CACHE COMMANDS ==========

    if (subcommand === 'sync-library') {
      const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
      const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 50;

      const maxTracksArg = args.find(a => a.startsWith('--max-tracks='));
      const maxTracks = maxTracksArg ? parseInt(maxTracksArg.split('=')[1], 10) : undefined;

      if (isNaN(batchSize) || batchSize < 1) {
        console.error('Error: Invalid batch-size value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      if (maxTracks !== undefined && (isNaN(maxTracks) || maxTracks < 1)) {
        console.error('Error: Invalid max-tracks value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      try {
        const { syncLibrary } = await import('./cache/track-cache-service.js');

        console.log('\n=== Track Cache: Full Library Sync ===');
        console.log(`Batch size: ${batchSize} tracks per batch`);
        console.log(`Max tracks: ${maxTracks || 'unlimited'}`);
        console.log('\nThis may take 30-45 minutes for a large library...\n');

        let lastUpdate = Date.now();
        await syncLibrary({
          batchSize,
          maxTracks,
          onProgress: (current, total) => {
            const now = Date.now();
            // Throttle console updates to every 500ms
            if (now - lastUpdate > 500) {
              const percent = ((current / total) * 100).toFixed(1);
              const eta = total > current
                ? Math.ceil(((total - current) / current) * (now - lastUpdate) / 1000)
                : 0;
              process.stdout.write(
                `\rProgress: ${current}/${total} tracks (${percent}%) - ETA: ${eta}s    `
              );
              lastUpdate = now;
            }
          }
        });

        console.log('\n');
        console.log('✓ Library sync completed successfully');
        console.log('\nNext steps:');
        console.log('  - Run "plex-playlists cache health" to verify');
        console.log('  - Track cache will auto-refresh daily (stats refresh at 2am)');
        console.log('  - Use quality playlists to leverage the cache\n');
      } catch (error) {
        console.error('\n✗ Library sync failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        closeDb();
        resetPlexServer();
      }

      return;
    }

    if (subcommand === 'refresh-stats') {
      const limitArg = args.find(a => a.startsWith('--limit='));
      const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5000;

      if (isNaN(limit) || limit < 1) {
        console.error('Error: Invalid limit value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      try {
        const { refreshExpiredStats } = await import('./cache/track-cache-service.js');

        console.log('\n=== Track Cache: Refresh Expired Stats ===');
        console.log(`Limit: ${limit} tracks`);
        console.log('\nRefreshing...\n');

        await refreshExpiredStats({
          limit
        });

        console.log('\n');
        console.log('✓ Stats refresh completed successfully\n');
      } catch (error) {
        console.error('\n✗ Stats refresh failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        closeDb();
        resetPlexServer();
      }

      return;
    }

    if (subcommand === 'sync-recent') {
      const daysArg = args.find(a => a.startsWith('--days='));
      const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 1;

      if (isNaN(days) || days < 1) {
        console.error('Error: Invalid days value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      try {
        const { syncRecentlyAdded } = await import('./cache/track-cache-service.js');

        console.log(`\nSyncing tracks added in last ${days} day(s)...`);
        await syncRecentlyAdded(days);
        console.log('✓ Recently added tracks synced successfully\n');
      } catch (error) {
        console.error('✗ Sync failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        closeDb();
        resetPlexServer();
      }

      return;
    }

    if (subcommand === 'health') {
      try {
        const { getCacheHealth } = await import('./cache/track-cache-service.js');

        console.log('\n=== Track Cache Health ===');
        const health = await getCacheHealth();

        console.log('\nOverview:');
        console.log(`  Total Tracks: ${health.totalTracks.toLocaleString()}`);
        console.log(`  Coverage: ${health.coverage.toFixed(1)}%`);
        console.log(`  Average Age: ${health.avgAge.toFixed(1)} days`);

        console.log('\nFreshness:');
        console.log(`  Stale Static Metadata: ${health.staleStatic.toLocaleString()}`);
        console.log(`  Stale Stats: ${health.staleStats.toLocaleString()}`);

        console.log('\nQuality Breakdown:');
        console.log(`  High-Rated (>=8 stars): ${health.byQuality.highRated.toLocaleString()}`);
        console.log(`  Unrated: ${health.byQuality.unrated.toLocaleString()}`);
        console.log(`  Unplayed: ${health.byQuality.unplayed.toLocaleString()}`);

        if (health.totalTracks === 0) {
          console.log('\n⚠️  Track cache is empty. Run "plex-playlists cache sync-library" to populate it.');
        } else if (health.staleStats > health.totalTracks * 0.1) {
          console.log(`\n⚠️  ${((health.staleStats / health.totalTracks) * 100).toFixed(1)}% of tracks have stale stats.`);
          console.log('   Run "plex-playlists cache refresh-stats" to refresh.');
        } else {
          console.log('\n✓ Cache health looks good!');
        }

        console.log('');
      } catch (error) {
        console.error('✗ Failed to get cache health:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        closeDb();
      }

      return;
    }

    console.error(`Error: Unknown cache subcommand '${subcommand}'`);
    console.error('\nAvailable subcommands:');
    console.error('  Metadata Cache:');
    console.error('    warm         - Pre-populate artist cache');
    console.error('    warm-albums  - Pre-populate album cache');
    console.error('    stats        - Show metadata cache statistics');
    console.error('    clear        - Clear expired or all metadata cache entries');
    console.error('\n  Track Cache:');
    console.error('    sync-library    - Sync entire library to track cache');
    console.error('    refresh-stats   - Refresh expired track stats');
    console.error('    sync-recent     - Sync recently added tracks');
    console.error('    health          - Show track cache health');
    process.exitCode = 1;
    return;
  }

  if (command === 'audiomuse') {
    const subcommand = args[1];

    if (subcommand === 'sync') {
      const dryRun = args.includes('--dry-run');
      const forceResync = args.includes('--force');
      const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
      const concurrency = concurrencyArg
        ? parseInt(concurrencyArg.split('=')[1], 10)
        : 5;

      if (isNaN(concurrency) || concurrency < 1) {
        console.error('Error: Invalid concurrency value. Must be a positive integer.');
        process.exitCode = 1;
        return;
      }

      try {
        const { syncAudioFeatures } = await import('./audiomuse/sync-service.js');
        const { closeAudioMuseClient } = await import('./audiomuse/client.js');

        console.log('\n=== AudioMuse Audio Features Sync ===');
        console.log(`Concurrency: ${concurrency}`);
        console.log(`Mode: ${dryRun ? 'DRY RUN' : forceResync ? 'FORCE RESYNC' : 'INCREMENTAL'}`);
        console.log('\nThis may take a while for large libraries...\n');

        const result = await syncAudioFeatures({
          dryRun,
          forceResync,
          concurrency,
          onProgress: (current, total, message) => {
            if (current % 50 === 0 || current === total) {
              const percent = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
              process.stdout.write(`\r${message} (${percent}%)    `);
            }
          }
        });

        console.log('\n');
        console.log('=== Sync Results ===');
        console.log(`Total tracks in AudioMuse: ${result.totalAudioMuseTracks}`);
        console.log(`✓ Matched: ${result.matched}`);
        console.log(`✗ Failed: ${result.failed}`);
        console.log(`⏭  Skipped (already synced): ${result.skipped}`);
        console.log(`⏱  Duration: ${(result.duration / 1000).toFixed(1)}s`);

        if (dryRun) {
          console.log('\n[DRY RUN] No audio features were written to database.');
          console.log('Run without --dry-run to apply changes.');
        }

        console.log('');
        await closeAudioMuseClient();
      } catch (error) {
        console.error('\n✗ AudioMuse sync failed:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        closeDb();
        resetPlexServer();
      }

      return;
    }

    if (subcommand === 'stats') {
      try {
        const { getSyncStats } = await import('./audiomuse/sync-service.js');
        const { getAudioMuseStats, closeAudioMuseClient } = await import('./audiomuse/client.js');

        console.log('\n=== AudioMuse Statistics ===');

        const audioMuseStats = await getAudioMuseStats();
        console.log('\nAudioMuse Database:');
        console.log(`  Total tracks: ${audioMuseStats.totalTracks.toLocaleString()}`);
        console.log(`  Total artists: ${audioMuseStats.totalArtists.toLocaleString()}`);
        console.log(`  Tempo range: ${audioMuseStats.tempo.min.toFixed(1)} - ${audioMuseStats.tempo.max.toFixed(1)} BPM (avg: ${audioMuseStats.tempo.avg.toFixed(1)})`);
        console.log(`  Energy range: ${(audioMuseStats.energy.min * 100).toFixed(1)}% - ${(audioMuseStats.energy.max * 100).toFixed(1)}% (avg: ${(audioMuseStats.energy.avg * 100).toFixed(1)}%)`);

        const syncStats = await getSyncStats();
        console.log('\nSync Status:');
        console.log(`  Tracks synced to Plex: ${syncStats.totalSynced.toLocaleString()}`);
        console.log(`  Coverage: ${syncStats.coveragePercent.toFixed(1)}%`);

        if (syncStats.totalSynced === 0) {
          console.log('\n⚠️  No tracks synced yet. Run "plex-playlists audiomuse sync" to sync audio features.');
        } else if (syncStats.coveragePercent < 90) {
          console.log(`\n⚠️  Only ${syncStats.coveragePercent.toFixed(1)}% of AudioMuse tracks are synced.`);
          console.log('   Run "plex-playlists audiomuse sync" to improve coverage.');
        } else {
          console.log('\n✓ AudioMuse integration looks good!');
        }

        console.log('');
        await closeAudioMuseClient();
      } catch (error) {
        console.error('\n✗ Failed to get AudioMuse stats:', error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        closeDb();
      }

      return;
    }

    console.error(`Error: Unknown audiomuse subcommand '${subcommand}'`);
    console.error('\nAvailable subcommands:');
    console.error('  sync   - Sync audio features from AudioMuse to Plex tracks');
    console.error('  stats  - Show AudioMuse sync statistics');
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
