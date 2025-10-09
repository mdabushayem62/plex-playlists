import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Track } from '@ctrl/plex';
import { expandWithSonicSimilarity } from '../sonic-expander.js';
import type { CandidateTrack } from '../candidate-builder.js';

// Mock logger to suppress warnings during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Helper to create mock candidate with mocked sonicallySimilar
function createMockCandidate(
  ratingKey: string,
  title: string,
  sonicallySimilarResult: Track[] = []
): CandidateTrack {
  const mockTrack = {
    ratingKey,
    title,
    grandparentTitle: 'Artist',
    parentTitle: 'Album',
    sonicallySimilar: vi.fn().mockResolvedValue(sonicallySimilarResult)
  } as unknown as Track;

  return {
    ratingKey,
    track: mockTrack,
    artist: 'Artist',
    album: 'Album',
    title,
    genre: 'Rock',
    recencyWeight: 0.5,
    fallbackScore: 0.5,
    playCount: 10,
    lastPlayedAt: new Date(),
    finalScore: 0.5
  };
}

// Helper to create mock similar Track
function createMockSimilarTrack(
  ratingKey: string,
  title: string,
  viewCount: number = 5
): Track {
  return {
    ratingKey,
    title,
    grandparentTitle: 'Similar Artist',
    parentTitle: 'Similar Album',
    viewCount,
    lastViewedAt: new Date()
  } as Track;
}

describe('expandWithSonicSimilarity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches sonically similar tracks from seeds', async () => {
    const similar1 = createMockSimilarTrack('101', 'Similar 1');
    const similar2 = createMockSimilarTrack('102', 'Similar 2');

    const seed = createMockCandidate('1', 'Seed Track', [similar1, similar2]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10
    });

    expect(seed.track.sonicallySimilar).toHaveBeenCalledWith(15, 0.25); // defaults
    expect(result).toHaveLength(2);
    expect(result[0].ratingKey).toBe('101');
    expect(result[1].ratingKey).toBe('102');
  });

  it('uses custom maxSeeds, perSeed, and maxDistance', async () => {
    const similar = createMockSimilarTrack('101', 'Similar');
    const seed = createMockCandidate('1', 'Seed', [similar]);

    await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10,
      maxSeeds: 5,
      perSeed: 20,
      maxDistance: 0.3
    });

    expect(seed.track.sonicallySimilar).toHaveBeenCalledWith(20, 0.3);
  });

  it('limits seeds to maxSeeds', async () => {
    const similar1 = createMockSimilarTrack('101', 'Similar 1');
    const similar2 = createMockSimilarTrack('102', 'Similar 2');
    const similar3 = createMockSimilarTrack('103', 'Similar 3');

    const seed1 = createMockCandidate('1', 'Seed 1', [similar1]);
    const seed2 = createMockCandidate('2', 'Seed 2', [similar2]);
    const seed3 = createMockCandidate('3', 'Seed 3', [similar3]);

    await expandWithSonicSimilarity({
      seeds: [seed1, seed2, seed3],
      exclude: new Set(),
      needed: 10,
      maxSeeds: 2
    });

    expect(seed1.track.sonicallySimilar).toHaveBeenCalled();
    expect(seed2.track.sonicallySimilar).toHaveBeenCalled();
    expect(seed3.track.sonicallySimilar).not.toHaveBeenCalled();
  });

  it('excludes tracks in exclude set', async () => {
    const similar1 = createMockSimilarTrack('101', 'Similar 1');
    const similar2 = createMockSimilarTrack('102', 'Similar 2');
    const similar3 = createMockSimilarTrack('103', 'Similar 3');

    const seed = createMockCandidate('1', 'Seed', [similar1, similar2, similar3]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(['102']), // Exclude similar2
      needed: 10
    });

    expect(result).toHaveLength(2);
    expect(result.map(c => c.ratingKey)).toEqual(['101', '103']);
  });

  it('deduplicates tracks across multiple seeds', async () => {
    const similar1 = createMockSimilarTrack('101', 'Similar 1');
    const similar2 = createMockSimilarTrack('101', 'Similar 1'); // Same track

    const seed1 = createMockCandidate('1', 'Seed 1', [similar1]);
    const seed2 = createMockCandidate('2', 'Seed 2', [similar2]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed1, seed2],
      exclude: new Set(),
      needed: 10
    });

    expect(result).toHaveLength(1); // Deduped
    expect(result[0].ratingKey).toBe('101');
  });

  it('skips tracks without ratingKey', async () => {
    const similar1 = { title: 'No Key' } as Track; // Missing ratingKey
    const similar2 = createMockSimilarTrack('102', 'Has Key');

    const seed = createMockCandidate('1', 'Seed', [similar1, similar2]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10
    });

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('102');
  });

  it('converts similar tracks to candidates correctly', async () => {
    const similar = createMockSimilarTrack('101', 'Similar Song', 15);
    const seed = createMockCandidate('1', 'Seed', [similar]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10
    });

    expect(result[0].title).toBe('Similar Song');
    expect(result[0].playCount).toBe(15); // From viewCount
    expect(result[0].artist).toBe('Similar Artist');
  });

  it('handles tracks with no viewCount', async () => {
    const similar = {
      ratingKey: '101',
      title: 'Similar',
      grandparentTitle: 'Artist',
      viewCount: undefined
    } as Track;

    const seed = createMockCandidate('1', 'Seed', [similar]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10
    });

    expect(result[0].playCount).toBe(0);
  });

  it('handles tracks with no lastViewedAt', async () => {
    const similar = {
      ratingKey: '101',
      title: 'Similar',
      grandparentTitle: 'Artist',
      viewCount: 5,
      lastViewedAt: undefined
    } as Track;

    const seed = createMockCandidate('1', 'Seed', [similar]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10
    });

    expect(result[0].lastPlayedAt).toBeNull();
  });

  it('stops early when results reach 2x needed', async () => {
    // Create many similar tracks
    const manySimilars = Array.from({ length: 100 }, (_, i) =>
      createMockSimilarTrack(`${100 + i}`, `Similar ${i}`)
    );

    const seed = createMockCandidate('1', 'Seed', manySimilars);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(),
      needed: 10
    });

    // Should stop at 2x needed = 20
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('continues on error and logs warning', async () => {
    const similar1 = createMockSimilarTrack('101', 'Similar 1');
    const similar2 = createMockSimilarTrack('102', 'Similar 2');

    const failingSeed = createMockCandidate('1', 'Failing Seed');
    failingSeed.track.sonicallySimilar = vi.fn().mockRejectedValue(new Error('API error'));

    const workingSeed = createMockCandidate('2', 'Working Seed', [similar1, similar2]);

    const result = await expandWithSonicSimilarity({
      seeds: [failingSeed, workingSeed],
      exclude: new Set(),
      needed: 10
    });

    // Should continue despite error and get results from working seed
    expect(result).toHaveLength(2);
    expect(result[0].ratingKey).toBe('101');
  });

  it('returns empty array when no seeds', async () => {
    const result = await expandWithSonicSimilarity({
      seeds: [],
      exclude: new Set(),
      needed: 10
    });

    expect(result).toEqual([]);
  });

  it('returns empty array when all similars are excluded', async () => {
    const similar1 = createMockSimilarTrack('101', 'Similar 1');
    const similar2 = createMockSimilarTrack('102', 'Similar 2');

    const seed = createMockCandidate('1', 'Seed', [similar1, similar2]);

    const result = await expandWithSonicSimilarity({
      seeds: [seed],
      exclude: new Set(['101', '102']),
      needed: 10
    });

    expect(result).toEqual([]);
  });
});
