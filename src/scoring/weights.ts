import { differenceInCalendarDays } from 'date-fns';

import { APP_ENV } from '../config.js';

export const recencyWeight = (lastPlayed: Date | null, now: Date = new Date()): number => {
  if (!lastPlayed) {
    return 1;
  }
  const days = Math.max(differenceInCalendarDays(now, lastPlayed), 0);
  const halfLife = APP_ENV.HALF_LIFE_DAYS;
  if (halfLife <= 0) {
    return days === 0 ? 0 : 1;
  }
  const lambda = Math.log(2) / halfLife;
  return Math.exp(-lambda * days);
};

export const normalizeStarRating = (rating?: number): number => {
  if (rating == null) {
    return 0.5; // neutral baseline when no rating
  }
  // Plex star ratings: 1-5 (with halves). Convert to 0-1 scale.
  const clamped = Math.min(Math.max(rating, 0), 5);
  return clamped / 5;
};

export const normalizePlayCount = (count?: number): number => {
  if (!count || count <= 0) {
    return 0;
  }
  const saturation = Math.max(APP_ENV.PLAY_COUNT_SATURATION, 1);
  return Math.min(count / saturation, 1);
};

/**
 * Calculate skip penalty based on skip count and view count
 * Returns a multiplier (0.5-1.0) to penalize frequently-skipped tracks
 *
 * @param skipCount - Number of times track was skipped
 * @param viewCount - Number of times track was played
 * @param maxPenalty - Maximum penalty (0.5 = reduce score by 50% at worst)
 * @returns Penalty multiplier where 1.0 = no penalty, 0.5 = maximum penalty
 *
 * Examples:
 * - 0 skips, 10 plays → 1.0 (no penalty)
 * - 5 skips, 10 plays → 0.75 (25% penalty for 50% skip rate)
 * - 10 skips, 10 plays → 0.5 (50% penalty for 100% skip rate)
 */
export const skipPenalty = (
  skipCount?: number,
  viewCount?: number,
  maxPenalty: number = 0.5
): number => {
  // No penalty if no data or no skips
  if (!skipCount || skipCount <= 0 || !viewCount || viewCount <= 0) {
    return 1.0;
  }

  // Calculate skip rate (0.0 to 1.0+)
  const skipRate = skipCount / viewCount;

  // Apply penalty with cap (e.g., 50% skip rate = 25% penalty, 100% skip rate = 50% penalty)
  const penalty = Math.min(skipRate * maxPenalty, maxPenalty);

  return 1.0 - penalty;
};

export const fallbackScore = (rating?: number, playCount?: number): number => {
  const ratingComponent = normalizeStarRating(rating) * 0.6;
  const playCountComponent = normalizePlayCount(playCount) * 0.4;
  return ratingComponent + playCountComponent;
};
