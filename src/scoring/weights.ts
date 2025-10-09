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

export const fallbackScore = (rating?: number, playCount?: number): number => {
  const ratingComponent = normalizeStarRating(rating) * 0.6;
  const playCountComponent = normalizePlayCount(playCount) * 0.4;
  return ratingComponent + playCountComponent;
};
