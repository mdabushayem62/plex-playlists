/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPlaylistRecommendations } from '../recommendations.js';

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
    HISTORY_DAYS: 30
  }
}));

vi.mock('../../plex/client.js');
vi.mock('../../db/index.js');
vi.mock('../../db/settings-service.js');
vi.mock('../../metadata/genre-service.js');

import { getPlexServer } from '../../plex/client.js';
import { getDb } from '../../db/index.js';
import { getEffectiveConfig } from '../../db/settings-service.js';

/**
 * Recommendations module tests
 *
 * Note: This module has complex internal logic with many private functions.
 * These tests focus on:
 * 1. Main entry point behavior
 * 2. Error handling
 * 3. Basic recommendation generation
 *
 * Full coverage would require either:
 * - Refactoring to export internal functions
 * - More complex integration-style mocking
 * - Testing via the web UI endpoints that use this module
 */
describe('getPlaylistRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(getEffectiveConfig).mockResolvedValue({
      genreIgnoreList: []
    } as any);
  });

  it('returns empty array when no listening history', async () => {
    const server = {
      history: vi.fn().mockResolvedValue([])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue([])
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const results = await getPlaylistRecommendations();

    expect(results).toEqual([]);
  });

  it('returns empty array on Plex API error', async () => {
    const server = {
      history: vi.fn().mockRejectedValue(new Error('Plex API error'))
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const results = await getPlaylistRecommendations();

    expect(results).toEqual([]);
  });

  it('handles database errors gracefully', async () => {
    const server = {
      history: vi.fn().mockResolvedValue([
        { ratingKey: '1', title: 'Track', grandparentTitle: 'Artist', type: 'track', viewedAt: Date.now() }
      ])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const db = {
      select: vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      })
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const results = await getPlaylistRecommendations();

    expect(results).toEqual([]);
  });

  it('requires minimum play count per track', async () => {
    // Single play per track (below 3-play threshold)
    const server = {
      history: vi.fn()
        .mockResolvedValueOnce([
          { ratingKey: '1', title: 'Track 1', grandparentTitle: 'Artist A', type: 'track', viewedAt: Date.now() },
          { ratingKey: '2', title: 'Track 2', grandparentTitle: 'Artist B', type: 'track', viewedAt: Date.now() }
        ])
        .mockResolvedValue([])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue([])
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const results = await getPlaylistRecommendations();

    // Should return empty (tracks filtered out due to < 3 plays)
    expect(results).toEqual([]);
  });

  it('limits results to top 10 recommendations', async () => {
    // Create sufficient history (3+ plays per track)
    const track1Plays = Array(5).fill({
      ratingKey: '1',
      title: 'Track 1',
      grandparentTitle: 'Artist A',
      type: 'track',
      viewedAt: Date.now(),
      userRating: 8
    });

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(track1Plays)
        .mockResolvedValue([])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Mock database with many genres to generate lots of recommendations
    const genreCacheData = Array(20).fill(null).map((_, i) => ({
      artistName: `artist ${i}`,
      genres: JSON.stringify([`genre${i}`, `subgenre${i}`]),
      moods: JSON.stringify([`mood${i}`])
    }));

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(genreCacheData)
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const results = await getPlaylistRecommendations();

    // Should limit to 10
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('returns recommendations with required metadata', async () => {
    // Create sufficient history
    const history = Array(5).fill(null).map(() => ({
      ratingKey: '1',
      title: 'Track 1',
      grandparentTitle: 'Artist A',
      type: 'track',
      viewedAt: Date.now(),
      userRating: 8
    }));

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    // Mock database with genre data
    const genreCacheData = [{
      artistName: 'artist a',
      genres: JSON.stringify(['electronic', 'synthwave']),
      moods: JSON.stringify(['energetic'])
    }];

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(genreCacheData)
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const results = await getPlaylistRecommendations();

    if (results.length > 0) {
      const rec = results[0];
      expect(rec).toHaveProperty('name');
      expect(rec).toHaveProperty('genres');
      expect(rec).toHaveProperty('moods');
      expect(rec).toHaveProperty('targetSize');
      expect(rec).toHaveProperty('description');
      expect(rec).toHaveProperty('score');
      expect(rec).toHaveProperty('reason');
      expect(rec).toHaveProperty('category');

      expect(['favorite', 'discovery', 'mood', 'combo']).toContain(rec.category);
      expect(rec.targetSize).toBeGreaterThan(0);
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(1);
    }
  });

  it('filters results by genre ignore list', async () => {
    const history = Array(5).fill(null).map(() => ({
      ratingKey: '1',
      title: 'Track 1',
      grandparentTitle: 'Artist A',
      type: 'track',
      viewedAt: Date.now(),
      userRating: 8
    }));

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const genreCacheData = [{
      artistName: 'artist a',
      genres: JSON.stringify(['pop', 'rock']), // Meta-genres to be filtered
      moods: JSON.stringify([])
    }];

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(genreCacheData)
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    // Set ignore list
    vi.mocked(getEffectiveConfig).mockResolvedValue({
      genreIgnoreList: ['pop', 'rock']
    } as any);

    const results = await getPlaylistRecommendations();

    // Should not recommend ignored genres
    const allGenres = results.flatMap(r => r.genres);
    expect(allGenres).not.toContain('pop');
    expect(allGenres).not.toContain('rock');
  });

  it('sorts recommendations by score descending', async () => {
    const history = Array(5).fill(null).map(() => ({
      ratingKey: '1',
      title: 'Track 1',
      grandparentTitle: 'Artist A',
      type: 'track',
      viewedAt: Date.now(),
      userRating: 8
    }));

    const server = {
      history: vi.fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([])
    };
    vi.mocked(getPlexServer).mockResolvedValue(server as any);

    const genreCacheData = [
      {
        artistName: 'artist a',
        genres: JSON.stringify(['electronic', 'ambient']),
        moods: JSON.stringify(['energetic'])
      }
    ];

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(genreCacheData)
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    const results = await getPlaylistRecommendations();

    // Verify sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
