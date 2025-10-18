/**
 * Performance tests for pattern-based features
 * Ensures pattern operations don't slow down playlist generation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as dbModule from '../../db/index.js';
import { savePatternsToCache, getCachedPatterns } from '../../patterns/pattern-repository.js';
import { getGenrePreferencesForHour } from '../../scoring/weights.js';
import { calculateScore } from '../../scoring/strategies.js';
import type { UserPatterns } from '../../patterns/types.js';
import type { ScoringContext } from '../../scoring/types.js';

describe('Pattern Performance', () => {
  let ctx: TestDbContext;

  beforeEach(() => {
    ctx = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(ctx.db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeTestDb(ctx);
  });

  it('should cache patterns quickly (<50ms for write)', async () => {
    const patterns: UserPatterns = {
      hourlyGenrePreferences: Array.from({ length: 100 }, (_, i) => ({
        hour: i % 24,
        genre: ['indie', 'rock', 'electronic', 'folk'][i % 4],
        weight: Math.random(),
        playCount: Math.floor(Math.random() * 50),
      })),
      peakHours: [8, 14, 20],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 1000,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    const start = performance.now();
    await savePatternsToCache(patterns);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });

  it('should retrieve cached patterns quickly (<10ms)', async () => {
    const patterns: UserPatterns = {
      hourlyGenrePreferences: Array.from({ length: 100 }, (_, i) => ({
        hour: i % 24,
        genre: ['indie', 'rock', 'electronic', 'folk'][i % 4],
        weight: Math.random(),
        playCount: Math.floor(Math.random() * 50),
      })),
      peakHours: [8, 14, 20],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 1000,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    await savePatternsToCache(patterns);

    const start = performance.now();
    const cached = await getCachedPatterns();
    const duration = performance.now() - start;

    expect(cached).toBeDefined();
    expect(duration).toBeLessThan(10);
  });

  it('should lookup genre preferences quickly (<1ms)', () => {
    const patterns = Array.from({ length: 100 }, (_, i) => ({
      hour: i % 24,
      genre: ['indie', 'rock', 'electronic', 'folk'][i % 4],
      weight: Math.random(),
      playCount: Math.floor(Math.random() * 50),
    }));

    const start = performance.now();
    const prefs = getGenrePreferencesForHour(8, patterns);
    const duration = performance.now() - start;

    expect(prefs.size).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1);
  });

  it('should score with patterns efficiently (<5ms per track)', async () => {
    const patterns: UserPatterns = {
      hourlyGenrePreferences: Array.from({ length: 100 }, (_, i) => ({
        hour: i % 24,
        genre: ['indie', 'rock', 'electronic', 'folk'][i % 4],
        weight: Math.random(),
        playCount: Math.floor(Math.random() * 50),
      })),
      peakHours: [8, 14, 20],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 1000,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    const context: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['indie', 'rock'],
      moods: ['happy'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    // Warm up
    await calculateScore('balanced', context);

    const start = performance.now();
    await calculateScore('balanced', context);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5);
  });

  it('should score 50 tracks with patterns in reasonable time (<100ms)', async () => {
    const patterns: UserPatterns = {
      hourlyGenrePreferences: Array.from({ length: 100 }, (_, i) => ({
        hour: i % 24,
        genre: ['indie', 'rock', 'electronic', 'folk', 'metal', 'jazz'][i % 6],
        weight: Math.random(),
        playCount: Math.floor(Math.random() * 50),
      })),
      peakHours: [8, 14, 20],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 1000,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    // Simulate scoring 50 tracks (typical playlist size)
    const contexts: ScoringContext[] = Array.from({ length: 50 }, (_, i) => ({
      userRating: 6 + (i % 5),
      playCount: i % 20,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i % 30)),
      genres: [['indie', 'rock', 'electronic', 'folk', 'metal', 'jazz'][i % 6]],
      moods: [['happy', 'sad', 'energetic', 'mellow'][i % 4]],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    }));

    const start = performance.now();
    await Promise.all(contexts.map(context => calculateScore('balanced', context)));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should score without patterns as fast as with patterns', async () => {
    const patterns: UserPatterns = {
      hourlyGenrePreferences: Array.from({ length: 100 }, (_, i) => ({
        hour: i % 24,
        genre: ['indie', 'rock', 'electronic', 'folk'][i % 4],
        weight: Math.random(),
        playCount: Math.floor(Math.random() * 50),
      })),
      peakHours: [8, 14, 20],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 1000,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    const contextWithPatterns: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['indie', 'rock'],
      moods: ['happy'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const contextWithoutPatterns: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['indie', 'rock'],
      moods: ['happy'],
      timeWindow: 'morning',
    };

    // Warm up
    await calculateScore('balanced', contextWithPatterns);
    await calculateScore('balanced', contextWithoutPatterns);

    // Measure with patterns
    const startWith = performance.now();
    for (let i = 0; i < 100; i++) {
      await calculateScore('balanced', contextWithPatterns);
    }
    const durationWith = performance.now() - startWith;

    // Measure without patterns
    const startWithout = performance.now();
    for (let i = 0; i < 100; i++) {
      await calculateScore('balanced', contextWithoutPatterns);
    }
    const durationWithout = performance.now() - startWithout;

    // Pattern-based scoring should be within 2x of non-pattern scoring
    expect(durationWith).toBeLessThan(durationWithout * 2);
  });
});
