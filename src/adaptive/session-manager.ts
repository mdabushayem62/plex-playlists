/**
 * Session manager for tracking active playback sessions
 * Detects skip patterns and triggers adaptive actions
 *
 * Flow:
 * 1. media.play → Track current track and start time
 * 2. media.stop → Check if skip (< 90% completion)
 * 3. media.scrobble → Record successful completion
 * 4. After skip → Check for patterns → Trigger adaptation
 */

import { logger } from '../logger.js';
import { getDb } from '../db/index.js';
import { adaptiveSessions, adaptiveSkipEvents, adaptiveCompletionEvents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getQueueTracker } from './queue-tracker.js';
import { getEffectiveConfig } from '../db/settings-service.js';
import type { PlexWebhookPayload, SkipEvent, CompletionEvent } from './types.js';

/**
 * Session state (in-memory)
 */
interface SessionState {
  id: number | null; // Database session ID
  machineIdentifier: string;
  playQueueId: number | null;
  playlistId: number | null;
  currentTrack: string | null;
  currentTrackTitle: string | null;
  currentTrackArtist: string | null;
  currentTrackDuration: number | null;
  playStartedAt: Date | null;
  skipHistory: SkipEvent[];
  completionHistory: CompletionEvent[];
  lastAdaptation: Date | null;
}

/**
 * Session manager singleton
 */
export class SessionManager {
  private sessions = new Map<string, SessionState>(); // machineId → state
  private queueTracker = getQueueTracker();

  // Config thresholds (loaded from settings)
  private SKIP_THRESHOLD_PERCENT = 0.9; // < 90% completion = skip

  /**
   * Handle media.play event
   * IMPORTANT: Also infers skips from consecutive play events (Plexamp doesn't always send media.stop)
   */
  async handleTrackPlay(
    machineIdentifier: string,
    metadata: PlexWebhookPayload['Metadata']
  ): Promise<void> {
    logger.info({ machineIdentifier, track: metadata.title }, 'handleTrackPlay called');

    const session = await this.getOrCreateSession(machineIdentifier);

    // SKIP INFERENCE: Check if previous track was skipped
    if (session.currentTrack && session.playStartedAt && session.currentTrackDuration) {
      const elapsedMs = Date.now() - session.playStartedAt.getTime();
      const completionPercent = elapsedMs / session.currentTrackDuration;

      // If previous track didn't complete (< 90%), it was skipped
      if (completionPercent < this.SKIP_THRESHOLD_PERCENT) {
        // Fetch enriched genres from track cache (Last.fm data)
        const genres = await this.fetchGenresForTrack(session.currentTrack);

        const skipEvent: SkipEvent = {
          trackRatingKey: session.currentTrack,
          trackTitle: session.currentTrackTitle || 'Unknown',
          genres,
          artists: session.currentTrackArtist ? [session.currentTrackArtist] : [],
          skippedAt: new Date(),
          listenDurationMs: elapsedMs,
          completionPercent
        };

        session.skipHistory.push(skipEvent);

        logger.info(
          {
            machineIdentifier,
            track: session.currentTrackTitle,
            artist: session.currentTrackArtist,
            genres,
            completionPercent: (completionPercent * 100).toFixed(1) + '%',
            listenDurationSec: (elapsedMs / 1000).toFixed(1),
            inferredFrom: 'consecutive media.play events'
          },
          'track skipped (inferred)'
        );

        // Persist skip event to database
        if (session.id) {
          await this.recordSkipEvent(session.id, skipEvent);
        }

        // Check for patterns and potentially adapt queue
        await this.checkForPatterns(session);
      }
    }

    // Start tracking new track
    session.currentTrack = metadata.ratingKey;
    session.currentTrackTitle = metadata.title;
    session.currentTrackArtist = metadata.grandparentTitle || null;

    // Fetch duration from Plex API if not in webhook (media.play doesn't include it)
    let duration = metadata.duration || null;
    if (!duration) {
      const { fetchTrackDuration } = await import('./track-metadata-fetcher.js');
      duration = await fetchTrackDuration(metadata.ratingKey);
    }

    session.currentTrackDuration = duration;
    session.playStartedAt = new Date();

    logger.info(
      {
        machineIdentifier,
        track: metadata.title,
        artist: metadata.grandparentTitle,
        ratingKey: metadata.ratingKey,
        duration,
        durationSource: metadata.duration ? 'webhook' : 'plex-api'
      },
      'track play started'
    );

    // Try to discover queue if not known
    logger.info(
      {
        hasQueueId: !!session.playQueueId,
        currentQueueId: session.playQueueId,
        hasCurrentTrack: !!session.currentTrack,
        currentTrack: session.currentTrack
      },
      'checking if queue discovery needed'
    );

    if (!session.playQueueId && session.currentTrack) {
      logger.info({ machineIdentifier, trackRatingKey: session.currentTrack }, 'starting queue discovery');

      const queueId = await this.queueTracker.findQueue(
        machineIdentifier,
        session.currentTrack
      );

      if (queueId) {
        session.playQueueId = queueId;
        await this.persistSession(session);
      } else {
        logger.warn({ machineIdentifier, trackRatingKey: session.currentTrack }, 'queue discovery failed');
      }
    } else {
      logger.info('skipping queue discovery - already have queue ID or no current track');
    }
  }

  /**
   * Handle media.stop event (potential skip)
   */
  async handleTrackStop(
    machineIdentifier: string,
    metadata: PlexWebhookPayload['Metadata']
  ): Promise<void> {
    logger.info({ machineIdentifier, track: metadata.title }, 'handleTrackStop called');

    const session = this.sessions.get(machineIdentifier);
    if (!session || !session.playStartedAt) {
      return;
    }

    const viewOffset = metadata.viewOffset || 0;
    const duration = metadata.duration || 1;
    const completionPercent = viewOffset / duration;

    // Detect skip
    if (completionPercent < this.SKIP_THRESHOLD_PERCENT) {
      // Fetch enriched genres from track cache (Last.fm data)
      const genres = await this.fetchGenresForTrack(metadata.ratingKey);

      const skipEvent: SkipEvent = {
        trackRatingKey: metadata.ratingKey,
        trackTitle: metadata.title,
        genres,
        artists: this.extractArtists(metadata),
        skippedAt: new Date(),
        listenDurationMs: viewOffset,
        completionPercent
      };

      session.skipHistory.push(skipEvent);

      logger.info(
        {
          machineIdentifier,
          track: metadata.title,
          completionPercent: (completionPercent * 100).toFixed(1) + '%',
          listenDurationSec: (viewOffset / 1000).toFixed(1)
        },
        'track skipped'
      );

      // Persist skip event to database
      if (session.id) {
        await this.recordSkipEvent(session.id, skipEvent);
      }

      // Check for patterns and potentially adapt queue
      await this.checkForPatterns(session);
    }

    // Reset current track
    session.currentTrack = null;
    session.playStartedAt = null;
  }

  /**
   * Handle media.scrobble event (successful completion)
   */
  async handleTrackScrobble(
    machineIdentifier: string,
    metadata: PlexWebhookPayload['Metadata']
  ): Promise<void> {
    logger.info({ machineIdentifier, track: metadata.title }, 'handleTrackScrobble called');

    const session = this.sessions.get(machineIdentifier);
    if (!session || !session.playStartedAt) {
      return;
    }

    // Fetch enriched genres from track cache (Last.fm data)
    const genres = await this.fetchGenresForTrack(metadata.ratingKey);

    const completionEvent: CompletionEvent = {
      trackRatingKey: metadata.ratingKey,
      trackTitle: metadata.title,
      genres,
      artists: this.extractArtists(metadata),
      completedAt: new Date()
    };

    session.completionHistory.push(completionEvent);

    logger.debug(
      {
        machineIdentifier,
        track: metadata.title,
        artist: metadata.grandparentTitle
      },
      'track completed'
    );

    // Persist completion event to database
    if (session.id) {
      await this.recordCompletionEvent(session.id, completionEvent);
    }
  }

  /**
   * Check for skip patterns and trigger adaptation
   */
  private async checkForPatterns(session: SessionState): Promise<void> {
    logger.info({ machineIdentifier: session.machineIdentifier }, 'checkForPatterns called');

    // Check if adaptive queue is enabled
    const config = await getEffectiveConfig();
    logger.info({ adaptiveQueueEnabled: config.adaptiveQueueEnabled }, 'adaptive queue config');

    if (!config.adaptiveQueueEnabled) {
      logger.info('adaptive queue disabled, skipping pattern check');
      return;
    }

    // Check cooldown
    if (session.lastAdaptation) {
      const cooldownMs = config.adaptiveCooldownSeconds * 1000;
      const msSinceLastAdaptation = Date.now() - session.lastAdaptation.getTime();

      if (msSinceLastAdaptation < cooldownMs) {
        logger.info(
          { machineIdentifier: session.machineIdentifier, cooldownRemaining: cooldownMs - msSinceLastAdaptation },
          'adaptation on cooldown'
        );
        return;
      }
    }

    // Check if we have a queue ID and session ID
    logger.info(
      {
        machineIdentifier: session.machineIdentifier,
        hasQueue: !!session.playQueueId,
        playQueueId: session.playQueueId,
        hasSessionId: !!session.id,
        sessionId: session.id
      },
      'checking queue and session IDs'
    );

    if (!session.playQueueId || !session.id) {
      logger.info('missing queue ID or session ID, cannot adapt');
      return;
    }

    // Analyze skip patterns
    logger.info(
      {
        machineIdentifier: session.machineIdentifier,
        skipCount: session.skipHistory.length,
        completionCount: session.completionHistory.length
      },
      'calling pattern analyzer'
    );

    const { getPatternAnalyzer } = await import('./pattern-analyzer.js');
    const patternAnalyzer = getPatternAnalyzer();
    const actions = await patternAnalyzer.analyze(session.skipHistory, session.completionHistory);

    logger.info({ actionsFound: actions.length }, 'pattern analyzer returned');

    if (actions.length === 0) {
      logger.info(
        { machineIdentifier: session.machineIdentifier, skipCount: session.skipHistory.length },
        'no patterns detected by analyzer'
      );
      return;
    }

    logger.info(
      {
        machineIdentifier: session.machineIdentifier,
        playQueueId: session.playQueueId,
        actions: actions.map(a => a.type)
      },
      'patterns detected, triggering adaptation'
    );

    // Execute adaptive actions
    const { getQueueManager } = await import('./queue-manager.js');
    const queueManager = getQueueManager();
    await queueManager.adaptQueue(session.id, session.playQueueId, actions);

    // Update last adaptation timestamp
    session.lastAdaptation = new Date();
  }

  /**
   * Get or create session state
   */
  private async getOrCreateSession(machineIdentifier: string): Promise<SessionState> {
    if (!this.sessions.has(machineIdentifier)) {
      // Load from database or create new
      const dbSession = await this.loadSession(machineIdentifier);

      const session: SessionState = dbSession || {
        id: null,
        machineIdentifier,
        playQueueId: null,
        playlistId: null,
        currentTrack: null,
        currentTrackTitle: null,
        currentTrackArtist: null,
        currentTrackDuration: null,
        playStartedAt: null,
        skipHistory: [],
        completionHistory: [],
        lastAdaptation: null
      };

      this.sessions.set(machineIdentifier, session);

      // Create in database if new
      if (!session.id) {
        session.id = await this.createSession(machineIdentifier);
      }
    }

    return this.sessions.get(machineIdentifier)!;
  }

  /**
   * Load session from database
   */
  private async loadSession(machineIdentifier: string): Promise<SessionState | null> {
    const db = getDb();

    try {
      const result = await db
        .select()
        .from(adaptiveSessions)
        .where(eq(adaptiveSessions.machineIdentifier, machineIdentifier))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const dbSession = result[0];

      return {
        id: dbSession.id,
        machineIdentifier: dbSession.machineIdentifier,
        playQueueId: dbSession.playQueueId,
        playlistId: dbSession.playlistId,
        currentTrack: null,
        currentTrackTitle: null,
        currentTrackArtist: null,
        currentTrackDuration: null,
        playStartedAt: null,
        skipHistory: [],
        completionHistory: [],
        lastAdaptation: null
      };
    } catch (error) {
      logger.warn({ error, machineIdentifier }, 'failed to load session from database');
      return null;
    }
  }

  /**
   * Create session in database
   */
  private async createSession(machineIdentifier: string): Promise<number> {
    const db = getDb();

    const result = await db
      .insert(adaptiveSessions)
      .values({
        machineIdentifier,
        playQueueId: null,
        playlistId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    logger.info({ machineIdentifier, sessionId: result[0].id }, 'created new session');

    return result[0].id;
  }

  /**
   * Persist session state to database
   */
  private async persistSession(session: SessionState): Promise<void> {
    if (!session.id) {
      return;
    }

    const db = getDb();

    await db
      .update(adaptiveSessions)
      .set({
        playQueueId: session.playQueueId,
        playlistId: session.playlistId,
        updatedAt: new Date()
      })
      .where(eq(adaptiveSessions.id, session.id));
  }

  /**
   * Record skip event in database
   */
  private async recordSkipEvent(sessionId: number, skip: SkipEvent): Promise<void> {
    const db = getDb();

    await db.insert(adaptiveSkipEvents).values({
      sessionId,
      trackRatingKey: skip.trackRatingKey,
      trackTitle: skip.trackTitle,
      genres: JSON.stringify(skip.genres),
      artists: JSON.stringify(skip.artists),
      skippedAt: skip.skippedAt,
      listenDurationMs: skip.listenDurationMs,
      completionPercent: skip.completionPercent
    });
  }

  /**
   * Record completion event in database
   */
  private async recordCompletionEvent(sessionId: number, completion: CompletionEvent): Promise<void> {
    const db = getDb();

    await db.insert(adaptiveCompletionEvents).values({
      sessionId,
      trackRatingKey: completion.trackRatingKey,
      trackTitle: completion.trackTitle,
      genres: JSON.stringify(completion.genres),
      artists: JSON.stringify(completion.artists),
      completedAt: completion.completedAt,
      listenDurationMs: 0 // Not tracked for completions
    });
  }

  /**
   * Fetch genres from track cache (enriched with Last.fm data)
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
   * Extract genres from webhook metadata
   */
  private extractGenres(_metadata: PlexWebhookPayload['Metadata']): string[] {
    // Plex doesn't include Genre in webhook metadata
    // Use fetchGenresForTrack() instead
    return [];
  }

  /**
   * Extract artists from webhook metadata
   */
  private extractArtists(metadata: PlexWebhookPayload['Metadata']): string[] {
    return metadata.grandparentTitle ? [metadata.grandparentTitle] : [];
  }

  /**
   * Clean up stale sessions
   */
  async cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [machineId, session] of this.sessions.entries()) {
      // Consider session stale if no recent activity
      const lastActivity = session.playStartedAt || session.lastAdaptation;
      if (lastActivity && now - lastActivity.getTime() > maxAgeMs) {
        this.sessions.delete(machineId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removed }, 'cleaned up stale sessions');
    }

    return removed;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by machine identifier
   */
  getSession(machineIdentifier: string): SessionState | null {
    return this.sessions.get(machineIdentifier) || null;
  }

  /**
   * Clear all queue IDs from database (rarely needed)
   *
   * PlayQueue IDs persist as long as Plex server is running, even across OUR server restarts.
   * They only become invalid when:
   * - Plex server restarts
   * - User creates a new queue
   * - User stops playback
   *
   * This method is kept for manual clearing if needed, but should NOT be called on startup.
   * Invalid queue IDs will be detected naturally and trigger rediscovery.
   */
  async clearAllQueueIds(): Promise<number> {
    const db = getDb();

    const result = await db
      .update(adaptiveSessions)
      .set({ playQueueId: null })
      .returning();

    // Also clear in-memory session cache
    this.sessions.clear();

    logger.info({ clearedDb: result.length }, 'cleared stale queue IDs from database and memory');
    return result.length;
  }
}

/**
 * Singleton instance
 */
let sessionManager: SessionManager | null = null;

/**
 * Get or create singleton session manager
 */
export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}
