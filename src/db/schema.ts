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
  position: integer('position').notNull(),
  score: real('score')
});

export const jobRuns = sqliteTable('job_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  window: text('window').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  status: text('status').notNull(),
  error: text('error')
});

export const genreCache = sqliteTable(
  'genre_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    artistName: text('artist_name').notNull(),
    genres: text('genres').notNull(), // JSON array of genre strings
    source: text('source').notNull(), // 'navidrome', 'embedded', or 'manual'
    cachedAt: integer('cached_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }) // Optional TTL for cache invalidation
  },
  table => ({
    artistNameIdx: uniqueIndex('genre_cache_artist_unique').on(table.artistName)
  })
);

export type PlaylistRecord = typeof playlists.$inferSelect;
export type PlaylistTrackRecord = typeof playlistTracks.$inferSelect;
export type JobRunRecord = typeof jobRuns.$inferSelect;
export type GenreCacheRecord = typeof genreCache.$inferSelect;
