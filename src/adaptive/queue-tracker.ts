/**
 * PlayQueue tracker with intelligent queue discovery
 * Correlates webhook events to active PlayQueues using multiple strategies
 *
 * Discovery Strategy (in order):
 * 1. Cache lookup (instant if recently discovered)
 * 2. Session-based correlation (fast, uses /status/sessions API)
 *    - Find active session by machineIdentifier
 *    - Get playing track → find playlist → search for matching queue
 *    - ±50 targeted search if needed
 * 3. Brute force fallback (slow but comprehensive)
 *    - ±200 search from max queue ID
 *    - Match by playQueuePlaylistID or track presence
 * 4. Cache successful discoveries for 30min
 * 5. Track failures for observability
 */

import { getDb } from '../db/index.js';
import { playlistTracks, playlists } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';
import { listPlayQueues, getPlayQueue } from '../plex/playqueue.js';

/**
 * Cache entry for queue correlation
 */
interface QueueCacheEntry {
  playQueueId: number;
  playlistId: number | null; // Plex's playlist ID (plexRatingKey), not our database ID
  machineIdentifier: string;
  cachedAt: number;
  lastUsedAt: number;
}

/**
 * Queue discovery failure record
 */
export interface QueueDiscoveryFailure {
  machineIdentifier: string;
  trackRatingKey: string;
  attemptedAt: Date;
  referenceQueueId: number | null;
  searchRange: number;
  reason: string;
}

/**
 * Queue tracker with intelligent discovery
 */
export class QueueTracker {
  private cache = new Map<string, QueueCacheEntry>(); // machineId → queue info
  private failures: QueueDiscoveryFailure[] = [];
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_SEARCH_RANGE = 200; // Maximum ± range to search (increased for wider coverage)

  /**
   * Find PlayQueue for a given session and track
   * Returns null if not found (graceful degradation)
   */
  async findQueue(
    machineIdentifier: string,
    trackRatingKey: string
  ): Promise<number | null> {
    // 1. Check cache first
    const cached = this.getCached(machineIdentifier);
    if (cached) {
      logger.debug(
        { machineIdentifier, playQueueId: cached.playQueueId },
        'queue found in cache'
      );
      return cached.playQueueId;
    }

    // 2. Try session-based discovery first (fast, direct)
    const sessionQueueId = await this.sessionBasedDiscovery(machineIdentifier, trackRatingKey);
    if (sessionQueueId) {
      // Cache successful discovery
      const playlistId = await this.findPlaylistForTrack(trackRatingKey);
      this.cache.set(machineIdentifier, {
        playQueueId: sessionQueueId,
        playlistId,
        machineIdentifier,
        cachedAt: Date.now(),
        lastUsedAt: Date.now()
      });

      logger.info(
        { machineIdentifier, playQueueId: sessionQueueId, method: 'session-based' },
        'queue discovered via session correlation'
      );
      return sessionQueueId;
    }

    // 3. Check if track belongs to one of our playlists
    const playlistId = await this.findPlaylistForTrack(trackRatingKey);
    if (!playlistId) {
      logger.debug(
        { machineIdentifier, trackRatingKey },
        'track not in any of our playlists, skipping queue discovery'
      );
      return null;
    }

    // 4. Fallback to brute force search with playlist correlation
    const queueId = await this.bruteForceSearch(machineIdentifier, trackRatingKey, playlistId);

    if (queueId) {
      // Cache successful discovery
      this.cache.set(machineIdentifier, {
        playQueueId: queueId,
        playlistId,
        machineIdentifier,
        cachedAt: Date.now(),
        lastUsedAt: Date.now()
      });

      logger.info(
        {
          machineIdentifier,
          playQueueId: queueId,
          playlistId,
          trackRatingKey
        },
        'queue discovered and cached'
      );
    }

    return queueId;
  }

  /**
   * Session-based queue discovery using /status/sessions API
   * Much faster and more reliable than brute force
   *
   * Strategy:
   * 1. Get active sessions from /status/sessions
   * 2. Find session matching our machineIdentifier
   * 3. Get currently playing track from session
   * 4. Find which playlist contains that track
   * 5. Search for queue with matching playQueuePlaylistID
   */
  private async sessionBasedDiscovery(
    machineIdentifier: string,
    trackRatingKey: string
  ): Promise<number | null> {
    try {
      const { getPlexServer } = await import('../plex/client.js');
      const server = await getPlexServer();

      // Get active playback sessions
      const sessionsResponse = await server.query('/status/sessions');
      const sessions = sessionsResponse.MediaContainer?.Metadata || [];

      logger.info(
        { totalSessions: sessions.length, machineIdentifier },
        'session-based discovery: checking active sessions'
      );

      // Find session matching our player
      const activeSession = sessions.find((s: unknown) => {
        // Type guard: Plex session with Player object
        if (typeof s !== 'object' || s === null) return false;
        const session = s as { Player?: { machineIdentifier?: string; uuid?: string; title?: string } };

        const sessionMachineId = session.Player?.machineIdentifier ||
                                 session.Player?.uuid ||
                                 session.Player?.title;
        return sessionMachineId === machineIdentifier;
      });

      if (!activeSession) {
        logger.info(
          { machineIdentifier, sessionsChecked: sessions.length },
          'session-based discovery: no active session found'
        );
        return null;
      }

      // Get the currently playing track
      // Type guard: activeSession is Plex session with ratingKey
      const session = activeSession as { ratingKey?: string };
      const playingTrackKey = session.ratingKey;

      if (!playingTrackKey) {
        logger.info(
          { machineIdentifier },
          'session-based discovery: no ratingKey in active session'
        );
        return null;
      }

      logger.info(
        { machineIdentifier, playingTrackKey, webhookTrackKey: trackRatingKey },
        'session-based discovery: found active session'
      );

      // Find which of our playlists contains this track
      const playlistId = await this.findPlaylistForTrack(playingTrackKey);
      if (!playlistId) {
        logger.info(
          { playingTrackKey },
          'session-based discovery: track not in our playlists'
        );
        return null;
      }

      // Now search for a PlayQueue with matching playlistID
      // Try the /playQueues list first (fast path)
      const referenceQueues = await listPlayQueues();

      for (const queue of referenceQueues) {
        if (queue.playlistID === playlistId) {
          logger.info(
            { playQueueId: queue.id, playlistId, method: 'session+list' },
            'found queue via session correlation + /playQueues list'
          );
          return queue.id;
        }
      }

      // If not in list, try a targeted search around the reference queues
      // This is still much better than full ±200 brute force
      if (referenceQueues.length > 0) {
        const maxQueueId = Math.max(...referenceQueues.map(q => q.id));

        // Search ±50 range (much smaller than ±200)
        for (let offset = 0; offset <= 50; offset++) {
          // Try higher IDs first (newer queues)
          if (offset > 0) {
            const queueId = await this.checkQueueForPlaylist(maxQueueId + offset, playlistId);
            if (queueId) return queueId;
          }

          // Then try lower IDs
          if (maxQueueId - offset > 0) {
            const queueId = await this.checkQueueForPlaylist(maxQueueId - offset, playlistId);
            if (queueId) return queueId;
          }
        }
      }

      logger.info(
        { plexPlaylistId: playlistId, machineIdentifier },
        'session-based discovery: failed to find queue (tried ±50 range)'
      );
      return null;
    } catch (error) {
      logger.warn(
        { error, machineIdentifier },
        'error during session-based discovery, falling back to brute force'
      );
      return null;
    }
  }

  /**
   * Check if a specific queue ID matches our playlist
   */
  private async checkQueueForPlaylist(
    queueId: number,
    playlistId: number
  ): Promise<number | null> {
    try {
      const queue = await getPlayQueue(queueId);
      if (queue.playQueuePlaylistID === playlistId) {
        logger.info(
          { queueId, playlistId, offset: 'session-targeted' },
          'found queue via session-targeted search'
        );
        return queueId;
      }
    } catch {
      // Queue doesn't exist, continue
    }
    return null;
  }

  /**
   * Brute force search for queue using alternating outward search
   * Strategy: Try /playQueues fast path, then search backward from max known queue ID
   * Rationale: Queue IDs increment over time, so newest queue = highest ID
   */
  private async bruteForceSearch(
    machineIdentifier: string,
    trackRatingKey: string,
    playlistId: number
  ): Promise<number | null> {
    // Get reference queue IDs from /playQueues list
    const referenceQueues = await listPlayQueues();

    if (referenceQueues.length === 0) {
      this.recordFailure(
        machineIdentifier,
        trackRatingKey,
        null,
        0,
        'no reference queues from /playQueues'
      );
      return null;
    }

    // Fast path: Check if any listed queue matches our playlist directly
    for (const ref of referenceQueues) {
      if (ref.playlistID === playlistId) {
        logger.debug(
          { playQueueId: ref.id, playlistId },
          'queue found in /playQueues list (fast path)'
        );
        return ref.id;
      }
    }

    // Strategy: Search backward from highest known queue ID
    // Queue IDs increment over time, so active queue likely has higher ID than stale reference
    const maxReferenceId = Math.max(...referenceQueues.map(q => q.id));

    logger.debug(
      {
        maxReferenceId,
        playlistId,
        referenceQueues: referenceQueues.length
      },
      'starting backward search from max queue ID (newer queues = higher IDs)'
    );

    // Search backward first (higher IDs), then forward, prioritizing recent queues
    // This handles: active queue > stale reference (most common case)
    for (let offset = 0; offset <= this.MAX_SEARCH_RANGE; offset++) {
      // Try backward first (higher queue IDs = more recent)
      if (offset > 0) {
        const backwardResult = await this.tryQueueId(
          maxReferenceId + offset,
          playlistId,
          trackRatingKey
        );
        if (backwardResult) {
          logger.info(
            { foundId: maxReferenceId + offset, offset: `+${offset}`, maxReferenceId },
            'queue found via backward search (higher ID)'
          );
          return backwardResult;
        }
      }

      // Then try forward (lower queue IDs = older)
      if (maxReferenceId - offset > 0) {
        const forwardResult = await this.tryQueueId(
          maxReferenceId - offset,
          playlistId,
          trackRatingKey
        );
        if (forwardResult) {
          logger.info(
            { foundId: maxReferenceId - offset, offset: `-${offset}`, maxReferenceId },
            'queue found via forward search (lower ID)'
          );
          return forwardResult;
        }
      }
    }

    // Not found within range
    this.recordFailure(
      machineIdentifier,
      trackRatingKey,
      maxReferenceId,
      this.MAX_SEARCH_RANGE,
      `exhausted search range ±${this.MAX_SEARCH_RANGE} from max reference ${maxReferenceId}`
    );

    return null;
  }

  /**
   * Try a specific queue ID for match
   * Returns queue ID if match found, null otherwise
   */
  private async tryQueueId(
    queueId: number,
    playlistId: number,
    trackRatingKey: string
  ): Promise<number | null> {
    try {
      const queue = await getPlayQueue(queueId);

      // Match by playlist ID (best method - undocumented field!)
      if (queue.playQueuePlaylistID === playlistId) {
        return queueId;
      }

      // Fallback: Match by track presence
      const hasTrack = queue.Metadata?.some(t => t.ratingKey === trackRatingKey);
      if (hasTrack) {
        logger.debug(
          { queueId, trackRatingKey },
          'matched queue by track presence (playlist ID mismatch)'
        );
        return queueId;
      }

      return null;
    } catch {
      // Queue doesn't exist or access denied, continue search
      return null;
    }
  }

  /**
   * Find which of our playlists contains this track
   * Returns Plex's playlist ID (plexRatingKey) for matching with playQueuePlaylistID
   */
  private async findPlaylistForTrack(trackRatingKey: string): Promise<number | null> {
    const db = getDb();

    try {
      const result = await db
        .select({ plexRatingKey: playlists.plexRatingKey })
        .from(playlistTracks)
        .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
        .where(eq(playlistTracks.plexRatingKey, trackRatingKey))
        .limit(1);

      if (result.length === 0 || !result[0].plexRatingKey) {
        return null;
      }

      // Parse plexRatingKey from TEXT to number for comparison with playQueuePlaylistID
      const plexId = parseInt(result[0].plexRatingKey, 10);
      return isNaN(plexId) ? null : plexId;
    } catch {
      logger.warn({ trackRatingKey }, 'failed to query playlist for track');
      return null;
    }
  }

  /**
   * Get cached queue for machine identifier
   */
  private getCached(machineIdentifier: string): QueueCacheEntry | null {
    const cached = this.cache.get(machineIdentifier);

    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.cachedAt;
    if (age > this.CACHE_TTL_MS) {
      this.cache.delete(machineIdentifier);
      logger.debug({ machineIdentifier, ageMs: age }, 'cache entry expired');
      return null;
    }

    // Update last used timestamp
    cached.lastUsedAt = Date.now();
    return cached;
  }

  /**
   * Manually set queue ID for a session (for testing or manual correlation)
   */
  setQueue(
    machineIdentifier: string,
    playQueueId: number,
    playlistId: number | null = null
  ): void {
    this.cache.set(machineIdentifier, {
      playQueueId,
      playlistId,
      machineIdentifier,
      cachedAt: Date.now(),
      lastUsedAt: Date.now()
    });

    logger.info({ machineIdentifier, playQueueId, playlistId }, 'manually set queue correlation');
  }

  /**
   * Clear cache for a specific session
   */
  clearCache(machineIdentifier: string): void {
    this.cache.delete(machineIdentifier);
    logger.debug({ machineIdentifier }, 'cleared queue cache');
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info({ count }, 'cleared all queue caches');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      entries: this.cache.size,
      failures: this.failures.length
    };
  }

  /**
   * Get recent failures for debugging
   */
  getRecentFailures(limit = 10): QueueDiscoveryFailure[] {
    return this.failures.slice(-limit);
  }

  /**
   * Record a queue discovery failure
   */
  private recordFailure(
    machineIdentifier: string,
    trackRatingKey: string,
    referenceQueueId: number | null,
    searchRange: number,
    reason: string
  ): void {
    const failure: QueueDiscoveryFailure = {
      machineIdentifier,
      trackRatingKey,
      attemptedAt: new Date(),
      referenceQueueId,
      searchRange,
      reason
    };

    this.failures.push(failure);

    // Keep only last 100 failures
    if (this.failures.length > 100) {
      this.failures.shift();
    }

    logger.warn(
      {
        machineIdentifier,
        trackRatingKey,
        referenceQueueId,
        searchRange,
        reason
      },
      'queue discovery failed'
    );
  }

  /**
   * Clean up stale cache entries
   */
  cleanupStaleEntries(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.cachedAt;
      if (age > this.CACHE_TTL_MS) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removed }, 'cleaned up stale queue cache entries');
    }

    return removed;
  }
}

/**
 * Singleton instance
 */
let queueTracker: QueueTracker | null = null;

/**
 * Get or create singleton queue tracker
 */
export function getQueueTracker(): QueueTracker {
  if (!queueTracker) {
    queueTracker = new QueueTracker();
  }
  return queueTracker;
}
