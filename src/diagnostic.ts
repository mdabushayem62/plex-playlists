#!/usr/bin/env node
/**
 * Diagnostic script for troubleshooting playlist generation issues
 * Usage: npm run dev src/diagnostic.ts <window>
 */

import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { getWindowDefinition } from './windows.js';
import { fetchHistoryForWindow } from './history/history-service.js';
import { aggregateHistory } from './history/aggregate.js';
import { buildCandidateTracks } from './playlist/candidate-builder.js';
import { fetchFallbackCandidates } from './playlist/fallback.js';
import { selectPlaylistTracks } from './playlist/selector.js';
import { fetchExistingTrackRatingKeys } from './db/repository.js';
import { closeDb } from './db/index.js';
import { resetPlexServer } from './plex/client.js';
import { APP_ENV } from './config.js';

// Load config from /config/.env if it exists (Docker setup)
const configEnvPath = join(process.env.CONFIG_DIR || './config', '.env');
if (existsSync(configEnvPath)) {
  dotenvConfig({ path: configEnvPath, override: true });
}

async function diagnosePlaylist(window: string) {
  console.log(`\n=== Diagnostic Report for "${window}" ===\n`);

  try {
    // 1. Get window definition
    const windowDef = await getWindowDefinition(window);
    if (!windowDef) {
      console.error(`❌ Unknown window: ${window}`);
      return;
    }

    console.log(`✓ Window Definition:`);
    console.log(`  Type: ${windowDef.type}`);
    console.log();

    const genreFilter = undefined; // Genre filtering handled by custom playlists
    const targetSize = APP_ENV.PLAYLIST_TARGET_SIZE;

    // 2. Fetch history
    console.log(`📜 Fetching history...`);
    const historyEntries = await fetchHistoryForWindow(window);
    console.log(`  Total history entries: ${historyEntries.length}`);

    const aggregatedHistory = aggregateHistory(historyEntries);
    console.log(`  Unique tracks in history: ${aggregatedHistory.length}`);
    console.log();

    // 3. Build candidates from history
    console.log(`🎵 Building candidates from history...`);
    const historyWithoutFilter = await buildCandidateTracks(aggregatedHistory, {});
    console.log(`  Candidates before genre filter: ${historyWithoutFilter.length}`);

    const historyCandidates = await buildCandidateTracks(aggregatedHistory, { genreFilter });
    console.log(`  Candidates after genre filter: ${historyCandidates.length}`);

    if (genreFilter && historyWithoutFilter.length > historyCandidates.length) {
      console.log(`  ⚠️  Genre filter removed ${historyWithoutFilter.length - historyCandidates.length} candidates`);

      // Show sample of filtered-out genres
      const filteredOut = historyWithoutFilter.filter(
        c => !historyCandidates.find(hc => hc.ratingKey === c.ratingKey)
      );
      console.log(`\n  Sample of filtered-out tracks:`);
      filteredOut.slice(0, 5).forEach(c => {
        console.log(`    - ${c.artist} - ${c.title}`);
        console.log(`      Genre: ${c.genre || '(no genre cached)'}`);
      });
    }
    console.log();

    // 4. Fetch fallback candidates
    if (historyCandidates.length < targetSize) {
      console.log(`🔄 Fetching fallback candidates (target: ${targetSize})...`);
      const fallbackCandidates = await fetchFallbackCandidates(APP_ENV.FALLBACK_LIMIT, { genreFilter });
      console.log(`  Fallback candidates: ${fallbackCandidates.length}`);
      console.log();
    }

    // 5. Check cross-playlist exclusions
    console.log(`🚫 Checking cross-playlist exclusions...`);
    const existingKeys = await fetchExistingTrackRatingKeys(window);
    console.log(`  Tracks excluded from other playlists today: ${existingKeys.size}`);

    const wouldBeExcluded = historyCandidates.filter(c => existingKeys.has(c.ratingKey));
    if (wouldBeExcluded.length > 0) {
      console.log(`  ⚠️  ${wouldBeExcluded.length} history candidates would be excluded`);
    }
    console.log();

    // 6. Run selection
    console.log(`🎯 Running selection (target: ${targetSize})...`);
    const { selected } = selectPlaylistTracks(historyCandidates, {
      targetCount: targetSize,
      maxPerArtist: APP_ENV.MAX_PER_ARTIST,
      excludeRatingKeys: existingKeys,
      window
    });
    console.log(`  Selected tracks: ${selected.length}`);
    console.log();

    // 7. Summary
    console.log(`=== Summary ===`);
    if (selected.length === 0) {
      console.log(`❌ PROBLEM: No tracks selected!`);
      console.log(`\nPossible causes:`);
      if (historyCandidates.length === 0) {
        console.log(`  1. Genre filter too restrictive (no tracks match "${genreFilter}")`);
        console.log(`  2. Album/artist genres not cached - run: npm run start cache warm-albums`);
      }
      if (existingKeys.size > 0) {
        console.log(`  3. Cross-playlist exclusions removed all candidates`);
      }
      console.log(`  4. Selection constraints (artist limits, etc.) too restrictive`);
    } else if (selected.length < targetSize) {
      console.log(`⚠️  Playlist under target (${selected.length}/${targetSize})`);
    } else {
      console.log(`✅ Playlist generation would succeed (${selected.length} tracks)`);
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
  } finally {
    closeDb();
    resetPlexServer();
  }
}

// Parse arguments
const window = process.argv[2];
if (!window) {
  console.error('Usage: npm run dev src/diagnostic.ts <window>');
  console.error('Example: npm run dev src/diagnostic.ts heavy-metal');
  process.exit(1);
}

diagnosePlaylist(window).catch(error => {
  console.error('Diagnostic failed:', error);
  process.exit(1);
});
