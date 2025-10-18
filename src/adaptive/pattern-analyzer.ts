/**
 * Pattern analyzer for detecting skip patterns
 * Analyzes skip history to detect genre fatigue and artist aversion
 *
 * Patterns detected:
 * 1. Genre fatigue: User skips 2+ tracks from same genre in time window
 * 2. Artist aversion: User skips 2+ tracks from same artist in time window
 * 3. Future: Mood shift, tempo mismatch, etc.
 */

import { logger } from '../logger.js';
import { getEffectiveConfig } from '../db/settings-service.js';
import type { SkipEvent, CompletionEvent } from './types.js';

/**
 * Adaptive action types
 */
export type AdaptiveAction =
  | { type: 'remove_genre'; genres: string[]; reason: string }
  | { type: 'remove_artist'; artists: string[]; reason: string }
  | { type: 'refill_similar'; seedTracks: string[]; reason: string };

/**
 * Pattern analyzer
 */
export class PatternAnalyzer {
  /**
   * Analyze skip history and generate adaptive actions
   */
  async analyze(
    skipHistory: SkipEvent[],
     
    _completionHistory: CompletionEvent[]
  ): Promise<AdaptiveAction[]> {
    const actions: AdaptiveAction[] = [];

    // Load config thresholds
    const config = await getEffectiveConfig();
    const patternWindowMs = config.adaptiveWindowMinutes * 60 * 1000;
    const minSkipCount = config.adaptiveMinSkipCount;
    const sensitivity = config.adaptiveSensitivity;

    // Filter recent skips within time window
    const now = Date.now();
    const recentSkips = skipHistory.filter(
      skip => now - skip.skippedAt.getTime() < patternWindowMs
    );

    if (recentSkips.length < minSkipCount) {
      return actions;
    }

    logger.debug(
      {
        totalSkips: skipHistory.length,
        recentSkips: recentSkips.length,
        windowMinutes: config.adaptiveWindowMinutes,
        minSkipCount
      },
      'analyzing skip patterns'
    );

    // Pattern 1: Genre fatigue
    const genreAction = this.detectGenreFatigue(recentSkips, minSkipCount, sensitivity, config.adaptiveWindowMinutes);
    if (genreAction) {
      actions.push(genreAction);
    }

    // Pattern 2: Artist aversion
    const artistAction = this.detectArtistAversion(recentSkips, minSkipCount, sensitivity, config.adaptiveWindowMinutes);
    if (artistAction) {
      actions.push(artistAction);
    }

    // Pattern 3: TODO - Mood shift detection (requires completion history analysis)
    // Pattern 4: TODO - Tempo mismatch detection (requires audio features)

    return actions;
  }

  /**
   * Detect genre fatigue: User skips multiple tracks from same genre
   */
  private detectGenreFatigue(
    recentSkips: SkipEvent[],
    minSkipCount: number,
    sensitivity: number,
    windowMinutes: number
  ): AdaptiveAction | null {
    // Count skips per genre
    const genreCounts = new Map<string, number>();

    recentSkips.forEach(skip => {
      skip.genres.forEach(genre => {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });
    });

    // Find genres exceeding threshold
    const threshold = this.calculateThreshold(minSkipCount, sensitivity);
    const fatigedGenres = Array.from(genreCounts.entries())
       
      .filter(([_genre, count]) => count >= threshold)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);

    if (fatigedGenres.length > 0) {
      const topGenre = fatigedGenres[0];

      logger.info(
        {
          genre: topGenre.genre,
          skipCount: topGenre.count,
          windowMinutes,
          threshold,
          sensitivity
        },
        'genre fatigue detected'
      );

      return {
        type: 'remove_genre',
        genres: [topGenre.genre],
        reason: `Skipped ${topGenre.count} ${topGenre.genre} tracks in last ${windowMinutes} minutes`
      };
    }

    return null;
  }

  /**
   * Detect artist aversion: User skips multiple tracks from same artist
   */
  private detectArtistAversion(
    recentSkips: SkipEvent[],
    minSkipCount: number,
    sensitivity: number,
    windowMinutes: number
  ): AdaptiveAction | null {
    // Count skips per artist
    const artistCounts = new Map<string, number>();

    recentSkips.forEach(skip => {
      skip.artists.forEach(artist => {
        artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      });
    });

    // Find artists exceeding threshold
    const threshold = this.calculateThreshold(minSkipCount, sensitivity);
    const avoidedArtists = Array.from(artistCounts.entries())
       
      .filter(([_artist, count]) => count >= threshold)
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count);

    if (avoidedArtists.length > 0) {
      const topArtist = avoidedArtists[0];

      logger.info(
        {
          artist: topArtist.artist,
          skipCount: topArtist.count,
          windowMinutes,
          threshold,
          sensitivity
        },
        'artist aversion detected'
      );

      return {
        type: 'remove_artist',
        artists: [topArtist.artist],
        reason: `Skipped ${topArtist.count} ${topArtist.artist} tracks in last ${windowMinutes} minutes`
      };
    }

    return null;
  }

  /**
   * Calculate skip threshold based on sensitivity
   * Sensitivity 1-10: Lower sensitivity = higher threshold (less aggressive)
   *
   * Examples:
   * - Sensitivity 1: threshold = minSkipCount * 2.0 (very conservative)
   * - Sensitivity 5: threshold = minSkipCount * 1.0 (default, balanced)
   * - Sensitivity 10: threshold = minSkipCount * 0.5 (very aggressive)
   */
  private calculateThreshold(minSkipCount: number, sensitivity: number): number {
    // Map sensitivity (1-10) to multiplier (2.0 - 0.5)
    // Formula: multiplier = 2.0 - (sensitivity - 1) * (1.5 / 9)
    const multiplier = 2.0 - ((sensitivity - 1) * 1.5) / 9;
    const threshold = minSkipCount * multiplier;

    // Ensure minimum threshold of 1
    return Math.max(1, Math.round(threshold));
  }

  /**
   * Analyze completion patterns for mood shift detection
   * TODO: Future enhancement
   */
  private detectMoodShift(
     
    _recentSkips: SkipEvent[],
     
    _completionHistory: CompletionEvent[]
  ): AdaptiveAction | null {
    // Placeholder for mood shift detection
    // Would analyze genre/mood transitions between completions and skips
    return null;
  }
}

/**
 * Singleton instance
 */
let patternAnalyzer: PatternAnalyzer | null = null;

/**
 * Get or create singleton pattern analyzer
 */
export function getPatternAnalyzer(): PatternAnalyzer {
  if (!patternAnalyzer) {
    patternAnalyzer = new PatternAnalyzer();
  }
  return patternAnalyzer;
}
