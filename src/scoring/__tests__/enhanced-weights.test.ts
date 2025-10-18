/**
 * Unit tests for enhanced scoring weights (Quick Wins)
 * Tests time-of-day boost, energy alignment, artist spacing, and genre matching
 */

import { describe, it, expect } from 'vitest';
import {
  timeOfDayBoost,
  energyAlignment,
  tempoMatch,
  artistSpacingPenalty,
  genreSpacingPenalty,
  genreMatchScore,
  moodSimilarity,
  explorationBoost,
  TIME_PROFILES
} from '../weights.js';

describe('timeOfDayBoost', () => {
  it('should return 0 when no time window provided', () => {
    const boost = timeOfDayBoost(['rock'], ['energetic'], 0.7, undefined);
    expect(boost).toBe(0);
  });

  it('should boost morning tracks with acoustic genres', () => {
    const boost = timeOfDayBoost(['acoustic', 'folk'], [], undefined, 'morning');
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(TIME_PROFILES.morning.boost);
  });

  it('should boost evening tracks with high energy', () => {
    const boost = timeOfDayBoost(['rock', 'electronic'], ['energetic'], 0.7, 'evening');
    expect(boost).toBeGreaterThan(0);
    // Should get genre + energy + mood boost
    expect(boost).toBeCloseTo(TIME_PROFILES.evening.boost, 1);
  });

  it('should give partial boost for matching only genre', () => {
    const boost = timeOfDayBoost(['ambient'], [], undefined, 'afternoon');
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThan(TIME_PROFILES.afternoon.boost);
  });

  it('should give partial boost for matching only mood', () => {
    const boost = timeOfDayBoost([], ['calm', 'peaceful'], undefined, 'afternoon');
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThan(TIME_PROFILES.afternoon.boost);
  });

  it('should penalize mismatched energy', () => {
    // High energy track in morning (target: 0.4)
    const boost = timeOfDayBoost([], [], 0.9, 'morning');
    expect(boost).toBe(0); // Energy too far off (diff > 0.2)
  });

  it('should handle case-insensitive genre matching', () => {
    const boost1 = timeOfDayBoost(['ACOUSTIC'], [], undefined, 'morning');
    const boost2 = timeOfDayBoost(['acoustic'], [], undefined, 'morning');
    expect(boost1).toBeCloseTo(boost2);
  });
});

describe('energyAlignment', () => {
  it('should return 1.0 for perfect match', () => {
    expect(energyAlignment(0.5, 0.5)).toBe(1.0);
  });

  it('should return 0.0 for maximum distance', () => {
    expect(energyAlignment(0.0, 1.0)).toBe(0.0);
    expect(energyAlignment(1.0, 0.0)).toBe(0.0);
  });

  it('should return 0.5 for neutral when no energy data', () => {
    expect(energyAlignment(undefined, 0.5)).toBe(0.5);
  });

  it('should calculate linear distance', () => {
    expect(energyAlignment(0.3, 0.5)).toBeCloseTo(0.8);
    expect(energyAlignment(0.7, 0.5)).toBeCloseTo(0.8);
  });

  it('should be symmetric', () => {
    const score1 = energyAlignment(0.3, 0.7);
    const score2 = energyAlignment(0.7, 0.3);
    expect(score1).toBeCloseTo(score2);
  });
});

describe('tempoMatch', () => {
  it('should return 1.0 for exact match', () => {
    expect(tempoMatch(120, 120)).toBe(1.0);
  });

  it('should return 1.0 within threshold', () => {
    expect(tempoMatch(120, 125, 10)).toBe(1.0);
    expect(tempoMatch(120, 130, 10)).toBe(1.0);
  });

  it('should return 0.5 for neutral when no tempo data', () => {
    expect(tempoMatch(undefined, 120)).toBe(0.5);
    expect(tempoMatch(120, undefined)).toBe(0.5);
  });

  it('should falloff linearly beyond threshold', () => {
    expect(tempoMatch(120, 135, 10)).toBeCloseTo(0.5); // 15 BPM diff, threshold 10
    expect(tempoMatch(120, 140, 10)).toBeCloseTo(0.0); // 20 BPM diff, threshold 10
  });

  it('should respect custom threshold', () => {
    expect(tempoMatch(120, 125, 5)).toBe(1.0); // Within 5 BPM
    expect(tempoMatch(120, 130, 5)).toBeCloseTo(0.0); // 10 BPM > 2x threshold
  });

  it('should be symmetric', () => {
    const score1 = tempoMatch(120, 140);
    const score2 = tempoMatch(140, 120);
    expect(score1).toBeCloseTo(score2);
  });
});

describe('artistSpacingPenalty', () => {
  it('should return 1.0 (no penalty) when no recent artists', () => {
    expect(artistSpacingPenalty('Radiohead', [])).toBe(1.0);
  });

  it('should return 1.0 when artist name not provided', () => {
    expect(artistSpacingPenalty(undefined, ['Radiohead'])).toBe(1.0);
  });

  it('should penalize recently played artist', () => {
    const penalty = artistSpacingPenalty('Radiohead', ['Radiohead', 'Björk']);
    expect(penalty).toBe(0.7); // Default 30% penalty
  });

  it('should not penalize different artist', () => {
    const penalty = artistSpacingPenalty('Radiohead', ['Björk', 'Portishead']);
    expect(penalty).toBe(1.0);
  });

  it('should be case-insensitive', () => {
    const penalty1 = artistSpacingPenalty('Radiohead', ['radiohead']);
    const penalty2 = artistSpacingPenalty('radiohead', ['RADIOHEAD']);
    expect(penalty1).toBe(0.7);
    expect(penalty2).toBe(0.7);
  });

  it('should respect custom penalty amount', () => {
    const penalty = artistSpacingPenalty('Radiohead', ['Radiohead'], 0.5);
    expect(penalty).toBe(0.5); // 50% penalty
  });
});

describe('genreSpacingPenalty', () => {
  it('should return 1.0 when no recent genres', () => {
    expect(genreSpacingPenalty(['rock', 'alternative'], [])).toBe(1.0);
  });

  it('should return 1.0 when no track genres', () => {
    expect(genreSpacingPenalty([], ['rock', 'alternative'])).toBe(1.0);
  });

  it('should penalize tracks with recently played genre', () => {
    const penalty = genreSpacingPenalty(['rock', 'indie'], ['rock']);
    expect(penalty).toBe(0.85); // Default 15% penalty
  });

  it('should not penalize tracks with different genres', () => {
    const penalty = genreSpacingPenalty(['jazz', 'funk'], ['rock', 'electronic']);
    expect(penalty).toBe(1.0);
  });

  it('should be case-insensitive', () => {
    const penalty1 = genreSpacingPenalty(['Rock'], ['rock']);
    const penalty2 = genreSpacingPenalty(['rock'], ['ROCK']);
    expect(penalty1).toBe(0.85);
    expect(penalty2).toBe(0.85);
  });

  it('should respect custom penalty amount', () => {
    const penalty = genreSpacingPenalty(['rock'], ['rock'], 0.3);
    expect(penalty).toBe(0.7); // 30% penalty
  });
});

describe('genreMatchScore', () => {
  it('should return 0.5 when no genres provided', async () => {
    expect(await genreMatchScore([], [])).toBe(0.5);
    expect(await genreMatchScore(['rock'], [])).toBe(0.5);
    expect(await genreMatchScore([], ['rock'])).toBe(0.5);
  });

  it('should return high score for exact match', async () => {
    const score = await genreMatchScore(['rock', 'alternative'], ['rock']);
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('should return 1.0 for perfect match (all genres match)', async () => {
    const score = await genreMatchScore(['rock'], ['rock']);
    expect(score).toBe(1.0);
  });

  it('should return moderate score for partial match', async () => {
    const score = await genreMatchScore(['indie rock'], ['rock']);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(0.7); // Substring match counts as partial
  });

  it('should return low score for no match', async () => {
    const score = await genreMatchScore(['classical', 'opera'], ['rock', 'electronic']);
    expect(score).toBe(0.3);
  });

  it('should be case-insensitive', async () => {
    const score1 = await genreMatchScore(['Rock'], ['rock']);
    const score2 = await genreMatchScore(['rock'], ['ROCK']);
    expect(score1).toBeGreaterThan(0.7);
    expect(score2).toBeGreaterThan(0.7);
  });

  it('should handle substring matching', async () => {
    const score = await genreMatchScore(['progressive rock'], ['rock']);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(0.7); // Substring match counts as partial
  });
});

describe('moodSimilarity', () => {
  it('should return 0.5 when no mood data', () => {
    expect(moodSimilarity({}, {})).toBe(0.5);
    expect(moodSimilarity({ happy: 0.8 }, {})).toBe(0.5);
    expect(moodSimilarity({}, { happy: 0.8 })).toBe(0.5);
  });

  it('should return high score for identical moods', () => {
    const vector = { happy: 0.8, energetic: 0.6 };
    const score = moodSimilarity(vector, vector);
    expect(score).toBeCloseTo(1.0);
  });

  it('should return low score for opposite moods', () => {
    const track = { happy: 1.0 };
    const target = { sad: 1.0 };
    const score = moodSimilarity(track, target);
    expect(score).toBeLessThan(0.6);
  });

  it('should calculate cosine similarity correctly', () => {
    const track = { happy: 0.8, calm: 0.2 };
    const target = { happy: 0.6, calm: 0.4 };
    const score = moodSimilarity(track, target);
    expect(score).toBeGreaterThan(0.7); // Similar moods
    expect(score).toBeLessThan(1.0); // Not identical
  });

  it('should handle partial overlap', () => {
    const track = { happy: 0.8, energetic: 0.5 };
    const target = { happy: 0.7, calm: 0.3 };
    const score = moodSimilarity(track, target);
    expect(score).toBeGreaterThan(0.5); // Some overlap (happy)
    expect(score).toBeLessThan(0.9);
  });

  it('should normalize to 0-1 range', () => {
    const track = { aggressive: 1.0 };
    const target = { peaceful: 1.0 };
    const score = moodSimilarity(track, target);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should be symmetric', () => {
    const vector1 = { happy: 0.8, calm: 0.2 };
    const vector2 = { happy: 0.6, energetic: 0.4 };
    const score1 = moodSimilarity(vector1, vector2);
    const score2 = moodSimilarity(vector2, vector1);
    expect(score1).toBeCloseTo(score2);
  });
});

describe('TIME_PROFILES', () => {
  it('should have profiles for all time windows', () => {
    expect(TIME_PROFILES.morning).toBeDefined();
    expect(TIME_PROFILES.afternoon).toBeDefined();
    expect(TIME_PROFILES.evening).toBeDefined();
  });

  it('should have required fields', () => {
    const profile = TIME_PROFILES.morning;
    expect(profile.preferredGenres).toBeInstanceOf(Array);
    expect(profile.energyTarget).toBeGreaterThanOrEqual(0);
    expect(profile.energyTarget).toBeLessThanOrEqual(1);
    expect(profile.moodTags).toBeInstanceOf(Array);
    expect(profile.boost).toBeGreaterThan(0);
  });

  it('should have increasing energy targets throughout day', () => {
    expect(TIME_PROFILES.morning.energyTarget).toBeLessThan(
      TIME_PROFILES.afternoon.energyTarget
    );
    expect(TIME_PROFILES.afternoon.energyTarget).toBeLessThan(
      TIME_PROFILES.evening.energyTarget
    );
  });
});

describe('explorationBoost', () => {
  const now = new Date('2025-01-15T12:00:00Z');

  it('should return 0.15 boost for never-played tracks', () => {
    const boost = explorationBoost(0, undefined, now);
    expect(boost).toBe(0.15);
  });

  it('should return 0.10 boost for low-playcount tracks (1-5 plays)', () => {
    expect(explorationBoost(1, undefined, now)).toBe(0.1);
    expect(explorationBoost(3, undefined, now)).toBe(0.1);
    expect(explorationBoost(5, undefined, now)).toBe(0.1);
  });

  it('should return 0 boost for high-playcount tracks (>5 plays)', () => {
    expect(explorationBoost(6, undefined, now)).toBe(0);
    expect(explorationBoost(10, undefined, now)).toBe(0);
    expect(explorationBoost(100, undefined, now)).toBe(0);
  });

  it('should add 0.05 boost for newly-added tracks (today)', () => {
    const addedToday = new Date('2025-01-15T10:00:00Z');
    const boost = explorationBoost(10, addedToday, now);
    expect(boost).toBeCloseTo(0.05, 2);
  });

  it('should combine never-played + newly-added boosts (max 0.20)', () => {
    const addedToday = new Date('2025-01-15T10:00:00Z');
    const boost = explorationBoost(0, addedToday, now);
    expect(boost).toBeCloseTo(0.20, 2);
  });

  it('should combine low-play + newly-added boosts', () => {
    const addedToday = new Date('2025-01-15T10:00:00Z');
    const boost = explorationBoost(3, addedToday, now);
    expect(boost).toBeCloseTo(0.15, 2); // 0.10 + 0.05
  });

  it('should decay newly-added boost linearly over 30 days', () => {
    const added15DaysAgo = new Date('2024-12-31T12:00:00Z'); // 15 days ago
    const boost = explorationBoost(10, added15DaysAgo, now);
    expect(boost).toBeCloseTo(0.025, 2); // 0.05 * (1 - 15/30) = 0.025
  });

  it('should return 0 boost for tracks added >30 days ago with high play count', () => {
    const added60DaysAgo = new Date('2024-11-16T12:00:00Z'); // 60 days ago
    const boost = explorationBoost(10, added60DaysAgo, now);
    expect(boost).toBe(0);
  });

  it('should return 0.15 boost for never-played tracks added long ago', () => {
    const addedYearAgo = new Date('2024-01-15T12:00:00Z'); // 1 year ago
    const boost = explorationBoost(0, addedYearAgo, now);
    expect(boost).toBe(0.15); // Only never-played boost
  });

  it('should handle missing addedAt date gracefully', () => {
    expect(explorationBoost(0, undefined, now)).toBe(0.15);
    expect(explorationBoost(3, undefined, now)).toBe(0.1);
    expect(explorationBoost(10, undefined, now)).toBe(0);
  });
});
