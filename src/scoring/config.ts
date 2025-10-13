/**
 * Scoring Configuration
 * Strategy registry and weight configurations
 */

import type { ScoringStrategy, ScoringWeights } from './types.js';
import { ScoringStrategyNames, ScoringStrategyDescriptions } from './types.js';

/**
 * Default weight configurations for each strategy
 * These match the hardcoded values from the original implementations
 */
export const DEFAULT_WEIGHTS: Record<ScoringStrategy, ScoringWeights> = {
  balanced: {
    strategy: 'balanced',
    recency: 0.7,
    rating: 0.18,     // 0.3 * 0.6 (fallback weight * rating component)
    playCount: 0.12   // 0.3 * 0.4 (fallback weight * playCount component)
  },
  quality: {
    strategy: 'quality',
    rating: 0.6,
    playCount: 0.3,
    recency: 0.1
  },
  discovery: {
    strategy: 'discovery',
    // Discovery uses multiplicative scoring: quality × playCountPenalty × recencyPenalty
    // Weights don't apply the same way, but we track them for documentation
    rating: 1.0,
    multipliers: {
      playCountPenalty: 1.0,
      recencyPenalty: 1.0,
      unratedFallback: 0.5  // Unrated tracks score capped at 50% of rated
    }
  },
  throwback: {
    strategy: 'throwback',
    // Throwback uses multiplicative scoring: nostalgia × playCount × quality
    // Weights don't apply the same way, but we track them for documentation
    rating: 1.0,
    multipliers: {
      nostalgia: 1.0,
      playCount: 1.0,
      unratedFallback: 0.6  // Unrated tracks score capped at 60% of rated
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
    formula: 'finalScore = 0.7 × recency + 0.3 × (0.6 × rating + 0.4 × playCount)'
  },
  quality: {
    id: 'quality',
    name: ScoringStrategyNames.quality,
    description: ScoringStrategyDescriptions.quality,
    weights: DEFAULT_WEIGHTS.quality,
    bestFor: 'Genre/mood playlists where quality matters more than recency',
    formula: 'finalScore = 0.6 × rating + 0.3 × playCount + 0.1 × recency'
  },
  discovery: {
    id: 'discovery',
    name: ScoringStrategyNames.discovery,
    description: ScoringStrategyDescriptions.discovery,
    weights: DEFAULT_WEIGHTS.discovery,
    bestFor: 'Weekly discovery playlist - rediscover forgotten gems',
    formula: 'discoveryScore = qualityScore × playCountPenalty × recencyPenalty'
  },
  throwback: {
    id: 'throwback',
    name: ScoringStrategyNames.throwback,
    description: ScoringStrategyDescriptions.throwback,
    weights: DEFAULT_WEIGHTS.throwback,
    bestFor: 'Weekly throwback playlist - nostalgic tracks from 2-5 years ago',
    formula: 'throwbackScore = nostalgiaWeight × playCountWeight × qualityScore'
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
