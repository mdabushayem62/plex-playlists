/**
 * Tests for pattern repository operations (caching, persistence)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb, type TestDbContext } from '../../__tests__/helpers/test-db.js';
import * as dbModule from '../../db/index.js';
import {
  isCacheFresh,
  getCachedPatterns,
  savePatternsToCache,
  getPatternsWithCache,
} from '../pattern-repository.js';
import type { UserPatterns } from '../types.js';

describe('Pattern Repository', () => {
  let ctx: TestDbContext;

  beforeEach(() => {
    // Create test database
    ctx = createTestDb();
    // Mock getDb to return our test database
    vi.spyOn(dbModule, 'getDb').mockReturnValue(ctx.db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeTestDb(ctx);
  });

  describe('savePatternsToCache', () => {
    it('should save patterns to database', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
          { hour: 8, genre: 'folk', weight: 0.4, playCount: 20 },
        ],
        peakHours: [8, 20, 14],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 100,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns);

      const cached = await getCachedPatterns();
      expect(cached).toBeDefined();
      expect(cached?.hourlyGenrePreferences).toHaveLength(2);
      expect(cached?.peakHours).toEqual([8, 20, 14]);
      expect(cached?.sessionsAnalyzed).toBe(100);
    });

    it('should upsert patterns on duplicate save', async () => {
      const patterns1: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
        ],
        peakHours: [8],
        lastAnalyzed: new Date('2025-01-01'),
        sessionsAnalyzed: 50,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-05'),
      };

      const patterns2: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'rock', weight: 0.8, playCount: 40 },
        ],
        peakHours: [20],
        lastAnalyzed: new Date('2025-01-10'),
        sessionsAnalyzed: 100,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns1);
      await savePatternsToCache(patterns2);

      const cached = await getCachedPatterns();
      expect(cached?.hourlyGenrePreferences).toHaveLength(1);
      expect(cached?.hourlyGenrePreferences[0].genre).toBe('rock');
      expect(cached?.peakHours).toEqual([20]);
      expect(cached?.sessionsAnalyzed).toBe(100);
    });

    it('should set expiration to 7 days from now', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [],
        peakHours: [],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 0,
        analyzedFrom: new Date(),
        analyzedTo: new Date(),
      };

      await savePatternsToCache(patterns);

      const result = ctx.sqlite
        .prepare('SELECT expires_at FROM user_patterns LIMIT 1')
        .get() as { expires_at: number };
      expect(result).toBeDefined();

      const expiresAt = new Date(result.expires_at);
      const now = new Date();
      const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBeGreaterThan(6.9);
      expect(daysDiff).toBeLessThan(7.1);
    });
  });

  describe('getCachedPatterns', () => {
    it('should return null when no patterns cached', async () => {
      const cached = await getCachedPatterns();
      expect(cached).toBeNull();
    });

    it('should return patterns when cached', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
        ],
        peakHours: [8, 20],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 50,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns);

      const cached = await getCachedPatterns();
      expect(cached).toBeDefined();
      expect(cached?.hourlyGenrePreferences).toHaveLength(1);
      expect(cached?.peakHours).toEqual([8, 20]);
    });

    it('should parse JSON fields correctly', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
          { hour: 20, genre: 'electronic', weight: 0.8, playCount: 40 },
        ],
        peakHours: [8, 14, 20],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 100,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns);

      const cached = await getCachedPatterns();
      expect(cached?.hourlyGenrePreferences).toHaveLength(2);
      expect(cached?.hourlyGenrePreferences[0]).toMatchObject({
        hour: 8,
        genre: 'indie',
        weight: 0.6,
        playCount: 30,
      });
      expect(cached?.peakHours).toEqual([8, 14, 20]);
    });
  });

  describe('isCacheFresh', () => {
    it('should return false when no patterns cached', async () => {
      const fresh = await isCacheFresh();
      expect(fresh).toBe(false);
    });

    it('should return true when cache is fresh', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [],
        peakHours: [],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 0,
        analyzedFrom: new Date(),
        analyzedTo: new Date(),
      };

      await savePatternsToCache(patterns);

      const fresh = await isCacheFresh();
      expect(fresh).toBe(true);
    });

    it('should return false when cache is expired', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [],
        peakHours: [],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 0,
        analyzedFrom: new Date(),
        analyzedTo: new Date(),
      };

      // Save patterns
      await savePatternsToCache(patterns);

      // Manually set expiration to past
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 8); // 8 days ago
      ctx.sqlite
        .prepare('UPDATE user_patterns SET expires_at = ?')
        .run(pastDate.getTime());

      const fresh = await isCacheFresh();
      expect(fresh).toBe(false);
    });
  });

  describe('getPatternsWithCache', () => {
    it('should return cached patterns when fresh', async () => {
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
        ],
        peakHours: [8],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 50,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns);

      const result = await getPatternsWithCache(false);
      expect(result).toBeDefined();
      expect(result?.hourlyGenrePreferences).toHaveLength(1);
    });

    it('should call analyzer when cache is stale', async () => {
      let analyzerCalled = false;
      const mockAnalyzer = async (): Promise<UserPatterns> => {
        analyzerCalled = true;
        return {
          hourlyGenrePreferences: [
            { hour: 8, genre: 'rock', weight: 0.8, playCount: 40 },
          ],
          peakHours: [8, 20],
          lastAnalyzed: new Date(),
          sessionsAnalyzed: 100,
          analyzedFrom: new Date('2025-01-01'),
          analyzedTo: new Date('2025-01-10'),
        };
      };

      const result = await getPatternsWithCache(false, mockAnalyzer);

      expect(analyzerCalled).toBe(true);
      expect(result).toBeDefined();
      expect(result?.hourlyGenrePreferences[0].genre).toBe('rock');
    });

    it('should force refresh when forceRefresh is true', async () => {
      // Save fresh patterns
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
        ],
        peakHours: [8],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 50,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns);

      let analyzerCalled = false;
      const mockAnalyzer = async (): Promise<UserPatterns> => {
        analyzerCalled = true;
        return {
          hourlyGenrePreferences: [
            { hour: 8, genre: 'rock', weight: 0.8, playCount: 40 },
          ],
          peakHours: [20],
          lastAnalyzed: new Date(),
          sessionsAnalyzed: 100,
          analyzedFrom: new Date('2025-01-01'),
          analyzedTo: new Date('2025-01-10'),
        };
      };

      // Force refresh despite fresh cache
      const result = await getPatternsWithCache(true, mockAnalyzer);

      expect(analyzerCalled).toBe(true);
      expect(result?.hourlyGenrePreferences[0].genre).toBe('rock');
    });

    it('should return null when no analyzer provided and no cache', async () => {
      const result = await getPatternsWithCache(false);
      expect(result).toBeNull();
    });

    it('should fallback to stale cache when analyzer fails', async () => {
      // Save expired patterns
      const patterns: UserPatterns = {
        hourlyGenrePreferences: [
          { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
        ],
        peakHours: [8],
        lastAnalyzed: new Date(),
        sessionsAnalyzed: 50,
        analyzedFrom: new Date('2025-01-01'),
        analyzedTo: new Date('2025-01-10'),
      };

      await savePatternsToCache(patterns);

      // Expire the cache
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 8);
      ctx.sqlite
        .prepare('UPDATE user_patterns SET expires_at = ?')
        .run(pastDate.getTime());

      // Provide analyzer that fails
      const failingAnalyzer = async (): Promise<UserPatterns> => {
        throw new Error('Analysis failed');
      };

      const result = await getPatternsWithCache(false, failingAnalyzer);

      // Should fallback to stale cache
      expect(result).toBeDefined();
      expect(result?.hourlyGenrePreferences[0].genre).toBe('indie');
    });
  });
});
