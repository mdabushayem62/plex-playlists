import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Track, MusicSection, Section, Library, PlexServer } from '@ctrl/plex';
import { fetchFallbackCandidates } from '../fallback.js';

// Mock the Plex client module
vi.mock('../../plex/client.js', () => ({
  getPlexServer: vi.fn()
}));

import { getPlexServer } from '../../plex/client.js';

// Helper to create mock tracks
function createMockTrack(
  ratingKey: string,
  title: string,
  artist: string,
  userRating: number,
  viewCount: number,
  lastViewedAt?: Date
): Track {
  return {
    ratingKey,
    title,
    grandparentTitle: artist,
    parentTitle: 'Album',
    userRating,
    viewCount,
    lastViewedAt,
  } as Track;
}

// Helper to create mock music section
function createMockMusicSection(tracks: Track[]): MusicSection {
  return {
    CONTENT_TYPE: 'audio',
    searchTracks: vi.fn().mockResolvedValue(tracks)
  } as unknown as MusicSection;
}

// Helper to create mock library with sections
function createMockLibrary(sections: Section[]): Library {
  return {
    sections: vi.fn().mockResolvedValue(sections)
  } as unknown as Library;
}

// Helper to create mock Plex server
function createMockServer(library: Library): PlexServer {
  return {
    library: vi.fn().mockResolvedValue(library)
  } as unknown as PlexServer;
}

describe('fetchFallbackCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches tracks sorted by user rating from music section', async () => {
    const tracks = [
      createMockTrack('1', 'Song A', 'Artist A', 5, 20),
      createMockTrack('2', 'Song B', 'Artist B', 4, 15),
      createMockTrack('3', 'Song C', 'Artist C', 3, 10)
    ];

    const musicSection = createMockMusicSection(tracks);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    expect(result).toHaveLength(3);
    expect(musicSection.searchTracks).toHaveBeenCalledWith({
      sort: 'userRating:desc',
      libtype: 'track',
      maxresults: 50 // 10 * FALLBACK_FETCH_MULTIPLIER (5)
    });
  });

  it('applies FALLBACK_FETCH_MULTIPLIER to search limit', async () => {
    const tracks = [createMockTrack('1', 'Song', 'Artist', 5, 10)];
    const musicSection = createMockMusicSection(tracks);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    await fetchFallbackCandidates(20, {}, false);

    expect(musicSection.searchTracks).toHaveBeenCalledWith({
      sort: 'userRating:desc',
      libtype: 'track',
      maxresults: 100 // 20 * 5
    });
  });

  it('sorts candidates by final score descending', async () => {
    const tracks = [
      createMockTrack('1', 'Low Rated', 'Artist', 2, 5),
      createMockTrack('2', 'High Rated', 'Artist', 5, 25),
      createMockTrack('3', 'Medium Rated', 'Artist', 3, 10)
    ];

    const musicSection = createMockMusicSection(tracks);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    // Should be sorted by finalScore descending
    expect(result[0].ratingKey).toBe('2'); // Highest rated
    expect(result[0].finalScore).toBeGreaterThan(result[1].finalScore);
    expect(result[1].finalScore).toBeGreaterThan(result[2].finalScore);
  });

  it('converts track viewCount to playCount', async () => {
    const tracks = [
      createMockTrack('1', 'Song', 'Artist', 5, 42)
    ];

    const musicSection = createMockMusicSection(tracks);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    expect(result[0].playCount).toBe(42);
  });

  it('handles tracks with no viewCount', async () => {
    const track = {
      ratingKey: '1',
      title: 'Song',
      grandparentTitle: 'Artist',
      userRating: 5,
      viewCount: undefined
    } as Track;

    const musicSection = createMockMusicSection([track]);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    expect(result[0].playCount).toBe(0);
  });

  it('handles tracks with no lastViewedAt', async () => {
    const track = {
      ratingKey: '1',
      title: 'Song',
      grandparentTitle: 'Artist',
      userRating: 5,
      viewCount: 10,
      lastViewedAt: undefined
    } as Track;

    const musicSection = createMockMusicSection([track]);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    expect(result[0].lastPlayedAt).toBeNull();
  });

  it('uses lastViewedAt when available', async () => {
    const viewedAt = new Date('2025-01-15T10:00:00Z');
    const tracks = [
      createMockTrack('1', 'Song', 'Artist', 5, 10, viewedAt)
    ];

    const musicSection = createMockMusicSection(tracks);
    const library = createMockLibrary([musicSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    expect(result[0].lastPlayedAt).toEqual(viewedAt);
  });

  it('throws error when no music section found', async () => {
    // Create a non-music section (e.g., movie section)
    const movieSection = {
      CONTENT_TYPE: 'video'
    } as Section;

    const library = createMockLibrary([movieSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    await expect(fetchFallbackCandidates(10, {}, false)).rejects.toThrow(
      'no music library section found for fallback selection'
    );
  });

  it('identifies music section correctly among multiple sections', async () => {
    const tracks = [createMockTrack('1', 'Song', 'Artist', 5, 10)];

    const movieSection = { CONTENT_TYPE: 'video' } as Section;
    const musicSection = createMockMusicSection(tracks);
    const photoSection = { CONTENT_TYPE: 'photo' } as Section;

    const library = createMockLibrary([movieSection, musicSection, photoSection]);
    const server = createMockServer(library);

    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchFallbackCandidates(10, {}, false);

    expect(result).toHaveLength(1);
    expect(musicSection.searchTracks).toHaveBeenCalled();
  });
});
