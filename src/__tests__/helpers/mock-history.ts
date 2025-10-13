/**
 * Mock HistoryResult helper for testing
 * Creates mock Plex history objects
 */

import type { HistoryResult } from '@ctrl/plex';
import { subDays } from 'date-fns';

export interface MockHistoryOptions {
  ratingKey?: string;
  title?: string;
  artist?: string;
  album?: string;
  viewedAt?: Date;
  userRating?: number; // 0-5 stars (will be converted to 0-10)
  lastViewedAt?: Date; // Most recent play (for throwback)
  genres?: string[];
  type?: string;
}

/**
 * Create a mock HistoryResult object with sensible defaults
 */
export function createMockHistoryResult(options: MockHistoryOptions = {}): HistoryResult {
  const {
    ratingKey = '1000',
    title = 'Test Track',
    artist = 'Test Artist',
    album = 'Test Album',
    viewedAt = new Date(),
    userRating = 0,
    lastViewedAt,
    genres = [],
    type = 'track'
  } = options;

  return {
    ratingKey,
    title,
    grandparentTitle: artist,
    parentTitle: album,
    type,
    viewedAt: viewedAt.getTime(),
    userRating: userRating * 2, // Convert 0-5 to 0-10 scale
    lastViewedAt: lastViewedAt?.getTime(),
    genres: genres.map(tag => ({ tag }))
  } as unknown as HistoryResult;
}

/**
 * Create a mock history entry for a track played N days ago
 */
export function createHistoryPlayedDaysAgo(
  ratingKey: string,
  daysAgo: number,
  options: Omit<MockHistoryOptions, 'ratingKey' | 'viewedAt'> = {}
): HistoryResult {
  return createMockHistoryResult({
    ...options,
    ratingKey,
    viewedAt: subDays(new Date(), daysAgo)
  });
}

/**
 * Create multiple history entries for the same track (simulating multiple plays)
 */
export function createMultiplePlayHistory(
  ratingKey: string,
  daysAgoList: number[],
  options: Omit<MockHistoryOptions, 'ratingKey' | 'viewedAt'> = {}
): HistoryResult[] {
  return daysAgoList.map(daysAgo =>
    createHistoryPlayedDaysAgo(ratingKey, daysAgo, options)
  );
}

/**
 * Create a batch of unique tracks with sequential IDs
 */
export function createHistoryBatch(
  count: number,
  daysAgo: number,
  options: Partial<MockHistoryOptions> = {}
): HistoryResult[] {
  return Array.from({ length: count }, (_, i) =>
    createHistoryPlayedDaysAgo(`${1000 + i}`, daysAgo, {
      title: `${options.title || 'Track'} ${i + 1}`,
      artist: options.artist || 'Test Artist',
      album: options.album || 'Test Album',
      userRating: options.userRating,
      genres: options.genres
    })
  );
}

/**
 * Create history for throwback testing (includes lastViewedAt)
 */
export function createThrowbackHistory(
  ratingKey: string,
  playedInWindowDaysAgo: number,
  mostRecentPlayDaysAgo: number,
  options: Omit<MockHistoryOptions, 'ratingKey' | 'viewedAt' | 'lastViewedAt'> = {}
): HistoryResult {
  return createMockHistoryResult({
    ...options,
    ratingKey,
    viewedAt: subDays(new Date(), playedInWindowDaysAgo),
    lastViewedAt: subDays(new Date(), mostRecentPlayDaysAgo)
  });
}
