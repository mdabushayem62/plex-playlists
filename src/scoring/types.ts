/**
 * Scoring System Types
 * Centralized type definitions for all scoring strategies
 */

/**
 * Available scoring strategies
 * Each strategy has a unique approach to ranking tracks
 */
export type ScoringStrategy =
  | 'balanced'      // Balanced mix of recency and quality (default for daily playlists)
  | 'quality'       // Prioritizes track quality (ratings + play count) over recency (custom playlists)
  | 'discovery'     // Rediscovers forgotten gems (long-unplayed, high-quality tracks)
  | 'throwback';    // Nostalgic tracks from years ago that you loved back then

/**
 * User-friendly display names for scoring strategies
 */
export const ScoringStrategyNames: Record<ScoringStrategy, string> = {
  balanced: 'Recent Favorites',
  quality: 'Top Rated',
  discovery: 'Rediscovery',
  throwback: 'Nostalgia'
};

/**
 * Descriptions for each scoring strategy
 */
export const ScoringStrategyDescriptions: Record<ScoringStrategy, string> = {
  balanced: 'Balances recently played tracks with quality ratings (70% recency, 30% quality)',
  quality: 'Prioritizes highly-rated and frequently-played tracks (60% rating, 30% plays, 10% recency)',
  discovery: 'Surfaces forgotten gems you haven\'t heard in months (quality × play count penalty × recency penalty)',
  throwback: 'Brings back nostalgic tracks from 2-5 years ago (nostalgia × play count × quality)'
};

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
