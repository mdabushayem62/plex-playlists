/**
 * Scoring System Types
 * Centralized type definitions for all scoring strategies
 */

import type { HourlyGenrePreference } from '../patterns/types.js';

/**
 * Available scoring strategies
 * Each strategy has a unique approach to ranking tracks
 */
export type ScoringStrategy =
  | "balanced" // Balanced mix of recency and quality (default for daily playlists)
  | "quality" // Prioritizes track quality (ratings + play count) over recency (custom playlists)
  | "discovery" // Rediscovers forgotten gems (long-unplayed, high-quality tracks)
  | "throwback"; // Nostalgic tracks from years ago that you loved back then

/**
 * User-friendly display names for scoring strategies
 */
export const ScoringStrategyNames: Record<ScoringStrategy, string> = {
  balanced: "Recent Favorites",
  quality: "Top Rated",
  discovery: "Rediscovery",
  throwback: "Nostalgia",
};

/**
 * Descriptions for each scoring strategy
 */
export const ScoringStrategyDescriptions: Record<ScoringStrategy, string> = {
  balanced:
    "Balances recently played tracks with quality ratings (70% recency, 30% quality)",
  quality:
    "Prioritizes highly-rated and frequently-played tracks (60% rating, 30% plays, 10% recency)",
  discovery:
    "Surfaces forgotten gems you haven't heard in months (quality × play count penalty × recency penalty)",
  throwback:
    "Brings back nostalgic tracks from 2-5 years ago (nostalgia × play count × quality)",
};

/**
 * Audio features for track (from audio_features table)
 */
export interface AudioFeatures {
  tempo?: number; // BPM
  energy?: number; // 0-1
  key?: string; // Musical key
  scale?: string; // major/minor
  moodVector?: Record<string, number>; // mood -> confidence map
}

/**
 * Input context for scoring calculations
 * Contains all data needed to compute a score
 */
export interface ScoringContext {
  /** Track user rating (0-10, where 10 = 5 stars) */
  userRating?: number;
  /** Total play count for this track */
  playCount: number;
  /** Number of times track was skipped */
  skipCount?: number;
  /** Most recent play date (null if never played) */
  lastPlayedAt: Date | null;
  /** Date track was added to library (for exploration boost) */
  addedAt?: Date;
  /** Current date/time for recency calculations */
  now?: Date;
  /** Days since last play (for discovery/throwback) */
  daysSincePlay?: number;
  /** Play count within specific time window (for throwback) */
  playCountInWindow?: number;
  /** Lookback window start (for throwback nostalgia calculation) */
  lookbackStart?: number;
  /** Lookback window end (for throwback nostalgia calculation) */
  lookbackEnd?: number;

  // ========== ENHANCED SCORING CONTEXT (Quick Wins) ==========

  /** Track genres for genre matching (from cache or Plex) */
  genres?: string[];
  /** Track moods for mood matching (from cache or Plex) */
  moods?: string[];
  /** Recently played artists (for artist spacing penalty) */
  recentArtists?: string[];
  /** Recently played genres (for genre spacing penalty) */
  recentGenres?: string[];
  /** Playlist time window (morning/afternoon/evening) for time-of-day boost */
  timeWindow?: "morning" | "afternoon" | "evening";
  /** Audio features for energy/tempo alignment */
  audioFeatures?: AudioFeatures;
  /** Artist name for spacing penalty calculations */
  artistName?: string;
  /** Target genres to match against (from playlist config or recent history) */
  targetGenres?: string[];
  /** Target mood vector to match against (mood -> confidence map) */
  targetMoodVector?: Record<string, number>;

  // ========== LEARNED PATTERNS (Pattern Detection) ==========

  /** Learned genre preferences from playback history (hourly breakdown) */
  learnedPatterns?: HourlyGenrePreference[];
}

/**
 * Calculated scoring components
 * Normalized values (0-1) used to build final scores
 */
export interface ScoringComponents {
  /** Exponential decay based on days since last play (0-1) */
  recencyWeight: number;
  /** User rating normalized to 0-1 scale */
  ratingScore: number;
  /** Play count normalized with saturation (0-1) */
  playCountScore: number;
  /** Combined rating + play count score (0-1) */
  fallbackScore: number;
  /** Strategy-specific final score (0-1) */
  finalScore: number;
  /** Additional metadata for specific strategies */
  metadata?: {
    /** Balanced/Quality: Skip penalty multiplier (0.5-1.0) */
    skipPenalty?: number;
    /** Discovery: Penalty for frequently-played tracks */
    playCountPenalty?: number;
    /** Discovery/Throwback: Penalty/weight for recency */
    recencyPenalty?: number;
    /** Discovery: Combined quality score */
    qualityScore?: number;
    /** Throwback: Nostalgia weight (older = higher) */
    nostalgiaWeight?: number;
    /** Discovery/Throwback: Strategy-specific score */
    strategyScore?: number;
    /** Quick Wins: Genre match score (0-1) */
    genreMatchScore?: number;
    /** Quick Wins: Mood similarity score (0-1) */
    moodMatchScore?: number;
    /** Quick Wins: Artist spacing penalty multiplier (0-1) */
    artistSpacingPenalty?: number;
    /** Quick Wins: Time-of-day boost (0-1) */
    timeOfDayBoost?: number;
    /** Quick Wins: Energy alignment score (0-1) */
    energyAlignmentScore?: number;
    /** Quick Wins: Tempo match score (0-1) */
    tempoMatchScore?: number;
    /** Quick Wins: Discovery/exploration boost (0-0.20) */
    discoveryBoost?: number;
  };
}

/**
 * Weight configuration for a scoring strategy
 * Defines how much each component contributes to the final score
 */
export interface ScoringWeights {
  /** Strategy identifier */
  strategy: ScoringStrategy;
  /** Recency component weight (0-1) */
  recency?: number;
  /** Rating component weight (0-1) */
  rating?: number;
  /** Play count component weight (0-1) */
  playCount?: number;
  /** Strategy-specific multipliers */
  multipliers?: Record<string, number>;
}

/**
 * Result of a scoring calculation
 */
export interface ScoringResult {
  /** All calculated components */
  components: ScoringComponents;
  /** Final score used for ranking (0-1) */
  finalScore: number;
  /** Strategy used for calculation */
  strategy: ScoringStrategy;
}
