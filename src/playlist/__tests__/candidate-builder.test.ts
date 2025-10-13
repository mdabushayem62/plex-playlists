import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Track } from '@ctrl/plex';
import { buildCandidateTracks, candidateFromTrack, getGenre } from '../candidate-builder.js';
import type { AggregatedHistory } from '../../history/aggregate.js';

// Mock logger to suppress logs during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock genre enrichment service
vi.mock('../../genre-enrichment.js', () => ({
  getEnrichedGenres: vi.fn().mockResolvedValue([]),
  getEnrichedAlbumGenres: vi.fn().mockResolvedValue([]),
  getEnrichedMoods: vi.fn().mockResolvedValue([]),
  getEnrichedAlbumMoods: vi.fn().mockResolvedValue([]),
  getGenreEnrichmentService: vi.fn().mockReturnValue({
    getGenresForArtist: vi.fn().mockResolvedValue([]),
    getGenresForAlbum: vi.fn().mockResolvedValue([]),
    getMoodsForArtist: vi.fn().mockResolvedValue([]),
    getMoodsForAlbum: vi.fn().mockResolvedValue([])
  })
}));

// Mock the Plex tracks module
vi.mock('../../plex/tracks.js', () => ({
  fetchTracksByRatingKeys: vi.fn()
}));

import { fetchTracksByRatingKeys } from '../../plex/tracks.js';

// Helper to create mock Track objects
function createMockTrack(
  ratingKey: string,
  title: string,
  artist: string,
  album: string,
  genre?: string,
  userRating?: number,
  viewCount?: number
): Track {
  return {
    ratingKey,
    title,
    grandparentTitle: artist,
    parentTitle: album,
    genres: genre ? [{ tag: genre }] : undefined,
    userRating,
    viewCount,
  } as Track;
}

describe('getGenre', () => {
  it('returns genre tag from first genre', async () => {
    const track = createMockTrack('1', 'Song', 'Artist', 'Album', 'Rock');
    expect(await getGenre(track)).toBe('Rock');
  });

  it('returns undefined when no genres', async () => {
    const track = createMockTrack('1', 'Song', 'Artist', 'Album');
    expect(await getGenre(track)).toBeUndefined();
  });

  it('returns undefined when genres array is empty', async () => {
    const track = { genres: [] } as unknown as Track;
    expect(await getGenre(track)).toBeUndefined();
  });
});

describe('candidateFromTrack', () => {
  it('builds candidate with correct scoring', async () => {
    const track = createMockTrack('123', 'Test Song', 'Test Artist', 'Test Album', 'Rock', 5, 10);
    const history = {
      playCount: 10,
      lastPlayedAt: new Date('2025-01-15T12:00:00Z')
    };

    const candidate = await candidateFromTrack(track, history);

    expect(candidate.ratingKey).toBe('123');
    expect(candidate.title).toBe('Test Song');
    expect(candidate.artist).toBe('Test Artist');
    expect(candidate.album).toBe('Test Album');
    expect(candidate.genre).toBe('Rock');
    expect(candidate.playCount).toBe(10);
    expect(candidate.lastPlayedAt).toEqual(history.lastPlayedAt);
  });

  it('calculates final score as 70% recency + 30% fallback', async () => {
    const track = createMockTrack('123', 'Song', 'Artist', 'Album', 'Rock', 5, 25);

    // Use null lastPlayedAt to get recency weight of 1.0
    const candidate = await candidateFromTrack(track, {
      playCount: 25,
      lastPlayedAt: null
    });

    // Recency weight for null = 1.0
    // Fallback: 5 stars (1.0) + 25 plays (1.0) = 0.6*1.0 + 0.4*1.0 = 1.0
    // Final: 0.7 * 1.0 + 0.3 * 1.0 = 0.7 + 0.3 = 1.0
    expect(candidate.recencyWeight).toBe(1.0);
    expect(candidate.fallbackScore).toBe(1.0);
    expect(candidate.finalScore).toBeCloseTo(1.0, 10);
  });

  it('handles null last played date', async () => {
    const track = createMockTrack('123', 'Song', 'Artist', 'Album', undefined, 3, 5);
    const candidate = await candidateFromTrack(track, {
      playCount: 5,
      lastPlayedAt: null
    });

    expect(candidate.recencyWeight).toBe(1);
    expect(candidate.lastPlayedAt).toBeNull();
  });

  it('uses "Unknown Artist" for missing artist', async () => {
    const track = { ratingKey: '123', title: 'Song' } as Track;
    const candidate = await candidateFromTrack(track, { playCount: 1, lastPlayedAt: null });

    expect(candidate.artist).toBe('Unknown Artist');
  });

  it('uses "Untitled Track" for missing title', async () => {
    const track = { ratingKey: '123', grandparentTitle: 'Artist' } as Track;
    const candidate = await candidateFromTrack(track, { playCount: 1, lastPlayedAt: null });

    expect(candidate.title).toBe('Untitled Track');
  });

  it('sets album to undefined when missing', async () => {
    const track = { ratingKey: '123', title: 'Song', grandparentTitle: 'Artist' } as Track;
    const candidate = await candidateFromTrack(track, { playCount: 1, lastPlayedAt: null });

    expect(candidate.album).toBeUndefined();
  });
});

describe('buildCandidateTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty history', async () => {
    const result = await buildCandidateTracks([]);
    expect(result).toEqual([]);
  });

  it('builds candidates from history and fetched tracks', async () => {
    const history: AggregatedHistory[] = [
      { ratingKey: '1', playCount: 10, lastPlayedAt: new Date('2025-01-15T10:00:00Z') },
      { ratingKey: '2', playCount: 5, lastPlayedAt: new Date('2025-01-14T10:00:00Z') }
    ];

    const tracksMap = new Map<string, Track>([
      ['1', createMockTrack('1', 'Song A', 'Artist A', 'Album A', 'Rock', 5, 10)],
      ['2', createMockTrack('2', 'Song B', 'Artist B', 'Album B', 'Pop', 4, 5)]
    ]);

    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(tracksMap);

    const result = await buildCandidateTracks(history);

    expect(result).toHaveLength(2);
    expect(result[0].ratingKey).toBe('1');
    expect(result[0].title).toBe('Song A');
    expect(result[0].playCount).toBe(10);
    expect(result[1].ratingKey).toBe('2');
    expect(result[1].title).toBe('Song B');
    expect(result[1].playCount).toBe(5);
  });

  it('sorts candidates by final score descending', async () => {
    const history: AggregatedHistory[] = [
      { ratingKey: '1', playCount: 1, lastPlayedAt: new Date('2025-01-01T10:00:00Z') }, // Old, low score
      { ratingKey: '2', playCount: 20, lastPlayedAt: new Date('2025-01-15T10:00:00Z') } // Recent, high score
    ];

    const tracksMap = new Map<string, Track>([
      ['1', createMockTrack('1', 'Old Song', 'Artist', 'Album', 'Rock', 2, 1)],
      ['2', createMockTrack('2', 'New Song', 'Artist', 'Album', 'Rock', 5, 20)]
    ]);

    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(tracksMap);

    const result = await buildCandidateTracks(history);

    // Result should be sorted by finalScore descending
    expect(result[0].ratingKey).toBe('2'); // Higher score first
    expect(result[1].ratingKey).toBe('1');
    expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore);
  });

  it('skips tracks not found in Plex', async () => {
    const history: AggregatedHistory[] = [
      { ratingKey: '1', playCount: 10, lastPlayedAt: new Date('2025-01-15T10:00:00Z') },
      { ratingKey: '2', playCount: 5, lastPlayedAt: new Date('2025-01-14T10:00:00Z') },
      { ratingKey: '3', playCount: 3, lastPlayedAt: new Date('2025-01-13T10:00:00Z') }
    ];

    // Only return tracks 1 and 3
    const tracksMap = new Map<string, Track>([
      ['1', createMockTrack('1', 'Song A', 'Artist A', 'Album A', 'Rock', 5, 10)],
      ['3', createMockTrack('3', 'Song C', 'Artist C', 'Album C', 'Jazz', 4, 3)]
    ]);

    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(tracksMap);

    const result = await buildCandidateTracks(history);

    // Track 2 should be skipped
    expect(result).toHaveLength(2);
    expect(result.map(c => c.ratingKey)).not.toContain('2');
    expect(result.map(c => c.ratingKey)).toContain('1');
    expect(result.map(c => c.ratingKey)).toContain('3');
  });

  it('calls fetchTracksByRatingKeys with correct rating keys', async () => {
    const history: AggregatedHistory[] = [
      { ratingKey: 'key1', playCount: 1, lastPlayedAt: new Date() },
      { ratingKey: 'key2', playCount: 2, lastPlayedAt: new Date() }
    ];

    vi.mocked(fetchTracksByRatingKeys).mockResolvedValue(new Map());

    await buildCandidateTracks(history);

    expect(fetchTracksByRatingKeys).toHaveBeenCalledWith(['key1', 'key2']);
  });
});
