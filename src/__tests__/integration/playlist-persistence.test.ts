/**
 * Integration tests for playlist persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as schema from '../../db/schema.js';
import type { CandidateTrack } from '../../playlist/candidate-builder.js';

describe('Playlist Persistence Integration', () => {
  let ctx: TestDbContext;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    closeTestDb(ctx);
  });

  it('should save new playlist with tracks', () => {
    const tracks: Array<CandidateTrack & { position: number }> = [
      {
        ratingKey: 'track1',
        title: 'Test Track 1',
        artist: 'Test Artist 1',
        album: 'Test Album 1',
        recencyWeight: 0.8,
        fallbackScore: 0.5,
        finalScore: 0.7,
        position: 0
      } as unknown as CandidateTrack & { position: number },
      {
        ratingKey: 'track2',
        title: 'Test Track 2',
        artist: 'Test Artist 2',
        album: 'Test Album 2',
        recencyWeight: 0.6,
        fallbackScore: 0.4,
        finalScore: 0.5,
        position: 1
      } as unknown as CandidateTrack & { position: number }
    ];

    // Save playlist using transaction
    db.transaction(tx => {
      const inserted = tx
        .insert(schema.playlists)
        .values({
          window: 'morning',
          title: 'Morning Mix',
          description: 'Test morning playlist',
          plexRatingKey: 'plex123',
          generatedAt: new Date(),
          trackCount: tracks.length
        })
        .returning({ id: schema.playlists.id })
        .get();

      const playlistId = inserted!.id;

      tx.insert(schema.playlistTracks)
        .values(
          tracks.map(track => ({
            playlistId,
            plexRatingKey: track.ratingKey,
            title: track.title,
            artist: track.artist,
            album: track.album,
            position: track.position,
            score: track.finalScore
          }))
        )
        .run();
    });

    // Verify playlist exists
    const savedPlaylists = db.select().from(schema.playlists).all();
    expect(savedPlaylists).toHaveLength(1);
    expect(savedPlaylists[0]?.window).toBe('morning');
    expect(savedPlaylists[0]?.trackCount).toBe(2);

    // Verify tracks exist
    const savedTracks = db.select().from(schema.playlistTracks).all();
    expect(savedTracks).toHaveLength(2);
    expect(savedTracks[0]?.title).toBe('Test Track 1');
    expect(savedTracks[1]?.title).toBe('Test Track 2');
  });

  it('should update existing playlist and replace tracks', () => {
    // Insert initial playlist
    const firstInsert = db
      .insert(schema.playlists)
      .values({
        window: 'afternoon',
        title: 'Afternoon Mix',
        plexRatingKey: 'plex456',
        generatedAt: new Date(),
        trackCount: 1
      })
      .returning({ id: schema.playlists.id })
      .get();

    const playlistId = firstInsert!.id;

    db.insert(schema.playlistTracks)
      .values({
        playlistId,
        plexRatingKey: 'oldtrack1',
        title: 'Old Track',
        position: 0
      })
      .run();

    // Update playlist with new data
    db.transaction(tx => {
      const existing = tx
        .select()
        .from(schema.playlists)
        .where(eq(schema.playlists.window, 'afternoon'))
        .get();

      tx.update(schema.playlists)
        .set({
          title: 'Updated Afternoon Mix',
          trackCount: 2,
          generatedAt: new Date()
        })
        .where(eq(schema.playlists.id, existing!.id))
        .run();

      // Delete old tracks
      tx.delete(schema.playlistTracks)
        .where(eq(schema.playlistTracks.playlistId, existing!.id))
        .run();

      // Insert new tracks
      tx.insert(schema.playlistTracks)
        .values([
          {
            playlistId: existing!.id,
            plexRatingKey: 'newtrack1',
            title: 'New Track 1',
            position: 0
          },
          {
            playlistId: existing!.id,
            plexRatingKey: 'newtrack2',
            title: 'New Track 2',
            position: 1
          }
        ])
        .run();
    });

    // Verify update
    const updatedPlaylists = db.select().from(schema.playlists).all();
    expect(updatedPlaylists).toHaveLength(1);
    expect(updatedPlaylists[0]?.title).toBe('Updated Afternoon Mix');
    expect(updatedPlaylists[0]?.trackCount).toBe(2);

    // Verify new tracks
    const updatedTracks = db.select().from(schema.playlistTracks).all();
    expect(updatedTracks).toHaveLength(2);
    expect(updatedTracks.map(t => t.title)).toEqual(['New Track 1', 'New Track 2']);
  });

  it('should enforce unique window constraint', () => {
    db.insert(schema.playlists)
      .values({
        window: 'evening',
        title: 'Evening Mix 1',
        plexRatingKey: 'plex789',
        generatedAt: new Date(),
        trackCount: 0
      })
      .run();

    // Attempt to insert duplicate window
    expect(() => {
      db.insert(schema.playlists)
        .values({
          window: 'evening',
          title: 'Evening Mix 2',
          plexRatingKey: 'plex999',
          generatedAt: new Date(),
          trackCount: 0
        })
        .run();
    }).toThrow();
  });

  it('should retrieve playlist with all tracks in correct order', () => {
    // Insert playlist with multiple tracks
    const insertResult = db
      .insert(schema.playlists)
      .values({
        window: 'test',
        title: 'Test Playlist',
        plexRatingKey: 'plextest',
        generatedAt: new Date(),
        trackCount: 3
      })
      .returning({ id: schema.playlists.id })
      .get();

    const playlistId = insertResult!.id;

    // Insert tracks out of order
    db.insert(schema.playlistTracks)
      .values([
        { playlistId, plexRatingKey: 't3', title: 'Track 3', position: 2, score: 0.3 },
        { playlistId, plexRatingKey: 't1', title: 'Track 1', position: 0, score: 0.9 },
        { playlistId, plexRatingKey: 't2', title: 'Track 2', position: 1, score: 0.6 }
      ])
      .run();

    // Retrieve tracks ordered by position
    const tracks = db
      .select()
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(schema.playlistTracks.position)
      .all();

    expect(tracks).toHaveLength(3);
    expect(tracks[0]?.title).toBe('Track 1');
    expect(tracks[1]?.title).toBe('Track 2');
    expect(tracks[2]?.title).toBe('Track 3');
    expect(tracks[0]?.score).toBe(0.9);
  });
});
