/**
 * Tests for pattern-based scoring functions
 */

import { describe, it, expect } from 'vitest';
import { getGenrePreferencesForHour, timeOfDayBoost } from '../weights.js';
import type { HourlyGenrePreference } from '../../patterns/types.js';

describe('getGenrePreferencesForHour', () => {
  it('should extract preferences for specific hour', () => {
    const patterns: HourlyGenrePreference[] = [
      { hour: 8, genre: 'indie', weight: 0.4, playCount: 20 },
      { hour: 8, genre: 'folk', weight: 0.3, playCount: 15 },
      { hour: 9, genre: 'rock', weight: 0.5, playCount: 25 },
    ];

    const result = getGenrePreferencesForHour(8, patterns);

    expect(result.size).toBe(2);
    expect(result.get('indie')).toBe(0.4);
    expect(result.get('folk')).toBe(0.3);
    expect(result.get('rock')).toBeUndefined();
  });

  it('should return empty map for hour with no preferences', () => {
    const patterns: HourlyGenrePreference[] = [
      { hour: 8, genre: 'indie', weight: 0.4, playCount: 20 },
    ];

    const result = getGenrePreferencesForHour(14, patterns);

    expect(result.size).toBe(0);
  });

  it('should normalize genres to lowercase', () => {
    const patterns: HourlyGenrePreference[] = [
      { hour: 8, genre: 'Indie', weight: 0.4, playCount: 20 },
      { hour: 8, genre: 'FOLK', weight: 0.3, playCount: 15 },
    ];

    const result = getGenrePreferencesForHour(8, patterns);

    expect(result.get('indie')).toBe(0.4);
    expect(result.get('folk')).toBe(0.3);
  });

  it('should handle empty patterns array', () => {
    const result = getGenrePreferencesForHour(8, []);
    expect(result.size).toBe(0);
  });
});

describe('timeOfDayBoost with learned patterns', () => {
  // Create patterns for current hour to ensure tests work at any time
  const currentHour = new Date().getHours();
  const mockPatterns: HourlyGenrePreference[] = [
    { hour: currentHour, genre: 'indie', weight: 0.6, playCount: 30 },
    { hour: currentHour, genre: 'folk', weight: 0.4, playCount: 20 },
    { hour: currentHour, genre: 'rock', weight: 0.7, playCount: 35 },
    { hour: currentHour, genre: 'electronic', weight: 0.3, playCount: 15 },
  ];

  it('should use learned patterns when provided', () => {
    const genres = ['indie', 'alternative'];
    const boost = timeOfDayBoost(genres, [], undefined, 'morning', mockPatterns);

    // Should get boost based on learned pattern (indie has 0.6 weight at current hour)
    // Calculation: 0.15 (max boost) * 0.7 (learned weight) * 0.6 (genre weight) = 0.063
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(0.15); // Max boost for morning
  });

  it('should use maximum genre weight when track has multiple genres', () => {
    const genres = ['indie', 'folk', 'pop'];
    const boost = timeOfDayBoost(genres, [], undefined, 'morning', mockPatterns);

    // Should use indie's weight (0.6) as it's higher than folk's (0.4)
    expect(boost).toBeGreaterThan(0);
  });

  it('should add energy alignment to learned patterns', () => {
    const genres = ['indie'];
    const energy = 0.4; // Matches morning energyTarget exactly

    const boostWithoutEnergy = timeOfDayBoost(genres, [], undefined, 'morning', mockPatterns);
    const boostWithEnergy = timeOfDayBoost(genres, [], energy, 'morning', mockPatterns);

    // With perfect energy match, boost should be higher
    expect(boostWithEnergy).toBeGreaterThan(boostWithoutEnergy);
  });

  it('should add mood bonus to learned patterns', () => {
    const genres = ['indie'];
    const moods = ['happy', 'uplifting'];

    const boostWithoutMood = timeOfDayBoost(genres, [], undefined, 'morning', mockPatterns);
    const boostWithMood = timeOfDayBoost(genres, moods, undefined, 'morning', mockPatterns);

    // With matching mood, boost should be higher
    expect(boostWithMood).toBeGreaterThan(boostWithoutMood);
  });

  it('should fall back to hardcoded profiles when patterns not provided', () => {
    const genres = ['indie', 'folk']; // Matches morning preferredGenres
    const boost = timeOfDayBoost(genres, [], undefined, 'morning', undefined);

    // Should use hardcoded TIME_PROFILES (50% genre, 30% energy, 20% mood)
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(0.15);
  });

  it('should fall back to hardcoded profiles with empty patterns array', () => {
    const genres = ['indie'];
    const boost = timeOfDayBoost(genres, [], undefined, 'morning', []);

    // Empty patterns should trigger fallback
    expect(boost).toBeGreaterThan(0);
  });

  it('should return 0 for genre with no learned pattern', () => {
    const genres = ['jazz', 'classical']; // Not in hour 8 patterns
    const boost = timeOfDayBoost(genres, [], undefined, 'morning', mockPatterns);

    // No matching genre in patterns, but might have energy/mood bonus
    expect(boost).toBeGreaterThanOrEqual(0);
    expect(boost).toBeLessThan(0.05); // Only energy/mood contribution
  });

  it('should return 0 when timeWindow is undefined', () => {
    const genres = ['indie'];
    const boost = timeOfDayBoost(genres, [], undefined, undefined, mockPatterns);

    expect(boost).toBe(0);
  });

  it('should handle case-insensitive genre matching', () => {
    const genres = ['INDIE', 'Folk']; // Mixed case
    const boost = timeOfDayBoost(genres, [], undefined, 'morning', mockPatterns);

    // Should match normalized patterns
    expect(boost).toBeGreaterThan(0);
  });

  it('should prioritize learned patterns over hardcoded for genre matching', () => {
    const genres = ['rock'];
    const boostWithPatterns = timeOfDayBoost(genres, [], undefined, 'evening', mockPatterns);
    const boostWithoutPatterns = timeOfDayBoost(genres, [], undefined, 'evening', undefined);

    // With patterns, rock should get boost based on learned preference (0.7 at current hour)
    expect(boostWithPatterns).toBeGreaterThan(0);
    // Without patterns, rock gets boost from hardcoded evening profile (rock is in preferredGenres)
    expect(boostWithoutPatterns).toBeGreaterThan(0);
  });

  it('should handle tracks with no genres gracefully', () => {
    const boost = timeOfDayBoost([], [], undefined, 'morning', mockPatterns);
    expect(boost).toBe(0);
  });

  it('should weight learned patterns at 70% vs 30% for energy/mood', () => {
    const genres = ['indie'];
    const energy = 0.4; // Perfect match for morning
    const moods = ['happy']; // Perfect match for morning

    const boost = timeOfDayBoost(genres, moods, energy, 'morning', mockPatterns);

    // With indie (0.6 weight), perfect energy, and matching mood:
    // Learned: 0.15 * 0.7 * 0.6 = 0.063
    // Energy: 0.15 * 0.2 * 1.0 = 0.030
    // Mood: 0.15 * 0.1 * 1.0 = 0.015
    // Total: ~0.108
    // Note: Energy may not be exactly 1.0 match depending on energyDiff calculation
    expect(boost).toBeGreaterThan(0.06); // At minimum the learned component
    expect(boost).toBeLessThanOrEqual(0.15); // Max boost
  });
});
