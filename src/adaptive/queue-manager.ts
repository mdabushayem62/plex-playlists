/**
 * Queue manager for adaptive PlayQueue manipulation
 * Executes removal and backfill actions based on pattern detection
 *
 * Flow:
 * 1. Receive adaptive actions from pattern analyzer
 * 2. Fetch current PlayQueue state
 * 3. Remove tracks matching patterns (conservative, max 10)
 * 4. Backfill with similar tracks if needed
 * 5. Log actions to database
 */

import { logger } from '../logger.js';
import { getDb } from '../db/index.js';
import { adaptiveActions } from '../db/schema.js';
import { getPlayQueue, removeFromQueue, addToQueue } from '../plex/playqueue.js';
import { fetchTrackByRatingKey } from '../plex/tracks.js';
import type { Track } from '@ctrl/plex';
import type { AdaptiveAction } from './pattern-analyzer.js';

/**
 * Queue manager for adaptive actions
 */
export class QueueManager {
  private readonly MAX_REMOVALS = 10; // Conservative limit
  private readonly API_DELAY_MS = 100; // Rate limiting between API calls
  private readonly MIN_QUEUE_SIZE = 10; // Trigger refill below this
  private readonly AUTO_REFILL_THRESHOLD = 5; // Auto-refill if removals >= this

  /**
   * Execute adaptive actions on a PlayQueue
   */
  async adaptQueue(
    sessionId: number,
    playQueueId: number,
    actions: AdaptiveAction[]
  ): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    logger.info(
      {
        sessionId,
        playQueueId,
        actions: actions.map(a => a.type)
      },
      'executing adaptive actions'
    );

    // Fetch current queue state
    let queue;
    try {
      queue = await getPlayQueue(playQueueId);
      logger.debug(
        {
          playQueueId,
          version: queue.playQueueVersion,
          totalCount: queue.playQueueTotalCount
        },
        'fetched queue for adaptation'
      );
    } catch (error: unknown) {
      // Handle stale queue (404 means queue was destroyed/cleared)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404')) {
        logger.warn(
          { playQueueId, sessionId },
          'queue no longer exists (404), skipping adaptation - queue may have been stopped/cleared'
        );

        // Clear stale queue ID from session
        await this.clearStaleQueueId(sessionId);
        return;
      }

      // Re-throw other errors
      throw error;
    }

    // Execute each action and track removals
    let totalRemovals = 0;
    for (const action of actions) {
      try {
        if (action.type === 'remove_genre') {
          const removed = await this.removeGenre(sessionId, playQueueId, queue, action.genres, action.reason);
          totalRemovals += removed;
        } else if (action.type === 'remove_artist') {
          const removed = await this.removeArtist(sessionId, playQueueId, queue, action.artists, action.reason);
          totalRemovals += removed;
        } else if (action.type === 'refill_similar') {
          await this.refillQueue(sessionId, playQueueId, action.seedTracks, action.reason);
        }
      } catch (error) {
        logger.error(
          { error, action, playQueueId },
          'failed to execute adaptive action'
        );
      }
    }

    // Check if queue needs refilling (hybrid approach)
    let updatedQueue;
    try {
      updatedQueue = await getPlayQueue(playQueueId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404')) {
        logger.warn(
          { playQueueId, sessionId },
          'queue destroyed during adaptation, skipping refill check'
        );
        await this.clearStaleQueueId(sessionId);
        return;
      }
      throw error;
    }

    const shouldRefill =
      updatedQueue.playQueueTotalCount < this.MIN_QUEUE_SIZE ||
      totalRemovals >= this.AUTO_REFILL_THRESHOLD;

    if (shouldRefill) {
      const reason = totalRemovals >= this.AUTO_REFILL_THRESHOLD
        ? `Removed ${totalRemovals} tracks (>= ${this.AUTO_REFILL_THRESHOLD} threshold)`
        : `Queue size below minimum (${updatedQueue.playQueueTotalCount} < ${this.MIN_QUEUE_SIZE})`;

      logger.info(
        {
          playQueueId,
          currentSize: updatedQueue.playQueueTotalCount,
          totalRemovals,
          minSize: this.MIN_QUEUE_SIZE,
          autoRefillThreshold: this.AUTO_REFILL_THRESHOLD
        },
        'triggering queue refill'
      );

      await this.refillQueue(sessionId, playQueueId, [], reason);
    }
  }

  /**
   * Remove tracks from specific genre(s)
   * @returns Number of tracks actually removed
   */
  private async removeGenre(
    sessionId: number,
    playQueueId: number,
    queue: Awaited<ReturnType<typeof getPlayQueue>>,
    genres: string[],
    reason: string
  ): Promise<number> {
    // Find tracks matching genres (using enriched Last.fm genres from track_cache)
    const toRemove: typeof queue.Metadata = [];

    for (const item of queue.Metadata) {
      const enrichedGenres = await this.fetchGenresForTrack(item.ratingKey);
      const hasMatchingGenre = enrichedGenres.some(g =>
        genres.includes(g.toLowerCase())
      );

      if (hasMatchingGenre) {
        toRemove.push(item);
      }
    }

    // Limit removals to be conservative
    const limited = toRemove.slice(0, this.MAX_REMOVALS);

    if (limited.length === 0) {
      logger.debug({ playQueueId, genres }, 'no tracks found matching genre filter');
      return 0;
    }

    logger.info(
      {
        playQueueId,
        genres,
        toRemove: toRemove.length,
        removing: limited.length
      },
      'removing tracks by genre'
    );

    // Remove each track with rate limiting
    let removedCount = 0;
    for (const item of limited) {
      try {
        await removeFromQueue(playQueueId, item.playQueueItemID);
        await this.delay(this.API_DELAY_MS);
        removedCount++;
      } catch (error) {
        logger.warn(
          { error, playQueueItemID: item.playQueueItemID, track: item.title },
          'failed to remove track from queue'
        );
      }
    }

    // Log action to database
    await this.logAction(
      sessionId,
      playQueueId,
      'remove_genre',
      { genres },
      reason,
      removedCount
    );

    return removedCount;
  }

  /**
   * Remove tracks from specific artist(s)
   * @returns Number of tracks actually removed
   */
  private async removeArtist(
    sessionId: number,
    playQueueId: number,
    queue: Awaited<ReturnType<typeof getPlayQueue>>,
    artists: string[],
    reason: string
  ): Promise<number> {
    // Find tracks matching artists
    const toRemove = queue.Metadata.filter(item =>
      artists.includes(item.grandparentTitle?.toLowerCase() || '')
    );

    // Limit removals to be conservative
    const limited = toRemove.slice(0, this.MAX_REMOVALS);

    if (limited.length === 0) {
      logger.debug({ playQueueId, artists }, 'no tracks found matching artist filter');
      return 0;
    }

    logger.info(
      {
        playQueueId,
        artists,
        toRemove: toRemove.length,
        removing: limited.length
      },
      'removing tracks by artist'
    );

    // Remove each track with rate limiting
    let removedCount = 0;
    for (const item of limited) {
      try {
        await removeFromQueue(playQueueId, item.playQueueItemID);
        await this.delay(this.API_DELAY_MS);
        removedCount++;
      } catch (error) {
        logger.warn(
          { error, playQueueItemID: item.playQueueItemID, track: item.title },
          'failed to remove track from queue'
        );
      }
    }

    // Log action to database
    await this.logAction(
      sessionId,
      playQueueId,
      'remove_artist',
      { artists },
      reason,
      removedCount
    );

    return removedCount;
  }

  /**
   * Refill queue with sonically similar tracks
   */
  private async refillQueue(
    sessionId: number,
    playQueueId: number,
    seedTracks: string[],
    reason: string
  ): Promise<void> {
    try {
      // Get current queue to use as seeds if no seedTracks provided
      let queue;
      try {
        queue = await getPlayQueue(playQueueId);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('404')) {
          logger.warn(
            { playQueueId, sessionId },
            'queue no longer exists, skipping refill'
          );
          await this.clearStaleQueueId(sessionId);
          return;
        }
        throw error;
      }

      const queueRatingKeys = new Set(
        queue.Metadata.map(item => item.ratingKey)
      );

      // Use provided seeds or select from current queue
      let seeds: string[] = seedTracks;
      if (seeds.length === 0) {
        // Use top 5 tracks from current queue as seeds
        seeds = queue.Metadata.slice(0, 5).map(item => item.ratingKey);
      }

      if (seeds.length === 0) {
        logger.warn({ playQueueId }, 'no seed tracks available for refill');
        return;
      }

      logger.info(
        {
          playQueueId,
          seedCount: seeds.length,
          queueSize: queue.Metadata.length
        },
        'fetching sonically similar tracks for refill'
      );

      // Fetch similar tracks using Plex sonicallySimilar API
      const similarTracks = await this.fetchSimilarTracks(
        seeds,
        queueRatingKeys,
        10 // Target 10 tracks to add
      );

      if (similarTracks.length === 0) {
        logger.warn({ playQueueId, seedCount: seeds.length }, 'no similar tracks found');
        return;
      }

      logger.info(
        {
          playQueueId,
          foundCount: similarTracks.length,
          seedCount: seeds.length
        },
        'adding similar tracks to queue'
      );

      // Add tracks to queue with rate limiting
      let addedCount = 0;
      for (const track of similarTracks) {
        try {
          const ratingKey = track.ratingKey?.toString();
          if (!ratingKey) {
            continue;
          }

          await addToQueue(playQueueId, ratingKey, false); // Add to end
          await this.delay(this.API_DELAY_MS);
          addedCount++;
        } catch (error) {
          logger.warn(
            { error, ratingKey: track.ratingKey, track: track.title },
            'failed to add track to queue'
          );
        }
      }

      // Log action to database
      await this.logAction(
        sessionId,
        playQueueId,
        'refill',
        { seedTracks: seeds, addedCount },
        reason,
        addedCount
      );

      logger.info(
        { playQueueId, addedCount, seedCount: seeds.length },
        'completed queue refill'
      );
    } catch (error) {
      logger.error({ error, playQueueId }, 'failed to refill queue');
    }
  }

  /**
   * Fetch sonically similar tracks using Plex API
   * Filters out tracks already in queue
   */
  private async fetchSimilarTracks(
    seedRatingKeys: string[],
    excludeRatingKeys: Set<string>,
    targetCount: number
  ): Promise<Track[]> {
    const results: Track[] = [];
    const seen = new Set<string>();

    // Limit to first 5 seeds to avoid too many API calls
    const limitedSeeds = seedRatingKeys.slice(0, 5);

    for (const seedKey of limitedSeeds) {
      try {
        // Fetch the track object
        const seedTrack = await fetchTrackByRatingKey(seedKey);
        if (!seedTrack) {
          logger.debug({ ratingKey: seedKey }, 'seed track not found');
          continue;
        }

        // Fetch sonically similar tracks (max 10 per seed, max distance 0.25)
        const similars = await seedTrack.sonicallySimilar(10, 0.25);

        for (const similar of similars as Track[]) {
          const ratingKey = similar.ratingKey?.toString();
          if (!ratingKey) {
            continue;
          }

          // Skip if already in queue or already seen
          if (excludeRatingKeys.has(ratingKey) || seen.has(ratingKey)) {
            continue;
          }

          seen.add(ratingKey);
          results.push(similar);

          // Stop early if we have enough
          if (results.length >= targetCount * 2) {
            return results.slice(0, targetCount);
          }
        }
      } catch (error) {
        logger.warn(
          { error, seedKey },
          'failed to fetch similar tracks for seed, continuing'
        );
      }
    }

    return results.slice(0, targetCount);
  }

  /**
   * Log adaptive action to database
   */
  private async logAction(
    sessionId: number,
    playQueueId: number,
    actionType: string,
    actionData: unknown,
    reason: string,
    tracksAffected: number
  ): Promise<void> {
    const db = getDb();

    await db.insert(adaptiveActions).values({
      sessionId,
      playQueueId,
      actionType,
      actionData: JSON.stringify(actionData),
      reason,
      tracksAffected,
      createdAt: new Date()
    });

    logger.debug(
      {
        sessionId,
        playQueueId,
        actionType,
        tracksAffected
      },
      'logged adaptive action'
    );
  }

  /**
   * Fetch enriched genres for a track from track_cache (Last.fm data)
   * Falls back to empty array if not found
   */
  private async fetchGenresForTrack(ratingKey: string): Promise<string[]> {
    try {
      const { getTrackFromCache } = await import('../cache/track-cache-service.js');
      const track = await getTrackFromCache(ratingKey, true); // allow stale

      if (track && track.genres) {
        const genres = JSON.parse(track.genres as string);
        return Array.isArray(genres) ? genres : [];
      }
    } catch (error) {
      logger.warn({ error, ratingKey }, 'failed to fetch genres from track cache');
    }

    return [];
  }

  /**
   * Simple delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear stale queue ID from session when queue no longer exists
   */
  private async clearStaleQueueId(sessionId: number): Promise<void> {
    try {
      const db = getDb();
      const { adaptiveSessions } = await import('../db/schema.js');
      const { eq } = await import('drizzle-orm');

      await db
        .update(adaptiveSessions)
        .set({ playQueueId: null })
        .where(eq(adaptiveSessions.id, sessionId));

      logger.debug({ sessionId }, 'cleared stale queue ID from session');
    } catch (error) {
      logger.warn({ error, sessionId }, 'failed to clear stale queue ID');
    }
  }
}

/**
 * Singleton instance
 */
let queueManager: QueueManager | null = null;

/**
 * Get or create singleton queue manager
 */
export function getQueueManager(): QueueManager {
  if (!queueManager) {
    queueManager = new QueueManager();
  }
  return queueManager;
}
