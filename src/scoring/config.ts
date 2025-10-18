/**
 * Scoring Configuration
 * Strategy registry and weight configurations
 */

import type { ScoringStrategy, ScoringWeights } from './types.js';
import { ScoringStrategyNames, ScoringStrategyDescriptions } from './types.js';

/**
 * Default weight configurations for each strategy
 *
 * 8-FACTOR SCORING FORMULA (Phase 2A Implementation):
 * score = [R + P + G + M + T + E + D] × A
 *
 * Where:
 *   R = Recency (exponential decay)
 *   P = Popularity (rating + playCount)
 *   G = Genre match (cosine similarity or exact match)
 *   M = Mood similarity (cosine similarity of mood vectors)
 *   T = Time-of-day context boost (genre/mood/energy alignment)
 *   E = Energy/tempo alignment (distance from target)
 *   D = Discovery/exploration boost (never-played, low-play, recently-added)
 *   A = Artist/genre spacing penalties (multiplicative)
 *
 * Implementation: Additive scoring with multiplicative penalties
 */
export const DEFAULT_WEIGHTS: Record<ScoringStrategy, ScoringWeights> = {
  balanced: {
    strategy: 'balanced',
    // Core weights (70% baseline)
    recency: 0.35,        // R: Days since last play (exponential decay)
    rating: 0.25,         // P: User star rating (0-10 scale)
    playCount: 0.10,      // P: Total play count (normalized)
    // Contextual boosts (additive, up to 65% additional)
    multipliers: {
      genreMatch: 0.15,         // G: Genre similarity (0-1 × 0.15)
      moodSimilarity: 0.10,     // M: Mood vector similarity (0-1 × 0.10)
      timeOfDay: 0.15,          // T: Time window alignment (max +0.15)
      energyTempo: 0.05,        // E: Energy/tempo alignment (0-1 × 0.05)
      exploration: 0.20,        // D: Discovery boost (max +0.20)
      // Penalties (multiplicative)
      skipPenalty: 0.50,        // A: Skip rate penalty (0.5-1.0)
      artistSpacing: 1.00,      // A: Recent artist penalty (0-1.0)
      genreSpacing: 1.00        // A: Recent genre penalty (0-1.0)
    }
  },
  quality: {
    strategy: 'quality',
    // Core weights (65% baseline)
    rating: 0.40,         // P: User star rating (prioritized)
    playCount: 0.20,      // P: Total play count
    recency: 0.05,        // R: Days since play (minimal)
    // Contextual boosts (additive, up to 60% additional)
    multipliers: {
      genreMatch: 0.15,         // G: Genre similarity (0-1 × 0.15)
      moodSimilarity: 0.10,     // M: Mood vector similarity (0-1 × 0.10)
      energyTempo: 0.10,        // E: Energy/tempo alignment (0-1 × 0.10)
      timeOfDay: 0.05,          // T: Time window alignment (max +0.05)
      exploration: 0.20,        // D: Discovery boost (max +0.20)
      // Penalties (multiplicative)
      skipPenalty: 0.50,        // A: Skip rate penalty (0.5-1.0)
      artistSpacing: 1.00,      // A: Recent artist penalty (0-1.0)
      genreSpacing: 1.00        // A: Recent genre penalty (0-1.0)
    }
  },
  discovery: {
    strategy: 'discovery',
    // Discovery uses multiplicative scoring: quality × playCountPenalty × recencyPenalty + exploration
    // Weights documented for completeness
    rating: 1.0,
    multipliers: {
      playCountPenalty: 1.0,    // Rewards less-played (1 - playCount/saturation)
      recencyPenalty: 1.0,      // Rewards longer-forgotten (daysSince/365)
      exploration: 0.20,        // D: Discovery boost (additive, max +0.20)
      unratedFallback: 0.5      // Unrated tracks score capped at 50% of rated
    }
  },
  throwback: {
    strategy: 'throwback',
    // Throwback uses multiplicative scoring: nostalgia × playCount × quality + exploration
    // Weights documented for completeness
    rating: 1.0,
    multipliers: {
      nostalgia: 1.0,           // Older within window = higher (linear scale)
      playCount: 1.0,           // How much you loved it (normalized)
      exploration: 0.20,        // D: Discovery boost (additive, max +0.20)
      unratedFallback: 0.6      // Unrated tracks score capped at 60% of rated
    }
  }
};

/**
 * Strategy metadata for UI and documentation
 */
export interface StrategyMetadata {
  id: ScoringStrategy;
  name: string;
  description: string;
  weights: ScoringWeights;
  bestFor: string;
  formula: string;
}

/**
 * Complete strategy registry with metadata
 * Used for UI dropdowns, documentation, and validation
 */
export const STRATEGY_REGISTRY: Record<ScoringStrategy, StrategyMetadata> = {
  balanced: {
    id: 'balanced',
    name: ScoringStrategyNames.balanced,
    description: ScoringStrategyDescriptions.balanced,
    weights: DEFAULT_WEIGHTS.balanced,
    bestFor: 'Daily time-based playlists (morning, afternoon, evening)',
    formula: '[0.35R + 0.25P + 0.10C + 0.15G + 0.10M + 0.15T + 0.05E + 0.20D] × A'
  },
  quality: {
    id: 'quality',
    name: ScoringStrategyNames.quality,
    description: ScoringStrategyDescriptions.quality,
    weights: DEFAULT_WEIGHTS.quality,
    bestFor: 'Genre/mood playlists where quality matters more than recency',
    formula: '[0.40P + 0.20C + 0.05R + 0.15G + 0.10M + 0.10E + 0.05T + 0.20D] × A'
  },
  discovery: {
    id: 'discovery',
    name: ScoringStrategyNames.discovery,
    description: ScoringStrategyDescriptions.discovery,
    weights: DEFAULT_WEIGHTS.discovery,
    bestFor: 'Weekly discovery playlist - rediscover forgotten gems',
    formula: '(Q × playCountPenalty × recencyPenalty) + 0.20D'
  },
  throwback: {
    id: 'throwback',
    name: ScoringStrategyNames.throwback,
    description: ScoringStrategyDescriptions.throwback,
    weights: DEFAULT_WEIGHTS.throwback,
    bestFor: 'Weekly throwback playlist - nostalgic tracks from 2-5 years ago',
    formula: '(nostalgia × playCount × Q) + 0.20D'
  }
};

/**
 * Get all available strategies (for UI dropdowns)
 */
export function getAllStrategies(): StrategyMetadata[] {
  return Object.values(STRATEGY_REGISTRY);
}

/**
 * Get strategy metadata by ID
 */
export function getStrategyMetadata(strategy: ScoringStrategy): StrategyMetadata {
  return STRATEGY_REGISTRY[strategy];
}

/**
 * Validate if a string is a valid scoring strategy
 */
export function isValidStrategy(strategy: string): strategy is ScoringStrategy {
  return strategy in STRATEGY_REGISTRY;
}

/**
 * Parse strategy from string with fallback to default
 */
export function parseStrategy(
  strategy: string | undefined | null,
  defaultStrategy: ScoringStrategy = 'balanced'
): ScoringStrategy {
  if (!strategy) {
    return defaultStrategy;
  }
  return isValidStrategy(strategy) ? strategy : defaultStrategy;
}
