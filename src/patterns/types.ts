/**
 * Pattern Detection Types
 * User preference patterns extracted from deep playback history
 */

/**
 * Genre preference for a specific hour of day
 */
export interface HourlyGenrePreference {
  hour: number; // 0-23
  genre: string; // Normalized genre string
  weight: number; // 0-1, how strongly preferred this genre is at this hour
  playCount: number; // Number of plays in this hour for this genre
}

/**
 * Aggregated user patterns from playback history
 * Computed from /status/sessions/history/all endpoint
 */
export interface UserPatterns {
  /** Genre preferences by hour of day (0-23) */
  hourlyGenrePreferences: HourlyGenrePreference[];

  /** Peak listening hours (hours with most playback activity) */
  peakHours: number[]; // Top 3-5 hours by play count

  /** When these patterns were last analyzed */
  lastAnalyzed: Date;

  /** Total sessions analyzed */
  sessionsAnalyzed: number;

  /** Date range analyzed (for cache validation) */
  analyzedFrom: Date;
  analyzedTo: Date;
}

/**
 * Configuration for pattern analysis
 */
export interface PatternAnalysisOptions {
  /** How many days of history to analyze (default: 90) */
  lookbackDays?: number;

  /** Minimum plays per hour+genre combo to be considered (default: 2) */
  minPlaysThreshold?: number;

  /** Maximum genres to track per hour (default: 10) */
  maxGenresPerHour?: number;
}

/**
 * Raw aggregation for genre+hour combination
 * Used internally during pattern extraction
 */
export interface GenreHourAggregation {
  genre: string;
  hour: number;
  playCount: number;
}
