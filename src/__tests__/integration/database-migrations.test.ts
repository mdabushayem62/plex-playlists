/**
 * Integration tests for database migrations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';

describe('Database Migrations Integration', () => {
  let ctx: TestDbContext;
  let sqlite: Database.Database;

  beforeEach(() => {
    ctx = createTestDb();
    sqlite = ctx.sqlite;
  });

  afterEach(() => {
    closeTestDb(ctx);
  });

  it('should create all required tables', () => {
    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'`
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name).sort();

    expect(tableNames).toEqual([
      'album_cache',
      'artist_cache',
      'audio_features',
      'custom_playlists',
      'job_runs',
      'playlist_tracks',
      'playlists',
      'settings',
      'settings_history',
      'setup_state',
      'track_cache'
    ]);
  });

  it('should create unique index on playlists.window', () => {
    const indexes = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='playlists'`)
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('playlists_window_unique');
  });

  it('should create unique index on artist_cache.artist_name', () => {
    const indexes = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='artist_cache'`)
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('artist_cache_artist_unique');
  });

  it('should enforce cascade delete on playlist_tracks', async () => {
    // Insert a playlist
    const playlistResult = sqlite
      .prepare(
        `INSERT INTO playlists (window, title, generated_at, track_count) VALUES (?, ?, ?, ?) RETURNING id`
      )
      .get('morning', 'Morning Mix', Date.now(), 2) as { id: number };

    const playlistId = playlistResult.id;

    // Insert tracks
    sqlite.prepare(
      `INSERT INTO playlist_tracks (playlist_id, plex_rating_key, title, position) VALUES (?, ?, ?, ?)`
    ).run(playlistId, 'track1', 'Track 1', 0);

    sqlite.prepare(
      `INSERT INTO playlist_tracks (playlist_id, plex_rating_key, title, position) VALUES (?, ?, ?, ?)`
    ).run(playlistId, 'track2', 'Track 2', 1);

    // Verify tracks exist
    const tracksBeforeDelete = sqlite
      .prepare(`SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?`)
      .get(playlistId) as { count: number };

    expect(tracksBeforeDelete.count).toBe(2);

    // Delete playlist
    sqlite.prepare(`DELETE FROM playlists WHERE id = ?`).run(playlistId);

    // Verify tracks were cascade deleted
    const tracksAfterDelete = sqlite
      .prepare(`SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?`)
      .get(playlistId) as { count: number };

    expect(tracksAfterDelete.count).toBe(0);
  });

  it('should not have history_cache table (removed in migration 0002)', () => {
    const tables = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='history_cache'`)
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(0);
  });
});
