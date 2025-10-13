/**
 * AudioMuse sync service
 * Fetches audio features from AudioMuse and syncs them to local database
 */

import { getPlexServer } from '../plex/client.js';
import { getDb } from '../db/index.js';
import { audioFeatures } from '../db/schema.js';
import { logger } from '../logger.js';
import { getAllAudioFeatures, getAudioMuseTrackCount } from './client.js';
import { batchMatchTracks } from './matcher.js';
import { sql } from 'drizzle-orm';

export interface SyncStats {
  totalAudioMuseTracks: number;
  matched: number;
  failed: number;
  skipped: number; // Already in database
  duration: number; // milliseconds
}

export interface SyncOptions {
  dryRun?: boolean;
  forceResync?: boolean; // Re-sync tracks that already exist in database
  concurrency?: number; // Concurrent Plex searches
  onProgress?: (current: number, total: number, message: string) => void;
}

/**
 * Sync audio features from AudioMuse to local database
 */
export async function syncAudioFeatures(options: SyncOptions = {}): Promise<SyncStats> {
  const { dryRun = false, forceResync = false, concurrency = 5, onProgress } = options;

  const startTime = Date.now();

  logger.info({
    dryRun,
    forceResync,
    concurrency
  }, 'starting audiomuse sync');

  // Get all AudioMuse tracks
  onProgress?.(0, 0, 'Fetching AudioMuse tracks...');
  const audioMuseTracks = await getAllAudioFeatures();
  logger.info(`fetched ${audioMuseTracks.length} tracks from audiomuse`);

  if (audioMuseTracks.length === 0) {
    logger.warn('no tracks found in audiomuse database');
    return {
      totalAudioMuseTracks: 0,
      matched: 0,
      failed: 0,
      skipped: 0,
      duration: Date.now() - startTime
    };
  }

  // Filter out tracks already in database (unless forceResync)
  const tracksToSync = audioMuseTracks;
  let skipped = 0;

  if (!forceResync) {
    onProgress?.(0, audioMuseTracks.length, 'Checking for existing records...');

    const db = getDb();
    const existingRatingKeys = new Set<string>();
    const existingRecords = await db.select({ ratingKey: audioFeatures.ratingKey }).from(audioFeatures);

    existingRecords.forEach((r) => existingRatingKeys.add(r.ratingKey));

    // We can't filter by ratingKey here since we don't have it yet
    // Instead, we'll check after matching
    logger.info(`found ${existingRecords.length} existing audio feature records`);
  }

  // Connect to Plex
  onProgress?.(0, tracksToSync.length, 'Connecting to Plex...');
  const plex = await getPlexServer();

  // Match AudioMuse tracks to Plex tracks
  onProgress?.(0, tracksToSync.length, 'Matching tracks to Plex...');
  const matches = await batchMatchTracks(plex, tracksToSync, {
    concurrency,
    onProgress: (current, total) => {
      onProgress?.(current, total, `Matching tracks: ${current}/${total}`);
    }
  });

  logger.info(`matched ${matches.size} of ${tracksToSync.length} tracks to plex`);

  // Sync matched tracks to database
  let matched = 0;
  let failed = 0;

  onProgress?.(0, matches.size, 'Syncing to database...');

  const db = getDb();

  for (const [itemId, match] of matches.entries()) {
    const audioMuseTrack = tracksToSync.find((t) => t.itemId === itemId);

    if (!audioMuseTrack) {
      logger.warn({ itemId }, 'audiomuse track not found after matching');
      failed++;
      continue;
    }

    try {
      if (dryRun) {
        logger.info(
          {
            itemId,
            ratingKey: match.ratingKey,
            title: match.title,
            artist: match.artist,
            confidence: match.confidence
          },
          '[DRY RUN] would sync audio features'
        );
        matched++;
      } else {
        // Check if already exists (unless forceResync)
        if (!forceResync) {
          const existing = await db
            .select()
            .from(audioFeatures)
            .where(sql`${audioFeatures.ratingKey} = ${match.ratingKey}`)
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        // Insert or replace audio features
        await db
          .insert(audioFeatures)
          .values({
            ratingKey: match.ratingKey,
            audiomuseItemId: itemId,
            title: match.title,
            artist: match.artist,
            tempo: audioMuseTrack.tempo,
            key: audioMuseTrack.key,
            scale: audioMuseTrack.scale,
            energy: audioMuseTrack.energy,
            moodVector: JSON.stringify(Object.fromEntries(audioMuseTrack.moodVector)),
            otherFeatures: JSON.stringify(Object.fromEntries(audioMuseTrack.features)),
            matchConfidence: match.confidence,
            source: 'audiomuse'
          })
          .onConflictDoUpdate({
            target: audioFeatures.ratingKey,
            set: {
              audiomuseItemId: itemId,
              title: match.title,
              artist: match.artist,
              tempo: audioMuseTrack.tempo,
              key: audioMuseTrack.key,
              scale: audioMuseTrack.scale,
              energy: audioMuseTrack.energy,
              moodVector: JSON.stringify(Object.fromEntries(audioMuseTrack.moodVector)),
              otherFeatures: JSON.stringify(Object.fromEntries(audioMuseTrack.features)),
              matchConfidence: match.confidence,
              cachedAt: sql`(strftime('%s','now')*1000)`
            }
          });

        matched++;
      }
    } catch (error) {
      logger.error(
        { error, itemId, ratingKey: match.ratingKey },
        'error syncing audio features'
      );
      failed++;
    }

    onProgress?.(matched + failed + skipped, matches.size, `Synced: ${matched}, Failed: ${failed}, Skipped: ${skipped}`);
  }

  const stats: SyncStats = {
    totalAudioMuseTracks: audioMuseTracks.length,
    matched,
    failed: audioMuseTracks.length - matches.size + failed,
    skipped,
    duration: Date.now() - startTime
  };

  logger.info(stats, 'audiomuse sync complete');

  return stats;
}

/**
 * Get sync statistics from database
 */
export async function getSyncStats() {
  const db = getDb();
  const count = await db.select({ count: sql<number>`count(*)` }).from(audioFeatures);
  const audioMuseCount = await getAudioMuseTrackCount();

  return {
    totalInAudioMuse: audioMuseCount,
    totalSynced: count[0].count,
    coveragePercent: audioMuseCount > 0 ? (count[0].count / audioMuseCount) * 100 : 0
  };
}
