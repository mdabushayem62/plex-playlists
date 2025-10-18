/**
 * Integration test for pattern-based scoring
 * Tests the full flow: pattern analysis → caching → scoring with patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb, type TestDbContext } from '../helpers/test-db.js';
import * as dbModule from '../../db/index.js';
import { savePatternsToCache, getCachedPatterns } from '../../patterns/pattern-repository.js';
import { calculateScore } from '../../scoring/strategies.js';
import type { UserPatterns } from '../../patterns/types.js';
import type { ScoringContext } from '../../scoring/types.js';

describe('Pattern-Based Scoring Integration', () => {
  let ctx: TestDbContext;

  beforeEach(() => {
    ctx = createTestDb();
    vi.spyOn(dbModule, 'getDb').mockReturnValue(ctx.db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeTestDb(ctx);
  });

  it('should use learned patterns in scoring calculations', async () => {
    // 1. Create mock learned patterns (user strongly prefers electronic/house at current hour)
    // This is different from typical hardcoded profiles, so learned patterns should matter
    const currentHour = new Date().getHours();
    const patterns: UserPatterns = {
      hourlyGenrePreferences: [
        { hour: currentHour, genre: 'electronic', weight: 0.9, playCount: 45 },
        { hour: currentHour, genre: 'house', weight: 0.7, playCount: 35 },
        { hour: currentHour, genre: 'techno', weight: 0.5, playCount: 25 },
      ],
      peakHours: [currentHour, (currentHour + 1) % 24, (currentHour - 1 + 24) % 24],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 100,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    // 2. Save patterns to database
    await savePatternsToCache(patterns);

    // 3. Verify patterns are cached
    const cached = await getCachedPatterns();
    expect(cached).toBeDefined();
    expect(cached?.hourlyGenrePreferences).toHaveLength(3);

    // 4. Score electronic track WITH learned patterns
    const electronicContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 1 week ago
      genres: ['electronic', 'house'],
      moods: ['energetic'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const electronicScore = await calculateScore('balanced', electronicContext);

    // 5. Score same track WITHOUT learned patterns
    const noPatternContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['electronic', 'house'],
      moods: ['energetic'],
      timeWindow: 'morning',
      // No learned patterns
    };

    const noPatternScore = await calculateScore('balanced', noPatternContext);

    // 6. Electronic track should score higher with learned patterns
    // (user strongly prefers electronic at current hour, hardcoded morning profile doesn't)
    expect(electronicScore.components.metadata?.timeOfDayBoost).toBeGreaterThan(0);
    expect(electronicScore.components.metadata?.timeOfDayBoost).toBeGreaterThan(
      noPatternScore.components.metadata?.timeOfDayBoost || 0
    );
  });

  it('should prefer learned patterns over hardcoded profiles', async () => {
    const currentHour = new Date().getHours();

    // Create patterns where user strongly prefers metal at current hour (unusual for morning)
    const patterns: UserPatterns = {
      hourlyGenrePreferences: [
        { hour: currentHour, genre: 'metal', weight: 0.9, playCount: 45 },
        { hour: currentHour, genre: 'rock', weight: 0.6, playCount: 30 },
      ],
      peakHours: [currentHour],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 50,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    await savePatternsToCache(patterns);

    // Score metal track with learned patterns
    const metalWithPatternsContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['metal', 'heavy metal'],
      moods: ['energetic'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const metalWithPatterns = await calculateScore('balanced', metalWithPatternsContext);

    // Score metal track without learned patterns (using hardcoded morning profile)
    const metalWithoutPatternsContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['metal', 'heavy metal'],
      moods: ['energetic'],
      timeWindow: 'morning',
      // No learned patterns - will use hardcoded morning profile (indie/folk preferred)
    };

    const metalWithoutPatterns = await calculateScore('balanced', metalWithoutPatternsContext);

    // Metal should score significantly higher with learned patterns
    // because user has demonstrated strong preference for metal at current hour
    expect(metalWithPatterns.finalScore).toBeGreaterThan(metalWithoutPatterns.finalScore);
    expect(metalWithPatterns.components.metadata?.timeOfDayBoost).toBeGreaterThan(
      metalWithoutPatterns.components.metadata?.timeOfDayBoost || 0
    );
  });

  it('should cache patterns for 7 days', async () => {
    const patterns: UserPatterns = {
      hourlyGenrePreferences: [
        { hour: 8, genre: 'indie', weight: 0.6, playCount: 30 },
      ],
      peakHours: [8, 20],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 100,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    await savePatternsToCache(patterns);

    // Check expiration is ~7 days from now
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

  it('should handle tracks with multiple genres using max weight', async () => {
    const currentHour = new Date().getHours();

    const patterns: UserPatterns = {
      hourlyGenrePreferences: [
        { hour: currentHour, genre: 'indie', weight: 0.8, playCount: 40 },
        { hour: currentHour, genre: 'folk', weight: 0.4, playCount: 20 },
        { hour: currentHour, genre: 'rock', weight: 0.2, playCount: 10 },
      ],
      peakHours: [currentHour],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 70,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    await savePatternsToCache(patterns);

    // Track with multiple genres (should use highest weight = indie at 0.8)
    const multiGenreContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['indie', 'folk', 'rock'], // indie has highest weight (0.8)
      moods: ['mellow'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const multiGenreScore = await calculateScore('balanced', multiGenreContext);

    // Single genre track (only folk at 0.4)
    const singleGenreContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['folk'], // Lower weight than indie
      moods: ['mellow'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const singleGenreScore = await calculateScore('balanced', singleGenreContext);

    // Multi-genre track should score higher (uses max weight = indie)
    expect(multiGenreScore.components.metadata?.timeOfDayBoost).toBeGreaterThan(
      singleGenreScore.components.metadata?.timeOfDayBoost || 0
    );
  });

  it('should combine learned patterns with energy and mood alignment', async () => {
    const currentHour = new Date().getHours();

    const patterns: UserPatterns = {
      hourlyGenrePreferences: [
        { hour: currentHour, genre: 'indie', weight: 0.6, playCount: 30 },
      ],
      peakHours: [currentHour],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 50,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    await savePatternsToCache(patterns);

    // Track with matching genre AND perfect energy/mood alignment
    const perfectMatchContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['indie'],
      moods: ['happy', 'uplifting'], // Matches morning mood preferences
      audioFeatures: {
        energy: 0.4, // Matches morning energy target
      },
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const perfectMatchScore = await calculateScore('balanced', perfectMatchContext);

    // Track with matching genre but NO energy/mood
    const genreOnlyContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['indie'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
      // No audioFeatures or moods
    };

    const genreOnlyScore = await calculateScore('balanced', genreOnlyContext);

    // Perfect match should score higher (learned patterns + energy + mood)
    expect(perfectMatchScore.finalScore).toBeGreaterThan(genreOnlyScore.finalScore);
    expect(perfectMatchScore.components.metadata?.timeOfDayBoost).toBeGreaterThan(
      genreOnlyScore.components.metadata?.timeOfDayBoost || 0
    );
  });

  it('should gracefully handle tracks with no matching patterns', async () => {
    const currentHour = new Date().getHours();

    const patterns: UserPatterns = {
      hourlyGenrePreferences: [
        { hour: currentHour, genre: 'indie', weight: 0.7, playCount: 35 },
      ],
      peakHours: [currentHour],
      lastAnalyzed: new Date(),
      sessionsAnalyzed: 50,
      analyzedFrom: new Date('2025-01-01'),
      analyzedTo: new Date('2025-01-10'),
    };

    await savePatternsToCache(patterns);

    // Track with genre not in learned patterns
    const noMatchContext: ScoringContext = {
      userRating: 8,
      playCount: 10,
      lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      genres: ['jazz', 'classical'], // Not in patterns
      moods: ['mellow'],
      learnedPatterns: patterns.hourlyGenrePreferences,
      timeWindow: 'morning',
    };

    const noMatchScore = await calculateScore('balanced', noMatchContext);

    // Should not crash, score should be reasonable (energy/mood can still contribute)
    expect(noMatchScore.finalScore).toBeGreaterThan(0);
    expect(noMatchScore.components.metadata?.timeOfDayBoost).toBeGreaterThanOrEqual(0);
    expect(noMatchScore.components.metadata?.timeOfDayBoost).toBeLessThan(0.05);
  });
});
