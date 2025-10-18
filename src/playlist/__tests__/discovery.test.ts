/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Track } from '@ctrl/plex';
import { fetchDiscoveryTracks, getDiscoveryStats } from '../discovery.js';
import type { DiscoveryTrack } from '../discovery.js';
import {
  createHistoryPlayedDaysAgo,
  createHistoryBatch,
  createMultiplePlayHistory,
  mockPlexServer,
  createMockDatabaseWithCacheUpdate,
  createMockTrack,
  createTrackMap
} from '../../__tests__/helpers/index.js';

// Mock dependencies at file level (required by vitest)
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../config.js', () => ({
  APP_ENV: {
    PLAYLIST_TARGET_SIZE: 50,
    DISCOVERY_DAYS: 90
  }
}));

vi.mock('../../plex/client.js');
vi.mock('../../plex/tracks.js');
vi.mock('../../db/index.js');
vi.mock('../../scoring/strategies.js');

import { getPlexServer } from '../../plex/client.js';
import { fetchTracksByRatingKeys } from '../../plex/tracks.js';
import { getDb } from '../../db/index.js';
import { calculateScore } from '../../scoring/strategies.js';

describe('fetchDiscoveryTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue(createMockDatabaseWithCacheUpdate() as any);
    vi.mocked(calculateScore).mockReturnValue({
      finalScore: 0.5,
      components: { metadata: { recencyPenalty: 0.5, qualityScore: 0.5 } }
    } as any);
  });

  it('fetches and scores tracks last played >90 days ago', async () => {
    const history = [createHistoryPlayedDaysAgo('1', 100, { title: 'Old Song', artist: 'Artist A', userRating: 4, genres: ['Rock'] })];
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '1', title: 'Old Song', artistName: 'Artist A', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchDiscoveryTracks(50, 90, 20000, false);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('1');
    expect(results[0].daysSincePlay).toBeGreaterThanOrEqual(90);
  });

  it('filters out tracks played recently (< minDaysSincePlay)', async () => {
    const history = [createHistoryPlayedDaysAgo('1', 30, { userRating: 4 })]; // 30 days < 90
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Should throw error when all tracks are filtered out
    await expect(fetchDiscoveryTracks(50, 90, 20000, false)).rejects.toThrow(
      /Insufficient tracks for discovery playlist/
    );
  });

  it('aggregates multiple plays of same track', async () => {
    const history = createMultiplePlayHistory('1', [100, 120, 150], { title: 'Song', artist: 'Artist', userRating: 4, genres: ['Rock'] });
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '1', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchDiscoveryTracks(50, 90, 20000, false);

    expect(results).toHaveLength(1);
    expect(results[0].playCount).toBe(3);
  });

  it('filters out unrated tracks with < 3 plays', async () => {
    const history = createMultiplePlayHistory('1', [100, 120], { userRating: 0 }); // Unrated, only 2 plays
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Should throw error when all tracks are filtered out
    await expect(fetchDiscoveryTracks(50, 90, 20000, false)).rejects.toThrow(
      /No listening history found for discovery playlist/
    );
  });

  it('includes unrated tracks with >= 3 plays', async () => {
    const history = createMultiplePlayHistory('1', [100, 120, 140], { title: 'Popular Unrated', userRating: 0 });
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '1', title: 'Popular Unrated', viewCount: 3 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchDiscoveryTracks(50, 90, 20000, false);

    expect(results).toHaveLength(1);
    expect(results[0].playCount).toBe(3);
  });

  it('filters out tracks with very low discovery score', async () => {
    const history = [createHistoryPlayedDaysAgo('1', 100, { userRating: 1 })];
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    vi.mocked(calculateScore).mockReturnValue({
      finalScore: 0.05, // Below 0.1 threshold
      components: { metadata: { recencyPenalty: 0.05, qualityScore: 0.1 } }
    } as any);

    // Should throw error when all tracks are filtered out
    await expect(fetchDiscoveryTracks(50, 90, 20000, false)).rejects.toThrow(
      /No listening history found for discovery playlist/
    );
  });

  it('sorts results by discovery score descending', async () => {
    const history = [
      createHistoryPlayedDaysAgo('1', 100, { title: 'Low Score', userRating: 2 }),
      createHistoryPlayedDaysAgo('2', 100, { title: 'High Score', artist: 'Artist B', userRating: 5 })
    ];
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const tracks = [
      createMockTrack({ ratingKey: '1', userRating: 4 }),
      createMockTrack({ ratingKey: '2', userRating: 10 })
    ];
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap(tracks));

    vi.mocked(calculateScore)
      .mockReturnValueOnce({ finalScore: 0.3, components: { metadata: { recencyPenalty: 0.3, qualityScore: 0.3 } } } as any)
      .mockReturnValueOnce({ finalScore: 0.8, components: { metadata: { recencyPenalty: 0.8, qualityScore: 0.8 } } } as any);

    const results = await fetchDiscoveryTracks(50, 90, 20000, false);

    expect(results[0].ratingKey).toBe('2'); // Higher score first
    expect(results[0].discoveryScore).toBeGreaterThan(results[1].discoveryScore);
  });

  it('fetches history with pagination', async () => {
    const page1 = createHistoryBatch(500, 100, { userRating: 4 });
    const page2 = createHistoryBatch(100, 100, { userRating: 4 });

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2)
        .mockResolvedValue([]) // Always return empty after pages
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const tracks = [...page1, ...page2].map((h) =>
      createMockTrack({ ratingKey: h.ratingKey, userRating: 8 })
    );
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap(tracks));

    await fetchDiscoveryTracks(50, 90, 20000, false);

    // Should call twice: page1 (500), page2 (100)
    // Stops after page2 since 100 < 500 (pageSize)
    expect(server.history).toHaveBeenCalledTimes(2);
  });

  it('respects maxHistoryEntries limit', async () => {
    const largePage = createHistoryBatch(500, 100, { userRating: 4 });

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(largePage) // First call: 500 items
        .mockResolvedValueOnce(largePage) // Second call: 500 items (total 1000, hits limit)
        .mockResolvedValue([]) // Shouldn't be called
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Provide enough tracks to avoid "no candidates" error
    const tracks = largePage.slice(0, 50).map((h) =>
      createMockTrack({ ratingKey: h.ratingKey, userRating: 8 })
    );
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap(tracks));

    await fetchDiscoveryTracks(50, 90, 1000, false); // maxHistoryEntries = 1000

    expect(server.history).toHaveBeenCalledTimes(2); // Should stop after 1000 entries
  });

  it('throws error when no candidates found', async () => {
    const server = mockPlexServer().withEmptyHistory().build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    await expect(fetchDiscoveryTracks(50, 90, 20000, false)).rejects.toThrow(
      'No listening history found for discovery playlist'
    );
  });

  it('throws error when insufficient tracks (all recently played)', async () => {
    const history = createHistoryBatch(2, 30, { userRating: 4 }); // All < 90 days
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    await expect(fetchDiscoveryTracks(50, 90, 20000, false)).rejects.toThrow(
      /Insufficient tracks for discovery playlist/
    );
  });

  it('skips non-track history items', async () => {
    const history = [
      { ...createHistoryPlayedDaysAgo('1', 100, { title: 'Album' }), type: 'album' },
      createHistoryPlayedDaysAgo('2', 100, { title: 'Track', userRating: 4 })
    ];
    const server = mockPlexServer().withHistory(history as any).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '2', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchDiscoveryTracks(50, 90, 20000, false);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('2');
  });

  it('handles tracks that fail to fetch', async () => {
    const history = [
      createHistoryPlayedDaysAgo('1', 100, { userRating: 4 }),
      createHistoryPlayedDaysAgo('2', 100, { userRating: 4 })
    ];
    const server = mockPlexServer().withHistory(history).build();
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Only track 1 fetched successfully
    const track = createMockTrack({ ratingKey: '1', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchDiscoveryTracks(50, 90, 20000, false);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('1');
  });
});

describe('getDiscoveryStats', () => {
  function createDiscoveryTrack(
    ratingKey: string,
    lastPlayedAt: Date | null,
    daysSincePlay: number | null,
    userRating: number = 0
  ): DiscoveryTrack {
    return {
      ratingKey,
      title: 'Track',
      artist: 'Artist',
      album: 'Album',
      track: { userRating: userRating * 2 } as Track,
      finalScore: 0.5,
      recencyWeight: 0.5,
      fallbackScore: 0.5,
      lastPlayedAt,
      daysSincePlay,
      discoveryScore: 0.5,
      playCount: 1
    };
  }

  it('calculates statistics for discovery tracks', () => {
    const tracks: DiscoveryTrack[] = [
      createDiscoveryTrack('1', new Date('2024-10-01'), 100, 4),
      createDiscoveryTrack('2', new Date('2024-09-01'), 130, 5),
      createDiscoveryTrack('3', null, null, 0),
      createDiscoveryTrack('4', new Date('2024-11-01'), 70, 0)
    ];

    const stats = getDiscoveryStats(tracks);

    expect(stats.neverPlayed).toBe(1);
    expect(stats.forgotten).toBe(2); // > 90 days
    expect(stats.ratedTracks).toBe(2);
    expect(stats.unratedTracks).toBe(2);
    expect(stats.avgDaysSincePlay).toBeCloseTo((100 + 130 + 70) / 3, 0);
  });

  it('handles empty track list', () => {
    const stats = getDiscoveryStats([]);
    expect(stats.avgDaysSincePlay).toBeNull();
  });

  it('counts forgotten tracks (>90 days)', () => {
    const tracks: DiscoveryTrack[] = [
      createDiscoveryTrack('1', new Date('2024-10-01'), 95, 4),
      createDiscoveryTrack('2', new Date('2024-11-01'), 50, 5)
    ];

    const stats = getDiscoveryStats(tracks);
    expect(stats.forgotten).toBe(1);
  });
});
