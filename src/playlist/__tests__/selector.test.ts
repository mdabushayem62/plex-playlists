import { describe, it, expect } from 'vitest';
import { selectPlaylistTracks } from '../selector.js';
import type { CandidateTrack } from '../candidate-builder.js';
import type { Track } from '@ctrl/plex';

// Helper to create mock candidate tracks
function createMockCandidate(
  ratingKey: string,
  artist: string,
  genre: string | undefined,
  finalScore: number
): CandidateTrack {
  return {
    ratingKey,
    track: {} as Track, // Mock Track object
    artist,
    album: 'Test Album',
    title: `Track ${ratingKey}`,
    genre,
    recencyWeight: 0.5,
    fallbackScore: 0.5,
    playCount: 10,
    lastPlayedAt: new Date(),
    finalScore,
  };
}

describe('selectPlaylistTracks', () => {
  it('selects up to target count from candidates', () => {
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('2', 'Artist B', 'Pop', 0.9),
      createMockCandidate('3', 'Artist C', 'Rock', 0.8),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 2,
      maxPerArtist: 5,
      window: 'morning',
    });

    expect(result.selected).toHaveLength(2);
    expect(result.selected[0].ratingKey).toBe('1'); // Highest score
    expect(result.selected[1].ratingKey).toBe('2'); // Second highest
  });

  it('respects artist limit across multiple passes', () => {
    // When we have enough variety, artist limit should be respected
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('2', 'Artist A', 'Rock', 0.9),
      createMockCandidate('3', 'Artist B', 'Pop', 0.8),
      createMockCandidate('4', 'Artist B', 'Jazz', 0.7),
      createMockCandidate('5', 'Artist C', 'Rock', 0.6),
      createMockCandidate('6', 'Artist C', 'Pop', 0.5),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 6,
      maxPerArtist: 2,
      window: 'morning',
    });

    // With enough variety, each artist should have exactly 2 tracks
    const artistACount = result.selected.filter(t => t.artist === 'Artist A').length;
    const artistBCount = result.selected.filter(t => t.artist === 'Artist B').length;
    const artistCCount = result.selected.filter(t => t.artist === 'Artist C').length;

    expect(artistACount).toBe(2);
    expect(artistBCount).toBe(2);
    expect(artistCCount).toBe(2);
  });

  it('respects genre limit when sufficient variety exists', () => {
    // With targetCount=6 and MAX_GENRE_SHARE=0.4, max per genre = 2
    // Create 6 tracks across 3 genres
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('2', 'Artist B', 'Rock', 0.9),
      createMockCandidate('3', 'Artist C', 'Pop', 0.8),
      createMockCandidate('4', 'Artist D', 'Pop', 0.7),
      createMockCandidate('5', 'Artist E', 'Jazz', 0.6),
      createMockCandidate('6', 'Artist F', 'Jazz', 0.5),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 6,
      maxPerArtist: 5,
      window: 'morning',
    });

    // Each genre should have exactly 2 tracks
    const rockCount = result.selected.filter(t => t.genre === 'Rock').length;
    const popCount = result.selected.filter(t => t.genre === 'Pop').length;
    const jazzCount = result.selected.filter(t => t.genre === 'Jazz').length;

    expect(rockCount).toBe(2);
    expect(popCount).toBe(2);
    expect(jazzCount).toBe(2);
  });

  it('falls back to relaxed constraints when needed', () => {
    // All candidates are from same artist
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('2', 'Artist A', 'Rock', 0.9),
      createMockCandidate('3', 'Artist A', 'Rock', 0.8),
      createMockCandidate('4', 'Artist A', 'Rock', 0.7),
      createMockCandidate('5', 'Artist A', 'Rock', 0.6),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 5,
      maxPerArtist: 2,
      window: 'morning',
    });

    // Should relax artist constraint to fill playlist
    expect(result.selected).toHaveLength(5);
  });

  it('excludes tracks by rating key', () => {
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('2', 'Artist B', 'Pop', 0.9),
      createMockCandidate('3', 'Artist C', 'Rock', 0.8),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 3,
      maxPerArtist: 5,
      excludeRatingKeys: new Set(['2']),
      window: 'morning',
    });

    expect(result.selected).toHaveLength(2);
    expect(result.selected.find(t => t.ratingKey === '2')).toBeUndefined();
  });

  it('deduplicates tracks within selection', () => {
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('1', 'Artist A', 'Rock', 0.9), // Duplicate
      createMockCandidate('2', 'Artist B', 'Pop', 0.8),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 3,
      maxPerArtist: 5,
      window: 'morning',
    });

    expect(result.selected).toHaveLength(2);
    const ratingKeys = result.selected.map(t => t.ratingKey);
    expect(new Set(ratingKeys).size).toBe(2); // All unique
  });

  it('handles empty candidate list', () => {
    const result = selectPlaylistTracks([], {
      targetCount: 10,
      maxPerArtist: 2,
      window: 'morning',
    });

    expect(result.selected).toHaveLength(0);
    expect(result.remaining).toHaveLength(0);
  });

  it('returns remaining candidates', () => {
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', 'Rock', 1.0),
      createMockCandidate('2', 'Artist B', 'Pop', 0.9),
      createMockCandidate('3', 'Artist C', 'Rock', 0.8),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 2,
      maxPerArtist: 5,
      window: 'morning',
    });

    expect(result.selected).toHaveLength(2);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].ratingKey).toBe('3');
  });

  it('handles tracks without genre', () => {
    const candidates: CandidateTrack[] = [
      createMockCandidate('1', 'Artist A', undefined, 1.0),
      createMockCandidate('2', 'Artist B', undefined, 0.9),
      createMockCandidate('3', 'Artist C', 'Rock', 0.8),
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 3,
      maxPerArtist: 5,
      window: 'morning',
    });

    // Should handle undefined genres gracefully
    expect(result.selected).toHaveLength(3);
  });

  it('progressive relaxation: genre limit, then artist limit, then no limits', () => {
    // Create scenario where we need all three passes
    // 20 candidates, all from 2 artists, all same genre
    const candidates: CandidateTrack[] = Array.from({ length: 20 }, (_, i) =>
      createMockCandidate(
        `${i}`,
        i < 10 ? 'Artist A' : 'Artist B',
        'Rock',
        1.0 - i * 0.01
      )
    );

    const result = selectPlaylistTracks(candidates, {
      targetCount: 10,
      maxPerArtist: 2,
      window: 'morning',
    });

    // Pass 1: genre limit (4) + artist limit (2 per artist) = 4 tracks max
    // Pass 2: no genre limit + artist limit (2 per artist) = 4 tracks max
    // Pass 3: no limits = fill remaining up to 10
    expect(result.selected).toHaveLength(10);
  });

  it('processes candidates in input order (assumes pre-sorted)', () => {
    // Selector expects candidates pre-sorted by score descending
    const candidates: CandidateTrack[] = [
      createMockCandidate('2', 'Artist B', 'Pop', 0.9),  // Highest score
      createMockCandidate('3', 'Artist C', 'Rock', 0.7),
      createMockCandidate('1', 'Artist A', 'Rock', 0.5), // Lowest score
    ];

    const result = selectPlaylistTracks(candidates, {
      targetCount: 2,
      maxPerArtist: 5,
      window: 'morning',
    });

    // Should take first 2 in order
    expect(result.selected[0].ratingKey).toBe('2');
    expect(result.selected[1].ratingKey).toBe('3');
  });
});
