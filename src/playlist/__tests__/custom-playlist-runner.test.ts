/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, type TestDbContext } from '../../__tests__/helpers/test-db.js';
import * as schema from '../../db/schema.js';
import type { CandidateTrack } from '../candidate-builder.js';

// Create a mock db that we can configure per test
let mockDb: any = null;

// Mock only external dependencies (Plex API, logger, database)
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../db/index.js', () => ({
  getDb: () => mockDb
}));

vi.mock('../../plex/playlists.js');
vi.mock('../../plex/client.js');
vi.mock('../../history/history-service.js');
vi.mock('../cache-candidate-builder.js');

import { createAudioPlaylist, updatePlaylistSummary } from '../../plex/playlists.js';
import { fetchHistoryForWindow } from '../../history/history-service.js';
import { buildQualityCandidatesFromCache } from '../cache-candidate-builder.js';
import {
  validateCustomPlaylistConfig,
  customPlaylistNameExists,
  generateCustomPlaylist,
  generateAllCustomPlaylists
} from '../custom-playlist-runner.js';

describe('validateCustomPlaylistConfig', () => {
  it('validates required name', () => {
    const result = validateCustomPlaylistConfig({
      name: '',
      genres: ['electronic'],
      moods: []
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Name is required');
  });

  it('requires at least one genre or mood', () => {
    const result = validateCustomPlaylistConfig({
      name: 'Test Playlist',
      genres: [],
      moods: []
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('At least one genre or mood is required');
  });

  it('limits genres to maximum of 2', () => {
    const result = validateCustomPlaylistConfig({
      name: 'Test Playlist',
      genres: ['electronic', 'ambient', 'synthwave'],
      moods: []
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 2 genres allowed');
  });

  it('limits moods to maximum of 2', () => {
    const result = validateCustomPlaylistConfig({
      name: 'Test Playlist',
      genres: [],
      moods: ['energetic', 'upbeat', 'chill']
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 2 moods allowed');
  });

  it('validates target size range', () => {
    const tooSmall = validateCustomPlaylistConfig({
      name: 'Test Playlist',
      genres: ['electronic'],
      moods: [],
      targetSize: 5
    });

    const tooLarge = validateCustomPlaylistConfig({
      name: 'Test Playlist',
      genres: ['electronic'],
      moods: [],
      targetSize: 250
    });

    expect(tooSmall.valid).toBe(false);
    expect(tooSmall.error).toContain('Target size must be between 10 and 200');
    expect(tooLarge.valid).toBe(false);
    expect(tooLarge.error).toContain('Target size must be between 10 and 200');
  });

  it('validates scoring strategy', () => {
    const result = validateCustomPlaylistConfig({
      name: 'Test Playlist',
      genres: ['electronic'],
      moods: [],
      scoringStrategy: 'invalid' as any
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid scoring strategy');
  });

  it('accepts valid configuration', () => {
    const result = validateCustomPlaylistConfig({
      name: 'My Electronic Mix',
      genres: ['electronic', 'ambient'],
      moods: ['energetic'],
      targetSize: 50,
      scoringStrategy: 'quality'
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts configuration with only genres', () => {
    const result = validateCustomPlaylistConfig({
      name: 'Electronic Only',
      genres: ['electronic'],
      moods: []
    });

    expect(result.valid).toBe(true);
  });

  it('accepts configuration with only moods', () => {
    const result = validateCustomPlaylistConfig({
      name: 'Energetic Only',
      genres: [],
      moods: ['energetic']
    });

    expect(result.valid).toBe(true);
  });
});

describe('customPlaylistNameExists (integration)', () => {
  let ctx: TestDbContext;

  beforeEach(() => {
    ctx = createTestDb();
    mockDb = ctx.db;
  });

  afterEach(() => {
    closeTestDb(ctx);
    mockDb = null;
  });

  it('returns false when name does not exist', async () => {
    const exists = await customPlaylistNameExists('New Playlist');
    expect(exists).toBe(false);
  });

  it('returns true when name exists', async () => {
    // Insert a playlist
    ctx.db.insert(schema.customPlaylists).values({
      name: 'Existing Playlist',
      genres: JSON.stringify(['electronic']),
      moods: JSON.stringify([]),
      enabled: true,
      targetSize: 50,
      scoringStrategy: 'quality'
    }).run();

    const exists = await customPlaylistNameExists('Existing Playlist');
    expect(exists).toBe(true);
  });

  it('excludes current playlist when checking for updates', async () => {
    // Insert a playlist
    const result = ctx.db.insert(schema.customPlaylists).values({
      name: 'My Playlist',
      genres: JSON.stringify(['electronic']),
      moods: JSON.stringify([]),
      enabled: true,
      targetSize: 50,
      scoringStrategy: 'quality'
    }).returning().get();

    // Same playlist ID should return false (updating itself)
    const exists = await customPlaylistNameExists('My Playlist', result.id);
    expect(exists).toBe(false);

    // Different ID should return true
    const existsOtherId = await customPlaylistNameExists('My Playlist', 999);
    expect(existsOtherId).toBe(true);
  });
});

describe('generateCustomPlaylist (integration)', () => {
  let ctx: TestDbContext;

  beforeEach(() => {
    ctx = createTestDb();
    mockDb = ctx.db;
    vi.clearAllMocks();

    // Default mock for history service
    vi.mocked(fetchHistoryForWindow).mockResolvedValue([]);
  });

  afterEach(() => {
    closeTestDb(ctx);
    mockDb = null;
  });

  it('throws error when playlist not found', async () => {
    await expect(generateCustomPlaylist({ playlistId: 999 })).rejects.toThrow(
      'Custom playlist 999 not found'
    );
  });

  it('throws error when no tracks match filters', async () => {
    // Insert a playlist config
    const playlist = ctx.db.insert(schema.customPlaylists).values({
      name: 'Empty Playlist',
      genres: JSON.stringify(['nonexistent']),
      moods: JSON.stringify([]),
      enabled: true,
      targetSize: 50,
      scoringStrategy: 'quality'
    }).returning().get();

    // Mock cache builder returning no candidates
    vi.mocked(buildQualityCandidatesFromCache).mockResolvedValue([]);

    await expect(generateCustomPlaylist({ playlistId: playlist.id })).rejects.toThrow(
      'No tracks found matching the specified genres and moods'
    );
  });

  it('generates playlist successfully with cache candidates', async () => {
    // Insert a playlist config
    const playlist = ctx.db.insert(schema.customPlaylists).values({
      name: 'Test Electronic Mix',
      genres: JSON.stringify(['electronic']),
      moods: JSON.stringify([]),
      enabled: true,
      targetSize: 10,
      scoringStrategy: 'quality'
    }).returning().get();

    // Mock candidates from cache
    const mockCandidates: CandidateTrack[] = Array.from({ length: 10 }, (_, i) => ({
      ratingKey: `${i + 1}`,
      title: `Track ${i + 1}`,
      artist: `Artist ${i + 1}`,
      album: `Album ${i + 1}`,
      track: {
        ratingKey: `${i + 1}`,
        title: `Track ${i + 1}`,
        grandparentTitle: `Artist ${i + 1}`,
        parentTitle: `Album ${i + 1}`,
        duration: 180000,
        Genre: [{ tag: 'electronic' }]
      } as any,
      finalScore: 0.8 - i * 0.01,
      playCount: 10,
      lastPlayedAt: null,
      recencyWeight: 0.5,
      fallbackScore: 0.5
    }));

    vi.mocked(buildQualityCandidatesFromCache).mockResolvedValue(mockCandidates);
    vi.mocked(createAudioPlaylist).mockResolvedValue({ ratingKey: '12345' } as any);
    vi.mocked(updatePlaylistSummary).mockResolvedValue(undefined);

    await generateCustomPlaylist({ playlistId: playlist.id });

    // Verify Plex API calls
    expect(createAudioPlaylist).toHaveBeenCalledWith(
      '🎵 Test Electronic Mix',
      expect.stringContaining('10 tracks'),
      expect.any(Array)
    );

    expect(updatePlaylistSummary).toHaveBeenCalledWith('12345', {
      title: '🎵 Test Electronic Mix',
      summary: expect.stringContaining('Genres: electronic')
    });

    // Verify database persistence
    const savedPlaylists = ctx.db.select().from(schema.playlists).all();
    expect(savedPlaylists).toHaveLength(1);
    expect(savedPlaylists[0].window).toContain('custom-test-electronic-mix');
    expect(savedPlaylists[0].plexRatingKey).toBe('12345');

    const savedTracks = ctx.db.select().from(schema.playlistTracks).all();
    expect(savedTracks).toHaveLength(10);
  });

  it('records job completion on success', async () => {
    const playlist = ctx.db.insert(schema.customPlaylists).values({
      name: 'Test Playlist',
      genres: JSON.stringify(['electronic']),
      moods: JSON.stringify([]),
      enabled: true,
      targetSize: 5,
      scoringStrategy: 'quality'
    }).returning().get();

    const mockCandidates: CandidateTrack[] = Array.from({ length: 5 }, (_, i) => ({
      ratingKey: `${i + 1}`,
      title: `Track ${i + 1}`,
      artist: 'Artist',
      album: 'Album',
      track: { ratingKey: `${i + 1}`, duration: 180000, Genre: [{ tag: 'electronic' }] } as any,
      finalScore: 0.8,
      playCount: 10,
      lastPlayedAt: null,
      recencyWeight: 0.5,
      fallbackScore: 0.5
    }));

    vi.mocked(buildQualityCandidatesFromCache).mockResolvedValue(mockCandidates);
    vi.mocked(createAudioPlaylist).mockResolvedValue({ ratingKey: '12345' } as any);
    vi.mocked(updatePlaylistSummary).mockResolvedValue(undefined);

    await generateCustomPlaylist({ playlistId: playlist.id });

    // Verify job was recorded
    const jobs = ctx.db.select().from(schema.jobRuns).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('success');
    expect(jobs[0].window).toContain('custom-test-playlist');
  });

  it('records job completion on error', async () => {
    const playlist = ctx.db.insert(schema.customPlaylists).values({
      name: 'Failing Playlist',
      genres: JSON.stringify(['electronic']),
      moods: JSON.stringify([]),
      enabled: true,
      targetSize: 50,
      scoringStrategy: 'quality'
    }).returning().get();

    // Mock error from cache builder
    vi.mocked(buildQualityCandidatesFromCache).mockRejectedValue(new Error('Cache error'));

    await expect(generateCustomPlaylist({ playlistId: playlist.id })).rejects.toThrow();

    // Verify job was recorded as failed
    const jobs = ctx.db.select().from(schema.jobRuns).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].error).toBeTruthy();
  });
});

describe('generateAllCustomPlaylists (integration)', () => {
  let ctx: TestDbContext;

  beforeEach(() => {
    ctx = createTestDb();
    mockDb = ctx.db;
    vi.clearAllMocks();

    vi.mocked(fetchHistoryForWindow).mockResolvedValue([]);
  });

  afterEach(() => {
    closeTestDb(ctx);
    mockDb = null;
  });

  it('generates all enabled playlists', async () => {
    // Insert two enabled playlists
    ctx.db.insert(schema.customPlaylists).values([
      {
        name: 'Playlist 1',
        genres: JSON.stringify(['electronic']),
        moods: JSON.stringify([]),
        enabled: true,
        targetSize: 5,
        scoringStrategy: 'quality'
      },
      {
        name: 'Playlist 2',
        genres: JSON.stringify(['rock']),
        moods: JSON.stringify([]),
        enabled: true,
        targetSize: 5,
        scoringStrategy: 'quality'
      }
    ]).run();

    const mockCandidates: CandidateTrack[] = Array.from({ length: 5 }, (_, i) => ({
      ratingKey: `${i + 1}`,
      title: `Track ${i + 1}`,
      artist: 'Artist',
      album: 'Album',
      track: { ratingKey: `${i + 1}`, duration: 180000, Genre: [{ tag: 'test' }] } as any,
      finalScore: 0.8,
      playCount: 10,
      lastPlayedAt: null,
      recencyWeight: 0.5,
      fallbackScore: 0.5
    }));

    vi.mocked(buildQualityCandidatesFromCache).mockResolvedValue(mockCandidates);
    vi.mocked(createAudioPlaylist).mockResolvedValue({ ratingKey: '12345' } as any);
    vi.mocked(updatePlaylistSummary).mockResolvedValue(undefined);

    const result = await generateAllCustomPlaylists();

    expect(result.successful).toBe(2);
    expect(result.failed).toBe(0);

    // Verify both playlists were created
    const savedPlaylists = ctx.db.select().from(schema.playlists).all();
    expect(savedPlaylists).toHaveLength(2);
  });

  it('continues on individual playlist failures', async () => {
    // Insert two playlists
    ctx.db.insert(schema.customPlaylists).values([
      {
        name: 'Failing Playlist',
        genres: JSON.stringify(['electronic']),
        moods: JSON.stringify([]),
        enabled: true,
        targetSize: 5,
        scoringStrategy: 'quality'
      },
      {
        name: 'Working Playlist',
        genres: JSON.stringify(['rock']),
        moods: JSON.stringify([]),
        enabled: true,
        targetSize: 5,
        scoringStrategy: 'quality'
      }
    ]).run();

    const mockCandidates: CandidateTrack[] = Array.from({ length: 5 }, (_, i) => ({
      ratingKey: `${i + 1}`,
      title: `Track ${i + 1}`,
      artist: 'Artist',
      album: 'Album',
      track: { ratingKey: `${i + 1}`, duration: 180000, Genre: [{ tag: 'test' }] } as any,
      finalScore: 0.8,
      playCount: 10,
      lastPlayedAt: null,
      recencyWeight: 0.5,
      fallbackScore: 0.5
    }));

    // First call fails, second succeeds
    vi.mocked(buildQualityCandidatesFromCache)
      .mockRejectedValueOnce(new Error('First playlist failed'))
      .mockResolvedValueOnce(mockCandidates);

    vi.mocked(createAudioPlaylist).mockResolvedValue({ ratingKey: '12345' } as any);
    vi.mocked(updatePlaylistSummary).mockResolvedValue(undefined);

    const result = await generateAllCustomPlaylists();

    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);

    // Verify one playlist was created
    const savedPlaylists = ctx.db.select().from(schema.playlists).all();
    expect(savedPlaylists).toHaveLength(1);
    expect(savedPlaylists[0].window).toContain('working-playlist');
  });

  it('returns zeros when no enabled playlists', async () => {
    // Insert disabled playlist only
    ctx.db.insert(schema.customPlaylists).values({
      name: 'Disabled Playlist',
      genres: JSON.stringify(['electronic']),
      moods: JSON.stringify([]),
      enabled: false,
      targetSize: 50,
      scoringStrategy: 'quality'
    }).run();

    const result = await generateAllCustomPlaylists();

    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
  });
});
