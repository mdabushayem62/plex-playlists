/**
 * Integration tests for audio_features table
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as schema from '../../db/schema.js';

describe('Audio Features Integration', () => {
  let ctx: TestDbContext;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    closeTestDb(ctx);
  });

  it('should insert audio features for a track', () => {
    const features = {
      ratingKey: '257602',
      audiomuseItemId: 'VBK2uTG5kmx1i4XOca6okK',
      title: 'Forever Free',
      artist: 'Faithless',
      tempo: 125.0,
      key: 'E',
      scale: 'minor',
      energy: 0.23475888,
      moodVector: JSON.stringify({
        electronic: 0.590,
        ambient: 0.536,
        rock: 0.531
      }),
      otherFeatures: JSON.stringify({
        danceable: 0.92,
        aggressive: 0.36,
        happy: 0.30
      }),
      matchConfidence: 'exact',
      source: 'audiomuse'
    };

    db.insert(schema.audioFeatures).values(features).run();

    // Retrieve and verify
    const stored = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.ratingKey, '257602'))
      .get();

    expect(stored).toBeDefined();
    expect(stored!.ratingKey).toBe('257602');
    expect(stored!.title).toBe('Forever Free');
    expect(stored!.artist).toBe('Faithless');
    expect(stored!.tempo).toBe(125.0);
    expect(stored!.key).toBe('E');
    expect(stored!.scale).toBe('minor');
    expect(stored!.energy).toBe(0.23475888);
    expect(stored!.matchConfidence).toBe('exact');
    expect(stored!.source).toBe('audiomuse');
  });

  it('should enforce unique ratingKey constraint', () => {
    const features1 = {
      ratingKey: '257602',
      audiomuseItemId: 'item1',
      title: 'Track 1',
      artist: 'Artist 1',
      source: 'audiomuse'
    };

    const features2 = {
      ratingKey: '257602', // Same rating key
      audiomuseItemId: 'item2',
      title: 'Track 2',
      artist: 'Artist 2',
      source: 'audiomuse'
    };

    // First insert should succeed
    db.insert(schema.audioFeatures).values(features1).run();

    // Second insert with same ratingKey should fail
    expect(() => {
      db.insert(schema.audioFeatures).values(features2).run();
    }).toThrow();
  });

  it('should support upsert on ratingKey conflict', () => {
    const initial = {
      ratingKey: '257602',
      audiomuseItemId: 'VBK2uTG5kmx1i4XOca6okK',
      title: 'Forever Free',
      artist: 'Faithless',
      tempo: 125.0,
      energy: 0.23,
      matchConfidence: 'fuzzy',
      source: 'audiomuse'
    };

    const updated = {
      ratingKey: '257602',
      audiomuseItemId: 'VBK2uTG5kmx1i4XOca6okK',
      title: 'Forever Free (Updated)',
      artist: 'Faithless',
      tempo: 126.0,
      energy: 0.24,
      matchConfidence: 'exact',
      source: 'audiomuse'
    };

    // Initial insert
    db.insert(schema.audioFeatures).values(initial).run();

    // Upsert with updated data
    db.insert(schema.audioFeatures)
      .values(updated)
      .onConflictDoUpdate({
        target: schema.audioFeatures.ratingKey,
        set: {
          title: updated.title,
          tempo: updated.tempo,
          energy: updated.energy,
          matchConfidence: updated.matchConfidence
        }
      })
      .run();

    // Verify update
    const stored = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.ratingKey, '257602'))
      .get();

    expect(stored!.title).toBe('Forever Free (Updated)');
    expect(stored!.tempo).toBe(126.0);
    expect(stored!.energy).toBe(0.24);
    expect(stored!.matchConfidence).toBe('exact');

    // Verify only one row exists
    const all = db.select().from(schema.audioFeatures).all();
    expect(all).toHaveLength(1);
  });

  it('should handle null optional fields', () => {
    const features = {
      ratingKey: '257602',
      audiomuseItemId: null,
      title: 'Unknown Track',
      artist: 'Unknown Artist',
      tempo: null,
      key: null,
      scale: null,
      energy: null,
      moodVector: null,
      otherFeatures: null,
      matchConfidence: 'none',
      source: 'audiomuse'
    };

    db.insert(schema.audioFeatures).values(features).run();

    const stored = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.ratingKey, '257602'))
      .get();

    expect(stored).toBeDefined();
    expect(stored!.tempo).toBeNull();
    expect(stored!.key).toBeNull();
    expect(stored!.scale).toBeNull();
    expect(stored!.energy).toBeNull();
    expect(stored!.moodVector).toBeNull();
    expect(stored!.otherFeatures).toBeNull();
  });

  it('should query by energy range', () => {
    db.insert(schema.audioFeatures)
      .values([
        {
          ratingKey: '1',
          title: 'Low Energy',
          artist: 'Artist 1',
          energy: 0.1,
          source: 'audiomuse'
        },
        {
          ratingKey: '2',
          title: 'Medium Energy',
          artist: 'Artist 2',
          energy: 0.5,
          source: 'audiomuse'
        },
        {
          ratingKey: '3',
          title: 'High Energy',
          artist: 'Artist 3',
          energy: 0.9,
          source: 'audiomuse'
        }
      ])
      .run();

    // Query high energy tracks (> 0.7)
    const highEnergy = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.energy, 0.9))
      .all();

    expect(highEnergy).toHaveLength(1);
    expect(highEnergy[0]?.title).toBe('High Energy');
  });

  it('should query by tempo range', () => {
    db.insert(schema.audioFeatures)
      .values([
        {
          ratingKey: '1',
          title: 'Slow',
          artist: 'Artist 1',
          tempo: 60.0,
          source: 'audiomuse'
        },
        {
          ratingKey: '2',
          title: 'Medium',
          artist: 'Artist 2',
          tempo: 120.0,
          source: 'audiomuse'
        },
        {
          ratingKey: '3',
          title: 'Fast',
          artist: 'Artist 3',
          tempo: 180.0,
          source: 'audiomuse'
        }
      ])
      .run();

    // Count tracks with tempo >= 100
    const fastTracks = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.tempo, 180.0))
      .all();

    expect(fastTracks).toHaveLength(1);
    expect(fastTracks[0]?.title).toBe('Fast');
  });

  it('should query by artist name', () => {
    db.insert(schema.audioFeatures)
      .values([
        {
          ratingKey: '1',
          title: 'Track 1',
          artist: 'Perturbator',
          source: 'audiomuse'
        },
        {
          ratingKey: '2',
          title: 'Track 2',
          artist: 'Perturbator',
          source: 'audiomuse'
        },
        {
          ratingKey: '3',
          title: 'Track 3',
          artist: 'Carpenter Brut',
          source: 'audiomuse'
        }
      ])
      .run();

    const perturbatorTracks = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.artist, 'Perturbator'))
      .all();

    expect(perturbatorTracks).toHaveLength(2);
    expect(perturbatorTracks.every(t => t.artist === 'Perturbator')).toBe(true);
  });

  it('should store and retrieve mood vectors as JSON', () => {
    const moodVector = {
      electronic: 0.590,
      ambient: 0.536,
      rock: 0.531,
      indie: 0.522,
      experimental: 0.520
    };

    db.insert(schema.audioFeatures)
      .values({
        ratingKey: '257602',
        title: 'Forever Free',
        artist: 'Faithless',
        moodVector: JSON.stringify(moodVector),
        source: 'audiomuse'
      })
      .run();

    const stored = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.ratingKey, '257602'))
      .get();

    expect(stored!.moodVector).toBeDefined();
    const parsed = JSON.parse(stored!.moodVector!);
    expect(parsed).toEqual(moodVector);
    expect(parsed.electronic).toBe(0.590);
    expect(parsed.ambient).toBe(0.536);
  });

  it('should store and retrieve other features as JSON', () => {
    const otherFeatures = {
      danceable: 0.92,
      aggressive: 0.36,
      happy: 0.30,
      party: 0.17,
      relaxed: 0.33,
      sad: 0.12
    };

    db.insert(schema.audioFeatures)
      .values({
        ratingKey: '257602',
        title: 'Forever Free',
        artist: 'Faithless',
        otherFeatures: JSON.stringify(otherFeatures),
        source: 'audiomuse'
      })
      .run();

    const stored = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.ratingKey, '257602'))
      .get();

    expect(stored!.otherFeatures).toBeDefined();
    const parsed = JSON.parse(stored!.otherFeatures!);
    expect(parsed).toEqual(otherFeatures);
    expect(parsed.danceable).toBe(0.92);
    expect(parsed.happy).toBe(0.30);
  });

  it('should track match confidence levels', () => {
    db.insert(schema.audioFeatures)
      .values([
        {
          ratingKey: '1',
          title: 'Exact Match',
          artist: 'Artist 1',
          matchConfidence: 'exact',
          source: 'audiomuse'
        },
        {
          ratingKey: '2',
          title: 'Fuzzy Match',
          artist: 'Artist 2',
          matchConfidence: 'fuzzy',
          source: 'audiomuse'
        },
        {
          ratingKey: '3',
          title: 'No Match',
          artist: 'Artist 3',
          matchConfidence: 'none',
          source: 'audiomuse'
        }
      ])
      .run();

    const exactMatches = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.matchConfidence, 'exact'))
      .all();

    const fuzzyMatches = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.matchConfidence, 'fuzzy'))
      .all();

    expect(exactMatches).toHaveLength(1);
    expect(fuzzyMatches).toHaveLength(1);
  });

  it('should have cachedAt timestamp on insert', () => {
    const beforeInsert = Date.now() - 1000; // 1 second buffer for timing

    db.insert(schema.audioFeatures)
      .values({
        ratingKey: '257602',
        title: 'Forever Free',
        artist: 'Faithless',
        source: 'audiomuse'
      })
      .run();

    const afterInsert = Date.now() + 1000; // 1 second buffer for timing

    const stored = db
      .select()
      .from(schema.audioFeatures)
      .where(eq(schema.audioFeatures.ratingKey, '257602'))
      .get();

    expect(stored!.cachedAt).toBeDefined();
    const cachedAtMs = new Date(stored!.cachedAt).getTime();
    expect(cachedAtMs).toBeGreaterThanOrEqual(beforeInsert);
    expect(cachedAtMs).toBeLessThanOrEqual(afterInsert);
  });
});
