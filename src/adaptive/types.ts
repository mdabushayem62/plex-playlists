/**
 * Types for Plex webhook payloads and adaptive queue system
 */

/**
 * Plex webhook event types
 * Documentation: https://support.plex.tv/articles/115002267687-webhooks/
 */
export type PlexWebhookEvent =
  | 'media.play'
  | 'media.pause'
  | 'media.resume'
  | 'media.stop'
  | 'media.scrobble'
  | 'media.rate';

/**
 * Plex webhook payload structure
 * Note: Plex sends multipart/form-data with JSON in the 'payload' field
 */
export interface PlexWebhookPayload {
  event: PlexWebhookEvent;
  user: boolean;
  owner: boolean;
  Account: {
    id: number;
    thumb: string;
    title: string;
  };
  Server: {
    title: string;
    uuid: string;
  };
  Player: {
    local: boolean;
    publicAddress: string;
    title: string;
    uuid: string; // machineIdentifier - used to track sessions
  };
  Metadata: {
    librarySectionType: string;
    ratingKey: string;
    key: string;
    parentRatingKey?: string;
    grandparentRatingKey?: string;
    guid: string;
    type: 'track' | 'episode' | 'movie' | 'show';
    title: string;
    grandparentTitle?: string; // Artist name
    parentTitle?: string; // Album name
    index?: number; // Track number
    parentIndex?: number;
    viewOffset?: number; // Current playback position in ms
    duration?: number; // Total duration in ms
  };
}

/**
 * Skip event data for pattern analysis
 */
export interface SkipEvent {
  trackRatingKey: string;
  trackTitle: string;
  genres: string[];
  artists: string[];
  skippedAt: Date;
  listenDurationMs: number;
  completionPercent: number;
}

/**
 * Completion event data (successful listen)
 */
export interface CompletionEvent {
  trackRatingKey: string;
  trackTitle: string;
  genres: string[];
  artists: string[];
  completedAt: Date;
}

/**
 * Pattern detection result
 */
export interface DetectedPattern {
  type: 'genre_fatigue' | 'artist_aversion' | 'tempo_mismatch';
  confidence: number; // 0-1
  targetGenre?: string;
  targetArtist?: string;
  skipCount: number;
  windowMinutes: number;
}

/**
 * Adaptive action log entry
 */
export interface AdaptiveAction {
  sessionId: number;
  actionType: 'remove' | 'add';
  trackRatingKey: string;
  trackTitle: string;
  reason: string;
  detectedPattern?: DetectedPattern;
  timestamp: Date;
}

/**
 * Session tracking state
 */
export interface AdaptiveSession {
  id: number;
  machineIdentifier: string;
  playQueueId?: number;
  playlistId?: number;
  createdAt: Date;
  updatedAt: Date;
}
