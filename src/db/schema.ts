import { integer, real, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sqliteTable, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const playlists = sqliteTable(
  'playlists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    window: text('window').notNull(),
    plexRatingKey: text('plex_rating_key'),
    title: text('title'),
    description: text('description'),
    generatedAt: integer('generated_at', { mode: 'timestamp_ms' }).notNull(),
    trackCount: integer('track_count').notNull().default(0)
  },
  table => ({
    windowIdx: uniqueIndex('playlists_window_unique').on(table.window)
  })
);

export const playlistTracks = sqliteTable('playlist_tracks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playlistId: integer('playlist_id')
    .notNull()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  plexRatingKey: text('plex_rating_key').notNull(),
  title: text('title'),
  artist: text('artist'),
  album: text('album'),
  genres: text('genres'), // JSON array of genre strings
  position: integer('position').notNull(),
  score: real('score'),
  recencyWeight: real('recency_weight'),
  fallbackScore: real('fallback_score'),
  scoringMetadata: text('scoring_metadata') // JSON object with complete ScoringComponents breakdown
});

export const jobRuns = sqliteTable('job_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  window: text('window').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  status: text('status').notNull(),
  error: text('error'),
  // Progress tracking fields
  progressCurrent: integer('progress_current').default(0),
  progressTotal: integer('progress_total').default(0),
  progressMessage: text('progress_message')
});

/**
 * Artist cache for artist-level metadata enrichment
 * Primary sources: Last.fm (aggressive, 5 concurrent), Spotify (slow backfill)
 * TTL: 180 days
 */
export const artistCache = sqliteTable(
  'artist_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    artistName: text('artist_name').notNull(),
    spotifyArtistId: text('spotify_artist_id'), // Spotify artist ID for future use
    popularity: integer('popularity'), // Spotify popularity (0-100, updated from API)
    genres: text('genres').notNull(), // JSON array of genre/style strings
    moods: text('moods').notNull().default('[]'), // JSON array of mood strings
    source: text('source').notNull(), // 'spotify', 'lastfm', 'plex', 'embedded', or 'manual' (comma-separated for multiple)
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }), // Optional TTL for cache invalidation (with jitter)
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }) // Track when this cache entry was last accessed for usage-based prioritization
  },
  table => ({
    artistNameIdx: uniqueIndex('artist_cache_artist_unique').on(table.artistName),
    spotifyIdIdx: index('artist_cache_spotify_id_idx').on(table.spotifyArtistId)
  })
);

/**
 * Album cache for album-specific metadata enrichment
 * Primary sources: Last.fm (aggressive, 5 concurrent, best album-level granularity), Plex (always included)
 * Spotify skipped for albums (usually empty, artist genres only)
 * TTL: 90 days
 */
export const albumCache = sqliteTable(
  'album_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    artistName: text('artist_name').notNull(),
    albumName: text('album_name').notNull(),
    genres: text('genres').notNull(), // JSON array of genre/style strings (album-specific from Last.fm!)
    moods: text('moods').notNull().default('[]'), // JSON array of mood strings (from Plex)
    source: text('source').notNull(), // 'lastfm', 'plex', or combination (comma-separated for multiple)
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }), // Optional TTL for cache invalidation (with jitter)
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }) // Track when this cache entry was last accessed for usage-based prioritization
  },
  table => ({
    albumIdx: uniqueIndex('album_cache_album_unique').on(table.artistName, table.albumName)
  })
);

export const setupState = sqliteTable('setup_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  currentStep: text('current_step').notNull(), // 'welcome', 'import', 'cache', 'genres', 'api_keys', 'playlists', 'complete'
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  stepData: text('step_data'), // JSON blob for step-specific data
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s','now')*1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s','now')*1000)`)
});

/**
 * Settings table for storing web UI configuration overrides
 * These values take precedence over environment variables
 */
export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(), // Setting key (e.g., 'plex_base_url', 'plex_auth_token')
    value: text('value'), // Setting value (null = use env var default)
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`)
  },
  table => ({
    keyIdx: uniqueIndex('settings_key_unique').on(table.key)
  })
);

/**
 * Settings history table for audit trail
 * Tracks all changes made to settings via web UI
 */
export const settingsHistory = sqliteTable(
  'settings_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    settingKey: text('setting_key').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value').notNull(),
    changedBy: text('changed_by').notNull().default('web_ui'),
    changedAt: integer('changed_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`)
  },
  table => ({
    // Regular indexes for query performance (not unique - we want multiple history entries)
    keyIdx: index('settings_history_key_idx').on(table.settingKey),
    changedAtIdx: index('settings_history_changed_at_idx').on(table.changedAt)
  })
);

/**
 * Custom playlists table for user-defined genre/mood combinations
 * Managed via the web UI playlist builder
 */
export const customPlaylists = sqliteTable(
  'custom_playlists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(), // Display name for the playlist
    genres: text('genres').notNull().default('[]'), // JSON array of genre strings (0-2)
    moods: text('moods').notNull().default('[]'), // JSON array of mood strings (0-2)
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    cron: text('cron'), // Optional custom schedule (null = use default weekly)
    targetSize: integer('target_size').default(50), // Target playlist size
    description: text('description'), // Optional user description
    scoringStrategy: text('scoring_strategy').notNull().default('quality'), // Scoring strategy: 'balanced', 'quality', 'discovery', 'throwback'
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`)
  },
  table => ({
    nameIdx: uniqueIndex('custom_playlists_name_unique').on(table.name)
  })
);

/**
 * Track cache for full library metadata with tiered TTL refresh
 * Enables quality-first playlists beyond recent listening history
 *
 * Design:
 * - Tier 1: Static metadata (90-day TTL) - title, artist, album, duration, year, genres
 * - Tier 2: Dynamic stats (24-hour TTL) - rating, viewCount, skipCount, lastViewedAt
 * - Precomputed quality indicators for fast filtering
 *
 * Storage: ~10-15MB for 95k tracks (50 bytes static + 30 bytes dynamic + indexes)
 * Refresh: Nightly incremental (expired entries), weekly full scan (new/deleted tracks)
 */
export const trackCache = sqliteTable(
  'track_cache',
  {
    // Primary key
    ratingKey: text('rating_key').primaryKey(),

    // ========== TIER 1: Static Metadata (90-day TTL) ==========
    title: text('title').notNull(),
    artistName: text('artist_name').notNull(),
    albumName: text('album_name'),
    duration: integer('duration'), // milliseconds
    year: integer('year'),
    trackIndex: integer('track_index'), // track number on album
    isrc: text('isrc'), // International Standard Recording Code (for accurate external service matching)

    // Relationships for fast joins
    parentRatingKey: text('parent_rating_key'), // album
    grandparentRatingKey: text('grandparent_rating_key'), // artist

    // Embedded metadata (JSON arrays)
    genres: text('genres').notNull().default('[]'), // From Plex Genre tags
    moods: text('moods').notNull().default('[]'), // From Plex Mood tags

    // Static cache tracking
    staticCachedAt: integer('static_cached_at', { mode: 'timestamp_ms' }).notNull(),
    staticExpiresAt: integer('static_expires_at', { mode: 'timestamp_ms' }).notNull(),

    // ========== TIER 2: Dynamic Stats (24-hour TTL) ==========
    userRating: real('user_rating'), // 0-10 scale (Plex star rating)
    viewCount: integer('view_count').default(0), // lifetime play count from Plex
    skipCount: integer('skip_count').default(0), // lifetime skip count
    lastViewedAt: integer('last_viewed_at', { mode: 'timestamp_ms' }), // most recent play

    // Dynamic cache tracking
    statsCachedAt: integer('stats_cached_at', { mode: 'timestamp_ms' }).notNull(),
    statsExpiresAt: integer('stats_expires_at', { mode: 'timestamp_ms' }).notNull(),

    // ========== Computed Quality Indicators ==========
    // Precomputed for fast filtering (updated with stats)
    qualityScore: real('quality_score'), // Precomputed: 0.6*rating + 0.3*playCount + 0.1*recency
    isHighRated: integer('is_high_rated', { mode: 'boolean' }), // rating >= 8
    isUnplayed: integer('is_unplayed', { mode: 'boolean' }), // viewCount === 0
    isUnrated: integer('is_unrated', { mode: 'boolean' }), // userRating === null

    // Last accessed (for usage-based refresh prioritization)
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' })
  },
  table => ({
    // Indexes for common queries (non-unique since multiple tracks can share these values)
    artistIdx: index('track_cache_artist_idx').on(table.artistName),
    albumIdx: index('track_cache_album_idx').on(table.albumName),
    ratingIdx: index('track_cache_rating_idx').on(table.userRating),
    qualityIdx: index('track_cache_quality_idx').on(table.qualityScore),
    lastViewedIdx: index('track_cache_last_viewed_idx').on(table.lastViewedAt),
    highRatedIdx: index('track_cache_high_rated_idx').on(table.isHighRated),
    unplayedIdx: index('track_cache_unplayed_idx').on(table.isUnplayed),
    staticExpiresIdx: index('track_cache_static_expires_idx').on(table.staticExpiresAt),
    statsExpiresIdx: index('track_cache_stats_expires_idx').on(table.statsExpiresAt)
  })
);

/**
 * Listening history cache for incremental Plex history updates
 * Caches full listening history timeline to avoid repeated expensive Plex API calls
 *
 * Design:
 * - First load: Backfill last 90 days from Plex (~10K items, one-time 10-15s cost)
 * - Subsequent loads: Only fetch NEW items since last cache update (<1s incremental)
 * - Analytics queries read from local DB instead of Plex (instant)
 *
 * Storage: ~5-10MB for 10K history items
 * Retention: Configurable (default: keep all for historical trends)
 */
export const listeningHistoryCache = sqliteTable(
  'listening_history_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    // Track identifier
    ratingKey: text('rating_key').notNull(),

    // Playback timestamp (when this track was played)
    viewedAt: integer('viewed_at', { mode: 'timestamp_ms' }).notNull(),

    // User who played it (for multi-user support, optional)
    accountId: integer('account_id'),

    // Denormalized track metadata for fast queries without joins
    title: text('title').notNull(),
    artistName: text('artist_name').notNull(),
    albumName: text('album_name'),

    // Raw Plex metadata (JSON) for full analytics
    // Stores complete Plex history item for future analytics flexibility
    metadata: text('metadata').notNull(),

    // Cache management
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`)
  },
  table => ({
    // Prevent duplicate entries for same track at same timestamp
    uniquePlay: uniqueIndex('listening_history_unique_play').on(table.ratingKey, table.viewedAt),

    // Common query patterns
    viewedAtIdx: index('listening_history_viewed_at_idx').on(table.viewedAt),
    ratingKeyIdx: index('listening_history_rating_key_idx').on(table.ratingKey),
    artistIdx: index('listening_history_artist_idx').on(table.artistName)
  })
);

/**
 * Audio features table for AudioMuse integration
 * Stores analyzed audio features for tracks (tempo, energy, moods, etc.)
 * Mapped from AudioMuse PostgreSQL database to Plex tracks via metadata matching
 */
export const audioFeatures = sqliteTable(
  'audio_features',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ratingKey: text('rating_key').notNull(), // Plex track rating key
    audiomuseItemId: text('audiomuse_item_id'), // AudioMuse track ID (for reference)
    title: text('title').notNull(), // Track title (for verification)
    artist: text('artist').notNull(), // Artist name (for verification)

    // Musical attributes
    tempo: real('tempo'), // BPM
    key: text('key'), // Musical key (C, D, E, F, G, A, B)
    scale: text('scale'), // major or minor
    energy: real('energy'), // 0-1 intensity

    // Mood and feature vectors (stored as JSON)
    moodVector: text('mood_vector'), // JSON map of mood -> confidence
    otherFeatures: text('other_features'), // JSON map of feature -> value

    // Metadata
    matchConfidence: text('match_confidence').default('exact'), // exact, fuzzy, none
    source: text('source').default('audiomuse'),
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`)
  },
  table => ({
    ratingKeyIdx: uniqueIndex('audio_features_rating_key_unique').on(table.ratingKey),
    audiomuseIdIdx: index('audio_features_audiomuse_id_idx').on(table.audiomuseItemId),
    energyIdx: index('audio_features_energy_idx').on(table.energy),
    tempoIdx: index('audio_features_tempo_idx').on(table.tempo),
    artistIdx: index('audio_features_artist_idx').on(table.artist)
  })
);

/**
 * Genre similarity cache for Last.fm-based genre relationships
 * Stores whether two genres are considered similar by Last.fm
 * TTL: 90 days (genre taxonomy changes slowly)
 */
export const genreSimilarity = sqliteTable(
  'genre_similarity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    genre1: text('genre1').notNull(), // Normalized (lowercase)
    genre2: text('genre2').notNull(), // Normalized (lowercase)
    isSimilar: integer('is_similar', { mode: 'boolean' }).notNull(), // true if genre2 is in genre1's similar tags
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
  },
  table => ({
    genrePairIdx: uniqueIndex('genre_similarity_pair_unique').on(table.genre1, table.genre2)
  })
);

/**
 * Adaptive PlayQueue session tracking
 * Single-user deployment: no userId field needed
 * Tracks active Plexamp sessions and their queue associations
 */
export const adaptiveSessions = sqliteTable('adaptive_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  machineIdentifier: text('machine_identifier').notNull().unique(),
  playQueueId: integer('play_queue_id'),
  playlistId: integer('playlist_id'), // Reference to our playlists table
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s','now')*1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s','now')*1000)`),
});

/**
 * Skip event tracking for pattern analysis
 * Records when user skips tracks during playback
 */
export const adaptiveSkipEvents = sqliteTable(
  'adaptive_skip_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => adaptiveSessions.id, { onDelete: 'cascade' }),
    trackRatingKey: text('track_rating_key').notNull(),
    trackTitle: text('track_title').notNull(),
    genres: text('genres'), // JSON array
    artists: text('artists'), // JSON array
    skippedAt: integer('skipped_at', { mode: 'timestamp_ms' }).notNull(),
    listenDurationMs: integer('listen_duration_ms').notNull(),
    completionPercent: real('completion_percent').notNull(),
  },
  (table) => ({
    sessionIdx: index('adaptive_skip_events_session_idx').on(table.sessionId),
    skippedAtIdx: index('adaptive_skip_events_skipped_at_idx').on(table.skippedAt),
  })
);

/**
 * Completion event tracking (successful listens)
 * Records when user completes tracks (90%+ playback)
 */
export const adaptiveCompletionEvents = sqliteTable(
  'adaptive_completion_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => adaptiveSessions.id, { onDelete: 'cascade' }),
    trackRatingKey: text('track_rating_key').notNull(),
    trackTitle: text('track_title').notNull(),
    genres: text('genres'), // JSON array
    artists: text('artists'), // JSON array
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
    listenDurationMs: integer('listen_duration_ms').notNull(),
  },
  (table) => ({
    sessionIdx: index('adaptive_completion_events_session_idx').on(table.sessionId),
    completedAtIdx: index('adaptive_completion_events_completed_at_idx').on(table.completedAt),
  })
);

/**
 * Adaptive actions log for analytics
 * Records when queue adaptations occur and what changes were made
 */
export const adaptiveActions = sqliteTable(
  'adaptive_actions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => adaptiveSessions.id, { onDelete: 'cascade' }),
    playQueueId: integer('play_queue_id').notNull(),
    actionType: text('action_type').notNull(), // 'remove_genre', 'remove_artist', 'refill'
    actionData: text('action_data'), // JSON details
    reason: text('reason'),
    tracksAffected: integer('tracks_affected'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
  },
  (table) => ({
    sessionIdx: index('adaptive_actions_session_idx').on(table.sessionId),
    createdAtIdx: index('adaptive_actions_created_at_idx').on(table.createdAt),
  })
);

/**
 * User patterns cache for learned listening preferences
 * Stores computed patterns from deep playback history analysis
 * Single-user deployment: one row per user (typically just one row total)
 * TTL: 7 days (refresh weekly or when stale)
 */
export const userPatterns = sqliteTable('user_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Computed pattern data (stored as JSON)
  hourlyGenrePreferences: text('hourly_genre_preferences').notNull(), // JSON array of HourlyGenrePreference
  peakHours: text('peak_hours').notNull(), // JSON array of hours (0-23)

  // Analysis metadata
  sessionsAnalyzed: integer('sessions_analyzed').notNull(),
  analyzedFrom: integer('analyzed_from', { mode: 'timestamp_ms' }).notNull(),
  analyzedTo: integer('analyzed_to', { mode: 'timestamp_ms' }).notNull(),

  // Cache tracking
  lastAnalyzed: integer('last_analyzed', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s','now')*1000)`),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull() // TTL: 7 days
});

export type PlaylistRecord = typeof playlists.$inferSelect;
export type PlaylistTrackRecord = typeof playlistTracks.$inferSelect;
export type JobRunRecord = typeof jobRuns.$inferSelect;
export type ArtistCacheRecord = typeof artistCache.$inferSelect;
export type AlbumCacheRecord = typeof albumCache.$inferSelect;
export type SetupStateRecord = typeof setupState.$inferSelect;
export type SettingRecord = typeof settings.$inferSelect;
export type SettingsHistoryRecord = typeof settingsHistory.$inferSelect;
export type CustomPlaylistRecord = typeof customPlaylists.$inferSelect;
export type TrackCacheRecord = typeof trackCache.$inferSelect;
export type ListeningHistoryCacheRecord = typeof listeningHistoryCache.$inferSelect;
export type AudioFeaturesRecord = typeof audioFeatures.$inferSelect;
export type GenreSimilarityRecord = typeof genreSimilarity.$inferSelect;
export type AdaptiveSessionRecord = typeof adaptiveSessions.$inferSelect;
export type AdaptiveSkipEventRecord = typeof adaptiveSkipEvents.$inferSelect;
export type AdaptiveCompletionEventRecord = typeof adaptiveCompletionEvents.$inferSelect;
export type AdaptiveActionRecord = typeof adaptiveActions.$inferSelect;
export type UserPatternsRecord = typeof userPatterns.$inferSelect;

// Legacy aliases for backward compatibility (will be removed in future)
/** @deprecated Use ArtistCacheRecord instead */
export type GenreCacheRecord = ArtistCacheRecord;
/** @deprecated Use AlbumCacheRecord instead */
export type AlbumGenreCacheRecord = AlbumCacheRecord;
