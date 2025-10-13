/**
 * Mock Track helper for testing
 * Creates mock Track objects that match @ctrl/plex Track interface
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Track } from '@ctrl/plex';

export interface MockTrackOptions {
  ratingKey?: string;
  title?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  year?: number;
  userRating?: number | null;
  viewCount?: number;
  skipCount?: number;
  lastViewedAt?: number | null;
  genres?: Array<{ tag: string }>;
  moods?: Array<{ tag: string }>;
  addedAt?: number;
  index?: number;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
}

/**
 * Create a mock Track object with sensible defaults
 */
export function createMockTrack(options: MockTrackOptions = {}): Partial<Track> {
  const {
    ratingKey = '1000',
    title = 'Test Track',
    artistName = 'Test Artist',
    albumName = 'Test Album',
    duration = 180000, // 3 minutes in ms
    year = 2020,
    userRating = null,
    viewCount = 0,
    skipCount = 0,
    lastViewedAt = null,
    genres = [{ tag: 'Electronic' }, { tag: 'Synthwave' }],
    moods = [{ tag: 'Energetic' }],
    addedAt = Date.now(),
    index = 1,
    parentRatingKey = '100',
    grandparentRatingKey = '10'
  } = options;

  return {
    ratingKey,
    title,
    grandparentTitle: artistName, // Artist name stored in grandparentTitle
    parentTitle: albumName, // Album name stored in parentTitle
    duration,
    year,
    userRating: userRating ?? undefined,
    viewCount,
    skipCount,
    lastViewedAt: (lastViewedAt === null ? undefined : lastViewedAt) as any,
    genres: genres as any,
    moods: moods as any,
    addedAt: (addedAt === null ? undefined : addedAt) as any,
    index: index as any,
    parentRatingKey: parentRatingKey as any,
    grandparentRatingKey: grandparentRatingKey as any
  };
}

/**
 * Create multiple mock tracks with sequential IDs
 */
export function createMockTracks(count: number, options: Partial<MockTrackOptions> = {}): Array<Partial<Track>> {
  return Array.from({ length: count }, (_, i) => {
    return createMockTrack({
      ...options,
      ratingKey: `${1000 + i}`,
      title: `${options.title || 'Test Track'} ${i + 1}`,
      index: i + 1
    });
  });
}

/**
 * Create mock track with specific rating
 */
export function createHighRatedTrack(options: Partial<MockTrackOptions> = {}): Partial<Track> {
  return createMockTrack({
    ...options,
    userRating: options.userRating !== undefined ? options.userRating : 10
  });
}

/**
 * Create mock unplayed track
 */
export function createUnplayedTrack(options: Partial<MockTrackOptions> = {}): Partial<Track> {
  return createMockTrack({
    ...options,
    viewCount: 0,
    lastViewedAt: null
  });
}

/**
 * Create mock frequently played track
 */
export function createFrequentlyPlayedTrack(options: Partial<MockTrackOptions> = {}): Partial<Track> {
  return createMockTrack({
    ...options,
    viewCount: options.viewCount !== undefined ? options.viewCount : 50,
    lastViewedAt: options.lastViewedAt !== undefined ? options.lastViewedAt : Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days ago
  });
}

/**
 * Create mock track with specific genres
 */
export function createTrackWithGenres(genres: string[], options: Partial<MockTrackOptions> = {}): Partial<Track> {
  return createMockTrack({
    ...options,
    genres: genres.map(tag => ({ tag }))
  });
}

/**
 * Create mock track with specific moods
 */
export function createTrackWithMoods(moods: string[], options: Partial<MockTrackOptions> = {}): Partial<Track> {
  return createMockTrack({
    ...options,
    moods: moods.map(tag => ({ tag }))
  });
}
