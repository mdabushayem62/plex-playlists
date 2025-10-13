/**
 * Integration tests for genre cache with expiry
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, lt } from 'drizzle-orm';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as schema from '../../db/schema.js';

describe('Genre Cache Integration', () => {
  let ctx: TestDbContext;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    closeTestDb(ctx);
  });

  it('should cache genres for an artist', () => {
    const artistName = 'perturbator';
    const genres = ['synthwave', 'darksynth'];

    db.insert(schema.artistCache)
      .values({
        artistName,
        genres: JSON.stringify(genres),
        source: 'spotify',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
      })
      .run();

    // Retrieve cached genres
    const cached = db
      .select()
      .from(schema.artistCache)
      .where(eq(schema.artistCache.artistName, artistName))
      .get();

    expect(cached).toBeDefined();
    expect(JSON.parse(cached!.genres)).toEqual(genres);
    expect(cached!.source).toBe('spotify');
  });

  it('should handle upsert (conflict on artist_name)', () => {
    const artistName = 'carpenter brut';

    // First insert
    db.insert(schema.artistCache)
      .values({
        artistName,
        genres: JSON.stringify(['synthwave']),
        source: 'manual',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      })
      .run();

    // Upsert with new data
    db.insert(schema.artistCache)
      .values({
        artistName,
        genres: JSON.stringify(['synthwave', 'darksynth']),
        source: 'spotify',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      })
      .onConflictDoUpdate({
        target: schema.artistCache.artistName,
        set: {
          genres: JSON.stringify(['synthwave', 'darksynth']),
          source: 'spotify',
          cachedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      })
      .run();

    // Verify only one entry exists with updated data
    const cached = db.select().from(schema.artistCache).all();
    expect(cached).toHaveLength(1);
    expect(JSON.parse(cached[0]!.genres)).toEqual(['synthwave', 'darksynth']);
    expect(cached[0]!.source).toBe('spotify');
  });

  it('should identify expired cache entries', () => {
    const now = Date.now();

    // Insert expired entry
    db.insert(schema.artistCache)
      .values({
        artistName: 'expired artist',
        genres: JSON.stringify(['test']),
        source: 'manual',
        expiresAt: new Date(now - 1000) // Expired 1 second ago
      })
      .run();

    // Insert valid entry
    db.insert(schema.artistCache)
      .values({
        artistName: 'valid artist',
        genres: JSON.stringify(['test']),
        source: 'spotify',
        expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000)
      })
      .run();

    // Query expired entries
    const expired = db
      .select()
      .from(schema.artistCache)
      .where(lt(schema.artistCache.expiresAt, new Date()))
      .all();

    expect(expired).toHaveLength(1);
    expect(expired[0]?.artistName).toBe('expired artist');
  });

  it('should delete expired cache entries', () => {
    const now = Date.now();

    // Insert multiple expired entries
    db.insert(schema.artistCache)
      .values([
        {
          artistName: 'expired1',
          genres: JSON.stringify(['test']),
          source: 'manual',
          expiresAt: new Date(now - 1000)
        },
        {
          artistName: 'expired2',
          genres: JSON.stringify(['test']),
          source: 'lastfm',
          expiresAt: new Date(now - 2000)
        },
        {
          artistName: 'valid',
          genres: JSON.stringify(['test']),
          source: 'spotify',
          expiresAt: new Date(now + 90 * 24 * 60 * 60 * 1000)
        }
      ])
      .run();

    // Delete expired entries
    const result = db
      .delete(schema.artistCache)
      .where(lt(schema.artistCache.expiresAt, new Date()))
      .returning()
      .all();

    expect(result).toHaveLength(2);

    // Verify only valid entry remains
    const remaining = db.select().from(schema.artistCache).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.artistName).toBe('valid');
  });

  it('should support multiple sources for different artists', () => {
    db.insert(schema.artistCache)
      .values([
        {
          artistName: 'artist1',
          genres: JSON.stringify(['rock']),
          source: 'spotify',
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        },
        {
          artistName: 'artist2',
          genres: JSON.stringify(['jazz']),
          source: 'lastfm',
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        },
        {
          artistName: 'artist3',
          genres: JSON.stringify(['metal']),
          source: 'manual',
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      ])
      .run();

    // Query by source
    const spotifyEntries = db
      .select()
      .from(schema.artistCache)
      .where(eq(schema.artistCache.source, 'spotify'))
      .all();

    expect(spotifyEntries).toHaveLength(1);
    expect(spotifyEntries[0]?.artistName).toBe('artist1');

    // Verify all sources
    const allEntries = db.select().from(schema.artistCache).all();
    const sources = allEntries.map(e => e.source).sort();
    expect(sources).toEqual(['lastfm', 'manual', 'spotify']);
  });

  it('should handle artist name case sensitivity correctly', () => {
    // Cache uses lowercase artist names
    const lowerArtist = 'the midnight';
    const upperArtist = 'THE MIDNIGHT';

    db.insert(schema.artistCache)
      .values({
        artistName: lowerArtist,
        genres: JSON.stringify(['synthwave']),
        source: 'spotify',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      })
      .run();

    // Query with lowercase
    const lowerResult = db
      .select()
      .from(schema.artistCache)
      .where(eq(schema.artistCache.artistName, lowerArtist))
      .get();

    expect(lowerResult).toBeDefined();

    // Query with uppercase should not match (case-sensitive)
    const upperResult = db
      .select()
      .from(schema.artistCache)
      .where(eq(schema.artistCache.artistName, upperArtist))
      .get();

    expect(upperResult).toBeUndefined();

    // Application code should normalize to lowercase before querying
    const normalized = upperArtist.toLowerCase();
    const normalizedResult = db
      .select()
      .from(schema.artistCache)
      .where(eq(schema.artistCache.artistName, normalized))
      .get();

    expect(normalizedResult).toBeDefined();
  });
});
