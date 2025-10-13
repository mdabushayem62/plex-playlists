/**
 * Integration tests for track cache service
 * Tests tiered TTL refresh, query filters, and cache health
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import {
  createMockTrack,
  createMockTracks,
  createHighRatedTrack,
  createUnplayedTrack
} from '../helpers/mock-track.js';
import * as schema from '../../db/schema.js';
import type { Track } from '@ctrl/plex';

// Mock getDb to return test database
vi.mock('../../db/index.js', () => ({
  getDb: vi.fn()
}));

import { getDb } from '../../db/index.js';
import {
  trackToCacheRecord,
  upsertTrack,
  batchUpsertTracks,
  updateTrackStats,
  getTrackFromCache,
  getTracksFromCache,
  findTracksWithExpiredStats,
  findTracksWithExpiredStatic,
  getCacheHealth,
  clearCache,
  touchTracks,
  queryTracks
} from '../../cache/track-cache-service.js';

describe('Track Cache Integration', () => {
  let ctx: TestDbContext;
  let db: TestDbContext['db'];

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;

    // Mock getDb to return our test database
    vi.mocked(getDb).mockReturnValue(db as any);
  });

  afterEach(() => {
    closeTestDb(ctx);
    vi.clearAllMocks();
  });

  describe('trackToCacheRecord', () => {
    it('should convert Track to cache record with all fields', async () => {
      const track = createMockTrack({
        ratingKey: '123',
        title: 'Neon Dreams',
        artistName: 'Synthwave Artist',
        albumName: 'Electric Nights',
        duration: 240000,
        year: 2021,
        userRating: 8,
        viewCount: 15,
        skipCount: 2,
        lastViewedAt: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago
        genres: [{ tag: 'Synthwave' }, { tag: 'Electronic' }],
        moods: [{ tag: 'Energetic' }, { tag: 'Uplifting' }]
      });

      const record = await trackToCacheRecord(track as Track);

      expect(record.ratingKey).toBe('123');
      expect(record.title).toBe('Neon Dreams');
      expect(record.artistName).toBe('Synthwave Artist');
      expect(record.albumName).toBe('Electric Nights');
      expect(record.duration).toBe(240000);
      expect(record.year).toBe(2021);
      expect(record.userRating).toBe(8);
      expect(record.viewCount).toBe(15);
      expect(record.skipCount).toBe(2);
      expect(record.lastViewedAt).toBeDefined();
      expect(JSON.parse(record.genres)).toEqual(['Synthwave', 'Electronic']);
      expect(JSON.parse(record.moods)).toEqual(['Energetic', 'Uplifting']);
    });

    it('should compute quality indicators correctly', async () => {
      const highRatedTrack = createHighRatedTrack({ userRating: 10, viewCount: 20 });
      const record = await trackToCacheRecord(highRatedTrack as Track);

      expect(record.isHighRated).toBe(true);
      expect(record.isUnplayed).toBe(false);
      expect(record.isUnrated).toBe(false);
      expect(record.qualityScore).toBeGreaterThan(0);
    });

    it('should handle unrated tracks', async () => {
      const unratedTrack = createMockTrack({ userRating: null, viewCount: 5 });
      const record = await trackToCacheRecord(unratedTrack as Track);

      expect(record.isUnrated).toBe(true);
      expect(record.isHighRated).toBe(false);
      expect(record.qualityScore).toBeGreaterThan(0); // Has play count
    });

    it('should handle unplayed tracks', async () => {
      const unplayedTrack = createUnplayedTrack({ userRating: 7 });
      const record = await trackToCacheRecord(unplayedTrack as Track);

      expect(record.isUnplayed).toBe(true);
      expect(record.viewCount).toBe(0);
      expect(record.lastViewedAt).toBeNull();
    });

    it('should set TTL timestamps correctly', async () => {
      const track = createMockTrack();
      const before = Date.now();
      const record = await trackToCacheRecord(track as Track);
      const after = Date.now();

      // Static TTL: 90 days
      const expectedStaticExpiry = before + (90 * 24 * 60 * 60 * 1000);
      expect((record.staticCachedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect((record.staticCachedAt as Date).getTime()).toBeLessThanOrEqual(after);
      expect((record.staticExpiresAt as Date).getTime()).toBeGreaterThanOrEqual(expectedStaticExpiry);

      // Stats TTL: 24 hours
      const expectedStatsExpiry = before + (24 * 60 * 60 * 1000);
      expect((record.statsCachedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect((record.statsCachedAt as Date).getTime()).toBeLessThanOrEqual(after);
      expect((record.statsExpiresAt as Date).getTime()).toBeGreaterThanOrEqual(expectedStatsExpiry);
    });
  });

  describe('Direct database operations', () => {
    it('should insert new track to cache', async () => {
      const track = createMockTrack({ ratingKey: '200', title: 'New Track' });
      const record = await trackToCacheRecord(track as Track);

      await db
        .insert(schema.trackCache)
        .values({...record, lastUsedAt: null});

      const cached = await db
        .select()
        .from(schema.trackCache)
        .where(eq(schema.trackCache.ratingKey, '200'))
        .get();

      expect(cached).toBeDefined();
      expect(cached?.title).toBe('New Track');
    });

    it('should update existing track on conflict', async () => {
      const track1 = createMockTrack({ ratingKey: '300', title: 'Original', userRating: 5 });
      const track2 = createMockTrack({ ratingKey: '300', title: 'Updated', userRating: 9 });

      await upsertTrack(track1 as Track);
      await upsertTrack(track2 as Track);

      const allTracks = await db.select().from(schema.trackCache).all();
      expect(allTracks).toHaveLength(1);
      expect(allTracks[0]?.title).toBe('Updated');
      expect(allTracks[0]?.userRating).toBe(9);
    });
  });

  describe('batchUpsertTracks', () => {
    it('should insert multiple tracks efficiently', async () => {
      const tracks = createMockTracks(10, { artistName: 'Batch Artist' });

      await batchUpsertTracks(tracks as Track[]);

      const cached = await db.select().from(schema.trackCache).all();
      expect(cached).toHaveLength(10);
      expect(cached.every(t => t.artistName === 'Batch Artist')).toBe(true);
    });

    it('should handle empty batch', async () => {
      await expect(batchUpsertTracks([])).resolves.not.toThrow();

      const cached = await db.select().from(schema.trackCache).all();
      expect(cached).toHaveLength(0);
    });
  });

  describe('updateTrackStats', () => {
    it('should update only stats fields, not static metadata', async () => {
      const track1 = createMockTrack({
        ratingKey: '400',
        title: 'Original Title',
        userRating: 5,
        viewCount: 10
      });

      await upsertTrack(track1 as Track);

      // Update stats only
      const track2 = createMockTrack({
        ratingKey: '400',
        title: 'Should Not Change',
        userRating: 9,
        viewCount: 25
      });

      await updateTrackStats(track2 as Track);

      const cached = await db
        .select()
        .from(schema.trackCache)
        .where(eq(schema.trackCache.ratingKey, '400'))
        .get();

      expect(cached?.title).toBe('Original Title'); // Static unchanged
      expect(cached?.userRating).toBe(9); // Stats updated
      expect(cached?.viewCount).toBe(25); // Stats updated
    });

    it('should recompute quality score on stats update', async () => {
      const track1 = createMockTrack({ ratingKey: '500', userRating: 5, viewCount: 5 });
      await upsertTrack(track1 as Track);

      const cached1 = await db
        .select()
        .from(schema.trackCache)
        .where(eq(schema.trackCache.ratingKey, '500'))
        .get();
      const originalQuality = cached1?.qualityScore;

      // Update with higher rating AND higher play count
      const track2 = createMockTrack({ ratingKey: '500', userRating: 10, viewCount: 20 });
      await updateTrackStats(track2 as Track);

      const cached2 = await db
        .select()
        .from(schema.trackCache)
        .where(eq(schema.trackCache.ratingKey, '500'))
        .get();

      expect(cached2?.qualityScore).toBeGreaterThan(originalQuality!);
    });
  });

  describe('getTrackFromCache', () => {
    it('should retrieve cached track by rating key', async () => {
      const track = createMockTrack({ ratingKey: '600', title: 'Cached Track' });
      await upsertTrack(track as Track);

      const cached = await getTrackFromCache('600');

      expect(cached).toBeDefined();
      expect(cached?.title).toBe('Cached Track');
    });

    it('should return null for missing track', async () => {
      const cached = await getTrackFromCache('999999');
      expect(cached).toBeNull();
    });

    it('should return null for expired static metadata by default', async () => {
      const track = createMockTrack({ ratingKey: '700' });
      await upsertTrack(track as Track);

      // Manually expire static metadata
      await db
        .update(schema.trackCache)
        .set({ staticExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.trackCache.ratingKey, '700'));

      const cached = await getTrackFromCache('700');
      expect(cached).toBeNull();
    });

    it('should return null for expired stats by default', async () => {
      const track = createMockTrack({ ratingKey: '800' });
      await upsertTrack(track as Track);

      // Manually expire stats
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.trackCache.ratingKey, '800'));

      const cached = await getTrackFromCache('800');
      expect(cached).toBeNull();
    });

    it('should return expired track when allowStale=true', async () => {
      const track = createMockTrack({ ratingKey: '900' });
      await upsertTrack(track as Track);

      // Expire both
      await db
        .update(schema.trackCache)
        .set({
          staticExpiresAt: new Date(Date.now() - 1000),
          statsExpiresAt: new Date(Date.now() - 1000)
        })
        .where(eq(schema.trackCache.ratingKey, '900'));

      const cached = await getTrackFromCache('900', true);
      expect(cached).toBeDefined();
      expect(cached?.ratingKey).toBe('900');
    });
  });

  describe('getTracksFromCache', () => {
    it('should retrieve multiple tracks by rating keys', async () => {
      const tracks = createMockTracks(5);
      await batchUpsertTracks(tracks as Track[]);

      const ratingKeys = ['1000', '1001', '1002'];
      const cached = await getTracksFromCache(ratingKeys);

      expect(cached.size).toBe(3);
      expect(cached.has('1000')).toBe(true);
      expect(cached.has('1001')).toBe(true);
      expect(cached.has('1002')).toBe(true);
    });

    it('should exclude expired entries', async () => {
      const tracks = createMockTracks(3);
      await batchUpsertTracks(tracks as Track[]);

      // Expire one track
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.trackCache.ratingKey, '1001'));

      const cached = await getTracksFromCache(['1000', '1001', '1002']);

      expect(cached.size).toBe(2);
      expect(cached.has('1000')).toBe(true);
      expect(cached.has('1001')).toBe(false); // Expired
      expect(cached.has('1002')).toBe(true);
    });

    it('should handle empty rating keys array', async () => {
      const cached = await getTracksFromCache([]);
      expect(cached.size).toBe(0);
    });
  });

  describe('findTracksWithExpiredStats', () => {
    it('should find tracks with expired 24h stats', async () => {
      const tracks = createMockTracks(5);
      await batchUpsertTracks(tracks as Track[]);

      // Expire stats for 3 tracks
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(Date.now() - 1000) })
        .where(
          sql`${schema.trackCache.ratingKey} IN ('1000', '1001', '1002')`
        );

      const expiredKeys = await findTracksWithExpiredStats();

      expect(expiredKeys).toHaveLength(3);
      expect(expiredKeys).toContain('1000');
      expect(expiredKeys).toContain('1001');
      expect(expiredKeys).toContain('1002');
    });

    it('should respect limit parameter', async () => {
      const tracks = createMockTracks(10);
      await batchUpsertTracks(tracks as Track[]);

      // Expire all
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(Date.now() - 1000) });

      const expiredKeys = await findTracksWithExpiredStats(5);
      expect(expiredKeys).toHaveLength(5);
    });

    it('should return empty array if no expired stats', async () => {
      const tracks = createMockTracks(3);
      await batchUpsertTracks(tracks as Track[]);

      const expiredKeys = await findTracksWithExpiredStats();
      expect(expiredKeys).toHaveLength(0);
    });
  });

  describe('findTracksWithExpiredStatic', () => {
    it('should find tracks with expired 90d static metadata', async () => {
      const tracks = createMockTracks(5);
      await batchUpsertTracks(tracks as Track[]);

      // Expire static for 2 tracks
      await db
        .update(schema.trackCache)
        .set({ staticExpiresAt: new Date(Date.now() - 1000) })
        .where(
          sql`${schema.trackCache.ratingKey} IN ('1001', '1003')`
        );

      const expiredKeys = await findTracksWithExpiredStatic();

      expect(expiredKeys).toHaveLength(2);
      expect(expiredKeys).toContain('1001');
      expect(expiredKeys).toContain('1003');
    });
  });

  describe('queryTracks', () => {
    beforeEach(async () => {
      // Set up test data with variety
      const tracks = [
        createHighRatedTrack({ ratingKey: '2000', userRating: 10, viewCount: 30, genres: [{ tag: 'Rock' }] }),
        createHighRatedTrack({ ratingKey: '2001', userRating: 9, viewCount: 20, genres: [{ tag: 'Jazz' }] }),
        createMockTrack({ ratingKey: '2002', userRating: 6, viewCount: 10, genres: [{ tag: 'Rock' }] }),
        createUnplayedTrack({ ratingKey: '2003', userRating: 8, genres: [{ tag: 'Electronic' }] }),
        createMockTrack({ ratingKey: '2004', userRating: null, viewCount: 5, genres: [{ tag: 'Jazz' }] }),
        createMockTrack({
          ratingKey: '2005',
          userRating: 9,
          viewCount: 15,
          lastViewedAt: Date.now() - (100 * 24 * 60 * 60 * 1000), // 100 days ago
          genres: [{ tag: 'Rock' }]
        })
      ];

      await batchUpsertTracks(tracks as Track[]);
    });

    it('should filter by minimum rating', async () => {
      const results = await queryTracks({ minRating: 9, limit: 100 });

      expect(results.length).toBe(3); // ratings: 10, 9, 9
      expect(results.every(t => t.userRating && t.userRating >= 9)).toBe(true);
    });

    it('should filter by unplayed only', async () => {
      const results = await queryTracks({ unplayedOnly: true, limit: 100 });

      expect(results.length).toBe(1);
      expect(results[0]?.ratingKey).toBe('2003');
      expect(results[0]?.isUnplayed).toBe(true);
    });

    it('should filter by high rated only', async () => {
      const results = await queryTracks({ highRatedOnly: true, limit: 100 });

      expect(results.length).toBe(4); // ratings: 10, 9, 8, 9 (all >= 8)
      expect(results.every(t => t.isHighRated === true)).toBe(true);
    });

    it('should filter by unrated only', async () => {
      const results = await queryTracks({ unratedOnly: true, limit: 100 });

      expect(results.length).toBe(1);
      expect(results[0]?.ratingKey).toBe('2004');
      expect(results[0]?.isUnrated).toBe(true);
    });

    it('should filter by genre', async () => {
      const results = await queryTracks({ genres: ['Rock'], limit: 100 });

      expect(results.length).toBe(3); // 2000, 2002, 2005
      expect(results.every(t => t.genres.includes('Rock'))).toBe(true);
    });

    it('should filter by multiple genres (OR logic)', async () => {
      const results = await queryTracks({ genres: ['Rock', 'Jazz'], limit: 100 });

      expect(results.length).toBe(5); // All except Electronic
    });

    it('should exclude recently played tracks', async () => {
      const results = await queryTracks({ excludeRecentlyPlayed: 30, limit: 100 });

      // Should include: unplayed (2003), null lastViewedAt, and 100-day-old (2005)
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(t => t.ratingKey === '2005')).toBe(true); // 100 days old
    });

    it('should order by quality score descending by default', async () => {
      const results = await queryTracks({ limit: 100 });

      expect(results.length).toBeGreaterThan(0);
      // Verify descending order
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]?.qualityScore ?? -Infinity;
        const curr = results[i]?.qualityScore ?? -Infinity;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('should order by user rating', async () => {
      const results = await queryTracks({
        orderBy: 'userRating',
        orderDirection: 'desc',
        limit: 100
      });

      // Verify descending order (nulls at end)
      const rated = results.filter(t => t.userRating !== null);
      for (let i = 1; i < rated.length; i++) {
        expect(rated[i - 1]!.userRating!).toBeGreaterThanOrEqual(rated[i]!.userRating!);
      }
    });

    it('should respect limit parameter', async () => {
      const results = await queryTracks({ limit: 3 });
      expect(results.length).toBe(3);
    });

    it('should combine multiple filters', async () => {
      const results = await queryTracks({
        minRating: 8,
        genres: ['Rock', 'Electronic'],
        limit: 100
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(t =>
        t.userRating && t.userRating >= 8 &&
        (t.genres.includes('Rock') || t.genres.includes('Electronic'))
      )).toBe(true);
    });
  });

  describe('getCacheHealth', () => {
    it('should return zero health for empty cache', async () => {
      const health = await getCacheHealth();

      expect(health.totalTracks).toBe(0);
      expect(health.staleStatic).toBe(0);
      expect(health.staleStats).toBe(0);
      expect(health.avgAge).toBe(0);
      expect(health.byQuality).toEqual({ highRated: 0, unrated: 0, unplayed: 0 });
    });

    it('should calculate health metrics correctly', async () => {
      const tracks = [
        createHighRatedTrack({ ratingKey: '3000', userRating: 10, viewCount: 30 }),
        createHighRatedTrack({ ratingKey: '3001', userRating: 9, viewCount: 20 }),
        createUnplayedTrack({ ratingKey: '3002', userRating: 7 }),
        createMockTrack({ ratingKey: '3003', userRating: null, viewCount: 5 }),
        createMockTrack({ ratingKey: '3004', userRating: 6, viewCount: 10 })
      ];

      await batchUpsertTracks(tracks as Track[]);

      const health = await getCacheHealth();

      expect(health.totalTracks).toBe(5);
      expect(health.staleStatic).toBe(0);
      expect(health.staleStats).toBe(0);
      expect(health.byQuality.highRated).toBe(2); // ratings 10, 9
      expect(health.byQuality.unrated).toBe(1); // 3003
      expect(health.byQuality.unplayed).toBe(1); // 3002
      expect(health.avgAge).toBeGreaterThanOrEqual(0);
    });

    it('should detect stale stats', async () => {
      const tracks = createMockTracks(5);
      await batchUpsertTracks(tracks as Track[]);

      // Expire stats for 3 tracks
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(Date.now() - 1000) })
        .where(
          sql`${schema.trackCache.ratingKey} IN ('1000', '1001', '1002')`
        );

      const health = await getCacheHealth();

      expect(health.totalTracks).toBe(5);
      expect(health.staleStats).toBe(3);
    });

    it('should detect stale static metadata', async () => {
      const tracks = createMockTracks(4);
      await batchUpsertTracks(tracks as Track[]);

      // Expire static for 2 tracks
      await db
        .update(schema.trackCache)
        .set({ staticExpiresAt: new Date(Date.now() - 1000) })
        .where(
          sql`${schema.trackCache.ratingKey} IN ('1001', '1003')`
        );

      const health = await getCacheHealth();

      expect(health.totalTracks).toBe(4);
      expect(health.staleStatic).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should clear entire cache', async () => {
      const tracks = createMockTracks(10);
      await batchUpsertTracks(tracks as Track[]);

      const beforeCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.trackCache)
        .get();
      expect(beforeCount?.count).toBe(10);

      await clearCache();

      const afterCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.trackCache)
        .get();
      expect(afterCount?.count).toBe(0);
    });
  });

  describe('touchTracks', () => {
    it('should update lastUsedAt timestamp', async () => {
      const tracks = createMockTracks(3);
      await batchUpsertTracks(tracks as Track[]);

      const beforeTouch = await db
        .select()
        .from(schema.trackCache)
        .where(eq(schema.trackCache.ratingKey, '1000'))
        .get();
      expect(beforeTouch?.lastUsedAt).toBeNull();

      await touchTracks(['1000', '1001']);

      const afterTouch = await db
        .select()
        .from(schema.trackCache)
        .where(eq(schema.trackCache.ratingKey, '1000'))
        .get();
      expect(afterTouch?.lastUsedAt).not.toBeNull();
      expect(afterTouch?.lastUsedAt).toBeInstanceOf(Date);
      expect((afterTouch?.lastUsedAt as Date).getTime()).toBeGreaterThan(0);
    });

    it('should handle empty array', async () => {
      await expect(touchTracks([])).resolves.not.toThrow();
    });
  });

  describe('TTL edge cases', () => {
    it('should handle tracks at exact expiry boundary', async () => {
      const track = createMockTrack({ ratingKey: '4000' });
      await upsertTrack(track as Track);

      const pastExpiry = Date.now() - 1; // 1ms in the past
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(pastExpiry) })
        .where(eq(schema.trackCache.ratingKey, '4000'));

      // Should be treated as expired (< check)
      const cached = await getTrackFromCache('4000');
      expect(cached).toBeNull();
    });

    it('should handle far future expiry dates', async () => {
      const track = createMockTrack({ ratingKey: '5000' });
      await upsertTrack(track as Track);

      const farFuture = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
      await db
        .update(schema.trackCache)
        .set({ statsExpiresAt: new Date(farFuture), staticExpiresAt: new Date(farFuture) })
        .where(eq(schema.trackCache.ratingKey, '5000'));

      const cached = await getTrackFromCache('5000');
      expect(cached).toBeDefined();
    });
  });
});
