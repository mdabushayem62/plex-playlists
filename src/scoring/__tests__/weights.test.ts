import { describe, it, expect } from 'vitest';
import { recencyWeight, normalizeStarRating, normalizePlayCount, fallbackScore } from '../weights.js';

describe('recencyWeight', () => {
  it('returns 1 for null last played date', () => {
    expect(recencyWeight(null)).toBe(1);
  });

  it('returns exponential decay for recent plays', () => {
    const now = new Date('2025-01-15T12:00:00Z');

    // Today (0 days ago) - should have maximum weight (1.0)
    const today = new Date('2025-01-15T10:00:00Z');
    expect(recencyWeight(today, now)).toBeCloseTo(1, 1);

    // 7 days ago (one half-life) - should be ~0.5
    const sevenDaysAgo = new Date('2025-01-08T12:00:00Z');
    expect(recencyWeight(sevenDaysAgo, now)).toBeCloseTo(0.5, 1);

    // 14 days ago (two half-lives) - should be ~0.25
    const fourteenDaysAgo = new Date('2025-01-01T12:00:00Z');
    expect(recencyWeight(fourteenDaysAgo, now)).toBeCloseTo(0.25, 1);

    // 30 days ago - should be very low
    const thirtyDaysAgo = new Date('2024-12-16T12:00:00Z');
    const weight30 = recencyWeight(thirtyDaysAgo, now);
    expect(weight30).toBeLessThan(0.1);
    expect(weight30).toBeGreaterThan(0);
  });

  it('handles same-day plays correctly', () => {
    const now = new Date('2025-01-15T18:00:00Z');
    const morning = new Date('2025-01-15T08:00:00Z');

    // Same calendar day should have 0 days difference = maximum weight
    expect(recencyWeight(morning, now)).toBeCloseTo(1, 1);
  });

  it('handles future dates gracefully', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    const future = new Date('2025-01-20T12:00:00Z');

    // Should use max(0, days) internally
    expect(recencyWeight(future, now)).toBe(1);
  });
});

describe('normalizeStarRating', () => {
  it('returns 0.5 for null/undefined rating', () => {
    expect(normalizeStarRating(undefined)).toBe(0.5);
    expect(normalizeStarRating(null as unknown as undefined)).toBe(0.5);
  });

  it('converts 5-star scale to 0-1 scale', () => {
    expect(normalizeStarRating(0)).toBe(0);
    expect(normalizeStarRating(2.5)).toBe(0.5);
    expect(normalizeStarRating(5)).toBe(1);
  });

  it('handles half-star ratings', () => {
    expect(normalizeStarRating(3.5)).toBe(0.7);
    expect(normalizeStarRating(4.5)).toBe(0.9);
  });

  it('clamps values outside 0-5 range', () => {
    expect(normalizeStarRating(-1)).toBe(0);
    expect(normalizeStarRating(10)).toBe(1);
  });
});

describe('normalizePlayCount', () => {
  it('returns 0 for null/undefined/zero play count', () => {
    expect(normalizePlayCount(undefined)).toBe(0);
    expect(normalizePlayCount(0)).toBe(0);
    expect(normalizePlayCount(-5)).toBe(0);
  });

  it('saturates at configured threshold', () => {
    // Default saturation is 25
    expect(normalizePlayCount(25)).toBe(1);
    expect(normalizePlayCount(50)).toBe(1); // Capped at 1
  });

  it('returns proportional values below saturation', () => {
    // Default saturation is 25
    expect(normalizePlayCount(12.5)).toBe(0.5);
    expect(normalizePlayCount(6.25)).toBe(0.25);
  });

  it('handles single play', () => {
    // With saturation of 25, 1 play = 1/25 = 0.04
    expect(normalizePlayCount(1)).toBeCloseTo(0.04, 2);
  });
});

describe('fallbackScore', () => {
  it('combines rating and play count with 60/40 weighting', () => {
    // 5 stars (1.0 normalized) + 25 plays (1.0 normalized)
    // = 0.6 * 1.0 + 0.4 * 1.0 = 1.0
    expect(fallbackScore(5, 25)).toBe(1.0);

    // 0 stars (0.0 normalized) + 0 plays (0.0 normalized)
    // = 0.6 * 0.0 + 0.4 * 0.0 = 0.0
    expect(fallbackScore(0, 0)).toBe(0);
  });

  it('defaults to neutral baseline with no rating or plays', () => {
    // No rating = 0.5, no plays = 0.0
    // = 0.6 * 0.5 + 0.4 * 0.0 = 0.3
    expect(fallbackScore(undefined, 0)).toBe(0.3);
    expect(fallbackScore(undefined, undefined)).toBe(0.3);
  });

  it('weights star rating more heavily than play count', () => {
    // 5 stars, 0 plays = 0.6 * 1.0 + 0.4 * 0.0 = 0.6
    const highRating = fallbackScore(5, 0);

    // 0 stars, 25 plays = 0.6 * 0.0 + 0.4 * 1.0 = 0.4
    const highPlays = fallbackScore(0, 25);

    expect(highRating).toBeGreaterThan(highPlays);
  });

  it('handles realistic scenarios', () => {
    // 4 stars (0.8), 10 plays (0.4 normalized)
    // = 0.6 * 0.8 + 0.4 * 0.4 = 0.48 + 0.16 = 0.64
    expect(fallbackScore(4, 10)).toBeCloseTo(0.64, 2);

    // 3.5 stars (0.7), 5 plays (0.2 normalized)
    // = 0.6 * 0.7 + 0.4 * 0.2 = 0.42 + 0.08 = 0.50
    expect(fallbackScore(3.5, 5)).toBeCloseTo(0.50, 2);
  });
});

describe('integration: scoring pipeline', () => {
  it('produces expected scores for typical track scenarios', () => {
    const now = new Date('2025-01-15T12:00:00Z');

    // Recently played, highly rated track
    const recent = new Date('2025-01-14T12:00:00Z');
    const recentWeight = recencyWeight(recent, now);
    const recentFallback = fallbackScore(5, 20);
    const recentFinal = recentWeight * 0.7 + recentFallback * 0.3;
    expect(recentFinal).toBeGreaterThan(0.3); // Should score well

    // Old track, low rating
    const old = new Date('2024-12-01T12:00:00Z');
    const oldWeight = recencyWeight(old, now);
    const oldFallback = fallbackScore(2, 5);
    const oldFinal = oldWeight * 0.7 + oldFallback * 0.3;
    expect(oldFinal).toBeLessThan(0.3); // Should score poorly

    // Balance: moderate recency, good rating
    const moderate = new Date('2025-01-08T12:00:00Z'); // 7 days ago
    const moderateWeight = recencyWeight(moderate, now);
    const moderateFallback = fallbackScore(4, 15);
    const moderateFinal = moderateWeight * 0.7 + moderateFallback * 0.3;
    expect(moderateFinal).toBeGreaterThan(0.4);
    expect(moderateFinal).toBeLessThan(0.6);
  });
});
