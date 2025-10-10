import { integer, real, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  fallbackScore: real('fallback_score')
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

export const genreCache = sqliteTable(
  'genre_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    artistName: text('artist_name').notNull(),
    genres: text('genres').notNull(), // JSON array of genre/style strings (Genre + Style from Plex)
    moods: text('moods').notNull().default('[]'), // JSON array of mood strings (Mood from Plex)
    source: text('source').notNull(), // 'spotify', 'lastfm', 'plex', 'embedded', or 'manual'
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }) // Optional TTL for cache invalidation
  },
  table => ({
    artistNameIdx: uniqueIndex('genre_cache_artist_unique').on(table.artistName)
  })
);

export const albumGenreCache = sqliteTable(
  'album_genre_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    artistName: text('artist_name').notNull(),
    albumName: text('album_name').notNull(),
    genres: text('genres').notNull(), // JSON array of genre/style strings (Genre + Style from Plex)
    moods: text('moods').notNull().default('[]'), // JSON array of mood strings (Mood from Plex)
    source: text('source').notNull(), // 'spotify', 'lastfm', 'plex', 'embedded', or 'manual'
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }) // Optional TTL for cache invalidation
  },
  table => ({
    albumIdx: uniqueIndex('album_genre_cache_album_unique').on(table.artistName, table.albumName)
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
    keyIdx: uniqueIndex('settings_history_key_idx').on(table.settingKey),
    changedAtIdx: uniqueIndex('settings_history_changed_at_idx').on(table.changedAt)
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

export type PlaylistRecord = typeof playlists.$inferSelect;
export type PlaylistTrackRecord = typeof playlistTracks.$inferSelect;
export type JobRunRecord = typeof jobRuns.$inferSelect;
export type GenreCacheRecord = typeof genreCache.$inferSelect;
export type AlbumGenreCacheRecord = typeof albumGenreCache.$inferSelect;
export type SetupStateRecord = typeof setupState.$inferSelect;
export type SettingRecord = typeof settings.$inferSelect;
export type SettingsHistoryRecord = typeof settingsHistory.$inferSelect;
export type CustomPlaylistRecord = typeof customPlaylists.$inferSelect;
