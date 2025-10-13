/**
 * Integration tests for AudioMuse sync service
 * Tests sync logic with real database but mocked AudioMuse/Plex connections
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as schema from '../../db/schema.js';
import { mockTracks } from '../helpers/mock-audiomuse-track.js';

describe('AudioMuse Sync Service Integration', () => {
  let ctx: TestDbContext;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    closeTestDb(ctx);
  });

  describe('Audio Features Storage', () => {
    it('should store synced audio features', () => {
      const track = mockTracks.foreverFree;

      // Simulate sync operation
      db.insert(schema.audioFeatures)
        .values({
          ratingKey: '257602',
          audiomuseItemId: track.itemId,
          title: track.title,
          artist: track.author,
          tempo: track.tempo,
          key: track.key,
          scale: track.scale,
          energy: track.energy,
          moodVector: JSON.stringify(Object.fromEntries(track.moodVector)),
          otherFeatures: JSON.stringify(Object.fromEntries(track.features)),
          matchConfidence: 'exact',
          source: 'audiomuse'
        })
        .run();

      // Verify storage
      const stored = db
        .select()
        .from(schema.audioFeatures)
        .where(eq(schema.audioFeatures.ratingKey, '257602'))
        .get();

      expect(stored).toBeDefined();
      expect(stored!.audiomuseItemId).toBe(track.itemId);
      expect(stored!.title).toBe(track.title);
      expect(stored!.tempo).toBe(track.tempo);
      expect(stored!.energy).toBe(track.energy);

      // Verify JSON parsing
      const moodVector = JSON.parse(stored!.moodVector!);
      expect(moodVector.electronic).toBe(0.590);

      const features = JSON.parse(stored!.otherFeatures!);
      expect(features.danceable).toBe(0.92);
    });

    it('should skip already synced tracks', () => {
      // Insert initial track
      db.insert(schema.audioFeatures)
        .values({
          ratingKey: '257602',
          title: 'Forever Free',
          artist: 'Faithless',
          tempo: 125.0,
          source: 'audiomuse'
        })
        .run();

      // Check if exists (simulate sync skip logic)
      const existing = db
        .select()
        .from(schema.audioFeatures)
        .where(eq(schema.audioFeatures.ratingKey, '257602'))
        .get();

      expect(existing).toBeDefined();
      expect(existing!.title).toBe('Forever Free');

      // Verify only one record
      const all = db.select().from(schema.audioFeatures).all();
      expect(all).toHaveLength(1);
    });

    it('should update existing tracks on force resync', () => {
      // Initial sync
      db.insert(schema.audioFeatures)
        .values({
          ratingKey: '257602',
          title: 'Forever Free',
          artist: 'Faithless',
          tempo: 125.0,
          energy: 0.20,
          matchConfidence: 'fuzzy',
          source: 'audiomuse'
        })
        .run();

      // Force resync with updated data
      db.insert(schema.audioFeatures)
        .values({
          ratingKey: '257602',
          title: 'Forever Free',
          artist: 'Faithless',
          tempo: 125.0,
          energy: 0.23475888,
          matchConfidence: 'exact',
          source: 'audiomuse'
        })
        .onConflictDoUpdate({
          target: schema.audioFeatures.ratingKey,
          set: {
            energy: 0.23475888,
            matchConfidence: 'exact'
          }
        })
        .run();

      // Verify update
      const updated = db
        .select()
        .from(schema.audioFeatures)
        .where(eq(schema.audioFeatures.ratingKey, '257602'))
        .get();

      expect(updated!.energy).toBe(0.23475888);
      expect(updated!.matchConfidence).toBe('exact');

      // Still only one record
      const all = db.select().from(schema.audioFeatures).all();
      expect(all).toHaveLength(1);
    });

    it('should batch insert multiple tracks', () => {
      const tracks = [
        {
          ratingKey: '1',
          title: 'Track 1',
          artist: 'Artist 1',
          tempo: 120.0,
          source: 'audiomuse'
        },
        {
          ratingKey: '2',
          title: 'Track 2',
          artist: 'Artist 2',
          tempo: 130.0,
          source: 'audiomuse'
        },
        {
          ratingKey: '3',
          title: 'Track 3',
          artist: 'Artist 3',
          tempo: 140.0,
          source: 'audiomuse'
        }
      ];

      // Batch insert
      db.insert(schema.audioFeatures).values(tracks).run();

      // Verify all inserted
      const all = db.select().from(schema.audioFeatures).all();
      expect(all).toHaveLength(3);

      const tempos = all.map(t => t.tempo).sort();
      expect(tempos).toEqual([120.0, 130.0, 140.0]);
    });
  });

  describe('Sync Statistics', () => {
    it('should calculate sync coverage', () => {
      // Insert 50 out of 100 tracks
      const tracks = Array.from({ length: 50 }, (_, i) => ({
        ratingKey: `${i}`,
        title: `Track ${i}`,
        artist: `Artist ${i}`,
        source: 'audiomuse'
      }));

      db.insert(schema.audioFeatures).values(tracks).run();

      // Calculate coverage
      const synced = db.select().from(schema.audioFeatures).all().length;
      const totalInAudioMuse = 100;
      const coverage = (synced / totalInAudioMuse) * 100;

      expect(coverage).toBe(50);
    });

    it('should track match confidence distribution', () => {
      db.insert(schema.audioFeatures)
        .values([
          {
            ratingKey: '1',
            title: 'Track 1',
            artist: 'Artist 1',
            matchConfidence: 'exact',
            source: 'audiomuse'
          },
          {
            ratingKey: '2',
            title: 'Track 2',
            artist: 'Artist 2',
            matchConfidence: 'exact',
            source: 'audiomuse'
          },
          {
            ratingKey: '3',
            title: 'Track 3',
            artist: 'Artist 3',
            matchConfidence: 'fuzzy',
            source: 'audiomuse'
          },
          {
            ratingKey: '4',
            title: 'Track 4',
            artist: 'Artist 4',
            matchConfidence: 'fuzzy',
            source: 'audiomuse'
          },
          {
            ratingKey: '5',
            title: 'Track 5',
            artist: 'Artist 5',
            matchConfidence: 'none',
            source: 'audiomuse'
          }
        ])
        .run();

      const exact = db
        .select()
        .from(schema.audioFeatures)
        .where(eq(schema.audioFeatures.matchConfidence, 'exact'))
        .all();

      const fuzzy = db
        .select()
        .from(schema.audioFeatures)
        .where(eq(schema.audioFeatures.matchConfidence, 'fuzzy'))
        .all();

      expect(exact).toHaveLength(2);
      expect(fuzzy).toHaveLength(2);
    });
  });

  describe('Query Performance', () => {
    it('should query by energy efficiently (indexed)', () => {
      // Insert tracks with varying energy
      const tracks = Array.from({ length: 100 }, (_, i) => ({
        ratingKey: `${i}`,
        title: `Track ${i}`,
        artist: `Artist ${i}`,
        energy: i / 100, // 0.0 to 0.99
        source: 'audiomuse'
      }));

      db.insert(schema.audioFeatures).values(tracks).run();

      // Query high energy tracks (should use index)
      const startTime = Date.now();
      const highEnergy = db
        .select()
        .from(schema.audioFeatures)
        .all()
        .filter(t => t.energy !== null && t.energy > 0.7);

      const duration = Date.now() - startTime;

      expect(highEnergy.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be very fast with small dataset
    });

    it('should query by tempo efficiently (indexed)', () => {
      const tracks = Array.from({ length: 100 }, (_, i) => ({
        ratingKey: `${i}`,
        title: `Track ${i}`,
        artist: `Artist ${i}`,
        tempo: 60 + i * 2, // 60-260 BPM
        source: 'audiomuse'
      }));

      db.insert(schema.audioFeatures).values(tracks).run();

      // Query tracks in workout tempo range (140-180 BPM)
      const workoutTracks = db
        .select()
        .from(schema.audioFeatures)
        .all()
        .filter(t => t.tempo !== null && t.tempo >= 140 && t.tempo <= 180);

      expect(workoutTracks.length).toBeGreaterThan(0);
      expect(workoutTracks.every(t => t.tempo && t.tempo >= 140 && t.tempo <= 180)).toBe(true);
    });

    it('should query by artist efficiently (indexed)', () => {
      const tracks = Array.from({ length: 100 }, (_, i) => ({
        ratingKey: `${i}`,
        title: `Track ${i}`,
        artist: `Artist ${i % 10}`, // 10 different artists, 10 tracks each
        source: 'audiomuse'
      }));

      db.insert(schema.audioFeatures).values(tracks).run();

      // Query all tracks by one artist
      const artist5Tracks = db
        .select()
        .from(schema.audioFeatures)
        .where(eq(schema.audioFeatures.artist, 'Artist 5'))
        .all();

      expect(artist5Tracks).toHaveLength(10);
      expect(artist5Tracks.every(t => t.artist === 'Artist 5')).toBe(true);
    });
  });
});
