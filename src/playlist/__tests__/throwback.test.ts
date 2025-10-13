/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Track } from '@ctrl/plex';
import { fetchThrowbackTracks, getThrowbackStats } from '../throwback.js';
import type { ThrowbackTrack } from '../throwback.js';
import {
  createThrowbackHistory,
  createHistoryBatch,
  createMockDatabaseWithCacheUpdate,
  createMockTrack,
  createTrackMap
} from '../../__tests__/helpers/index.js';

// Mock dependencies at file level
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
    THROWBACK_LOOKBACK_START: 730, // 2 years
    THROWBACK_LOOKBACK_END: 1825, // 5 years
    THROWBACK_RECENT_EXCLUSION: 90
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

describe('fetchThrowbackTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue(createMockDatabaseWithCacheUpdate() as any);
    vi.mocked(calculateScore).mockReturnValue({
      finalScore: 0.5,
      components: { metadata: { nostalgiaWeight: 0.5, qualityScore: 0.5 } }
    } as any);
  });

  const createMockLibrary = (hasMusicSection = true) => ({
    sections: vi.fn().mockResolvedValue(
      hasMusicSection
        ? [{ CONTENT_TYPE: 'audio', key: 'music-1' }]
        : [{ CONTENT_TYPE: 'video', key: 'movies-1' }]
    )
  });

  it('fetches tracks from throwback window (2-5 years ago)', async () => {
    const history = [createThrowbackHistory('1', 1000, 1000, { title: 'Old Favorite', artist: 'Artist A', userRating: 5, genres: ['Rock'] })];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '1', title: 'Old Favorite', artistName: 'Artist A', userRating: 10 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('1');
    expect(results[0].title).toBe('Old Favorite');
  });

  it('excludes tracks played recently (< recentExclusion days)', async () => {
    // Played in window (1000 days ago) but replayed recently (30 days ago)
    const history = [createThrowbackHistory('1', 1000, 30, { userRating: 5 })];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    await expect(fetchThrowbackTracks(50, 730, 1825, 90)).rejects.toThrow(
      /No qualifying tracks found for throwback playlist/
    );
  });

  it('aggregates multiple plays in throwback window', async () => {
    const history = [
      createThrowbackHistory('1', 1000, 1000, { title: 'Song', artist: 'Artist', userRating: 4 }),
      createThrowbackHistory('1', 1100, 1000, { title: 'Song', artist: 'Artist', userRating: 4 }),
      createThrowbackHistory('1', 1200, 1000, { title: 'Song', artist: 'Artist', userRating: 4 })
    ];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '1', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toHaveLength(1);
    expect(results[0].playCountInWindow).toBe(3);
  });

  it('filters out tracks outside window (too recent)', async () => {
    // 500 days < 730 days (2 years)
    const history = [createThrowbackHistory('1', 500, 500, { userRating: 5 })];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    await expect(fetchThrowbackTracks(50, 730, 1825, 90)).rejects.toThrow(
      /No qualifying tracks found for throwback playlist/
    );
  });

  it('filters out tracks outside window (too old)', async () => {
    // 2000 days > 1825 days (5 years)
    const history = [createThrowbackHistory('1', 2000, 2000, { userRating: 5 })];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    await expect(fetchThrowbackTracks(50, 730, 1825, 90)).rejects.toThrow(
      /No qualifying tracks found for throwback playlist/
    );
  });

  it('filters out tracks with very low throwback score', async () => {
    const history = [createThrowbackHistory('1', 1000, 1000, { userRating: 1 })];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    vi.mocked(calculateScore).mockReturnValue({
      finalScore: 0.03, // Below 0.05 threshold
      components: { metadata: { nostalgiaWeight: 0.03, qualityScore: 0.1 } }
    } as any);

    await expect(fetchThrowbackTracks(50, 730, 1825, 90)).rejects.toThrow(
      /No qualifying tracks found for throwback playlist/
    );
  });

  it('sorts results by throwback score descending', async () => {
    const history = [
      createThrowbackHistory('1', 1000, 1000, { title: 'Low Score', userRating: 2 }),
      createThrowbackHistory('2', 1000, 1000, { title: 'High Score', artist: 'Artist B', userRating: 5 })
    ];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const tracks = [
      createMockTrack({ ratingKey: '1', userRating: 4 }),
      createMockTrack({ ratingKey: '2', userRating: 10 })
    ];
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap(tracks));

    vi.mocked(calculateScore)
      .mockReturnValueOnce({ finalScore: 0.3, components: { metadata: { nostalgiaWeight: 0.3, qualityScore: 0.3 } } } as any)
      .mockReturnValueOnce({ finalScore: 0.8, components: { metadata: { nostalgiaWeight: 0.8, qualityScore: 0.8 } } } as any);

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results[0].ratingKey).toBe('2'); // Higher score first
    expect(results[0].throwbackScore).toBeGreaterThan(results[1].throwbackScore);
  });

  it('handles pagination correctly', async () => {
    const page1 = createHistoryBatch(500, 1000, { userRating: 4 }).map(h =>
      createThrowbackHistory(h.ratingKey, 1000, 1000, { title: h.title, artist: h.grandparentTitle, userRating: 4 })
    );
    const page2 = createHistoryBatch(100, 1000, { userRating: 4 }).map(h =>
      createThrowbackHistory(h.ratingKey, 1000, 1000, { title: h.title, artist: h.grandparentTitle, userRating: 4 })
    );

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const tracks = [...page1, ...page2].map(h =>
      createMockTrack({ ratingKey: h.ratingKey, userRating: 8 })
    );
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap(tracks));

    await fetchThrowbackTracks(50, 730, 1825, 90);

    // Should call twice: page1 (500), page2 (100)
    // Stops after page2 since 100 < 500 (pageSize)
    expect(server.history).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when no music library section found', async () => {
    const server = {
      library: vi.fn().mockResolvedValue(createMockLibrary(false))
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toEqual([]);
  });

  it('throws error when no history found in window', async () => {
    const server = {
      history: vi.fn().mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    await expect(fetchThrowbackTracks(50, 730, 1825, 90)).rejects.toThrow(
      /No listening history found for throwback playlist/
    );
  });

  it('skips non-track history items', async () => {
    const history = [
      { ...createThrowbackHistory('1', 1000, 1000, { title: 'Album' }), type: 'album' },
      createThrowbackHistory('2', 1000, 1000, { title: 'Track', userRating: 4 })
    ];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history as any)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '2', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('2');
  });

  it('skips history items without ratingKey', async () => {
    const history = [
      { ...createThrowbackHistory('1', 1000, 1000, { title: 'Track' }), ratingKey: undefined },
      createThrowbackHistory('2', 1000, 1000, { title: 'Track', userRating: 4 })
    ];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history as any)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const track = createMockTrack({ ratingKey: '2', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('2');
  });

  it('handles tracks that fail to fetch', async () => {
    const history = [
      createThrowbackHistory('1', 1000, 1000, { userRating: 4 }),
      createThrowbackHistory('2', 1000, 1000, { userRating: 4 })
    ];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Only track 1 fetched successfully
    const track = createMockTrack({ ratingKey: '1', userRating: 8 });
    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(createTrackMap([track]));

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toHaveLength(1);
    expect(results[0].ratingKey).toBe('1');
  });

  it('returns empty array on error', async () => {
    const server = {
      history: vi.fn().mockRejectedValue(new Error('Plex API error')),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const results = await fetchThrowbackTracks(50, 730, 1825, 90);

    expect(results).toEqual([]);
  });

  it('uses most recent play date for filtering', async () => {
    // Played in window but recently replayed should be excluded
    const history = [
      createThrowbackHistory('1', 1000, 30, { userRating: 4 }) // mostRecentPlay = 30 days ago
    ];

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([]),
      library: vi.fn().mockResolvedValue(createMockLibrary())
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Should be filtered out because mostRecentPlay (30 days) < recentExclusion (90 days)
    await expect(fetchThrowbackTracks(50, 730, 1825, 90)).rejects.toThrow(
      /No qualifying tracks found for throwback playlist/
    );
  });
});

describe('getThrowbackStats', () => {
  function createThrowbackTrack(
    ratingKey: string,
    daysSincePlay: number,
    playCountInWindow: number,
    userRating: number = 0
  ): ThrowbackTrack {
    return {
      ratingKey,
      title: 'Track',
      artist: 'Artist',
      album: 'Album',
      track: { userRating: userRating * 2 } as Track,
      finalScore: 0.5,
      recencyWeight: 0.5,
      fallbackScore: 0.5,
      lastPlayedAt: new Date(),
      daysSincePlay,
      playCountInWindow,
      throwbackScore: 0.5,
      playCount: playCountInWindow
    };
  }

  it('calculates statistics for throwback tracks', () => {
    const tracks: ThrowbackTrack[] = [
      createThrowbackTrack('1', 800, 5, 4),
      createThrowbackTrack('2', 1000, 10, 5),
      createThrowbackTrack('3', 900, 3, 0),
      createThrowbackTrack('4', 700, 7, 3)
    ];

    const stats = getThrowbackStats(tracks);

    expect(stats.avgDaysSincePlay).toBe(Math.floor((800 + 1000 + 900 + 700) / 4));
    expect(stats.avgPlayCountInWindow).toBeCloseTo((5 + 10 + 3 + 7) / 4, 1);
    expect(stats.ratedTracks).toBe(3);
    expect(stats.unratedTracks).toBe(1);
    expect(stats.oldestTrack).toBe(1000);
    expect(stats.newestTrack).toBe(700);
  });

  it('handles empty track list', () => {
    const stats = getThrowbackStats([]);

    expect(stats.avgDaysSincePlay).toBe(0);
    expect(stats.avgPlayCountInWindow).toBe(0);
    expect(stats.ratedTracks).toBe(0);
    expect(stats.unratedTracks).toBe(0);
    expect(stats.oldestTrack).toBe(0);
    expect(stats.newestTrack).toBe(0);
  });

  it('distinguishes rated from unrated tracks', () => {
    const tracks: ThrowbackTrack[] = [
      createThrowbackTrack('1', 800, 5, 4),
      createThrowbackTrack('2', 800, 5, 0),
      createThrowbackTrack('3', 800, 5, 5)
    ];

    const stats = getThrowbackStats(tracks);

    expect(stats.ratedTracks).toBe(2);
    expect(stats.unratedTracks).toBe(1);
  });

  it('finds oldest and newest tracks correctly', () => {
    const tracks: ThrowbackTrack[] = [
      createThrowbackTrack('1', 1500, 5, 4), // Oldest
      createThrowbackTrack('2', 900, 5, 5),
      createThrowbackTrack('3', 750, 5, 3) // Newest
    ];

    const stats = getThrowbackStats(tracks);

    expect(stats.oldestTrack).toBe(1500);
    expect(stats.newestTrack).toBe(750);
  });

  it('calculates average play count in window', () => {
    const tracks: ThrowbackTrack[] = [
      createThrowbackTrack('1', 800, 10, 4),
      createThrowbackTrack('2', 800, 5, 5),
      createThrowbackTrack('3', 800, 15, 3)
    ];

    const stats = getThrowbackStats(tracks);

    expect(stats.avgPlayCountInWindow).toBeCloseTo(10, 0);
  });
});
