/**
 * Scoring Strategies
 * Centralized implementations of all playlist scoring algorithms
 */

import { APP_ENV } from '../config.js';
import { recencyWeight, normalizeStarRating, normalizePlayCount, fallbackScore, skipPenalty } from './weights.js';
import type { ScoringContext, ScoringComponents, ScoringResult, ScoringStrategy } from './types.js';

/**
 * Calculate balanced score (default for daily playlists)
 * Strategy: (60% recency + 30% rating + 10% play count) × skip penalty
 * Best for: Time-based playlists that favor recently played tracks
 * Skip penalty: Reduces score for frequently-skipped tracks (50% max penalty)
 */
export function calculateBalancedScore(context: ScoringContext): ScoringComponents {
  const recency = recencyWeight(context.lastPlayedAt, context.now);
  const fallback = fallbackScore(context.userRating, context.playCount);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const penalty = skipPenalty(context.skipCount, context.playCount);

  // Base score before skip penalty
  const baseScore = 
    recency * 0.6 + 
    ratingScore * 0.3 +
    playCountScore * 0.1;

  // Apply skip penalty as multiplier
  const finalScore = baseScore * penalty;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore,
    metadata: {
      skipPenalty: penalty
    }
  };
}

/**
 * Calculate quality-first score (default for custom playlists)
 * Strategy: (60% rating + 30% play count + 10% recency) × skip penalty
 * Best for: Genre/mood playlists that prioritize track quality over recency
 * Skip penalty: Reduces score for frequently-skipped tracks (50% max penalty)
 */
export function calculateQualityScore(context: ScoringContext): ScoringComponents {
  const recency = recencyWeight(context.lastPlayedAt, context.now);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const fallback = fallbackScore(context.userRating, context.playCount);
  const penalty = skipPenalty(context.skipCount, context.playCount);

  // Base score before skip penalty
  const baseScore =
    ratingScore * 0.6 +
    playCountScore * 0.3 +
    recency * 0.1;

  // Apply skip penalty as multiplier
  const finalScore = baseScore * penalty;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore,
    metadata: {
      skipPenalty: penalty
    }
  };
}

/**
 * Calculate discovery score
 * Strategy: qualityScore × playCountPenalty × recencyPenalty
 * Best for: Rediscovering forgotten gems from your library
 *
 * Components:
 * - Quality: Star rating or play count proxy for unrated tracks
 * - Play count penalty: Rewards less-played tracks (1 - playCount/saturation)
 * - Recency penalty: Rewards longer-forgotten tracks (daysSince/365, capped at 1 year)
 */
export function calculateDiscoveryScore(context: ScoringContext): ScoringComponents {
  const saturation = APP_ENV.PLAY_COUNT_SATURATION;
  const now = context.now || new Date();

  // Calculate base components
  const recency = recencyWeight(context.lastPlayedAt, now);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const fallback = fallbackScore(context.userRating, context.playCount);

  // Discovery-specific calculations
  const starWeight = (context.userRating || 0) / 10.0; // Convert 0-10 to 0-1
  const playCountPenalty = 1 - Math.min(context.playCount, saturation) / saturation;

  // Calculate days since play for recency penalty
  let daysSincePlay = 0;
  if (context.daysSincePlay !== undefined) {
    daysSincePlay = context.daysSincePlay;
  } else if (context.lastPlayedAt) {
    daysSincePlay = Math.max((now.getTime() - context.lastPlayedAt.getTime()) / (1000 * 60 * 60 * 24), 0);
  }
  const recencyPenalty = Math.min(daysSincePlay / 365, 1); // Max at 1 year

  // Quality score: use rating if available, otherwise play count as proxy
  const qualityScore = (context.userRating || 0) > 0
    ? starWeight
    : Math.min(context.playCount / saturation, 1.0) * 0.5;

  const discoveryScore = qualityScore * playCountPenalty * recencyPenalty;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore: discoveryScore,
    metadata: {
      playCountPenalty,
      recencyPenalty,
      qualityScore,
      strategyScore: discoveryScore
    }
  };
}

/**
 * Calculate throwback score
 * Strategy: nostalgiaWeight × playCountWeight × qualityScore
 * Best for: Nostalgic tracks from 2-5 years ago that you loved back then
 *
 * Components:
 * - Nostalgia weight: Older within window = higher score (linear scale)
 * - Play count weight: How much you loved it back then (normalized)
 * - Quality score: Star rating or play count proxy for unrated tracks
 */
export function calculateThrowbackScore(context: ScoringContext): ScoringComponents {
  const saturation = APP_ENV.PLAY_COUNT_SATURATION;
  const now = context.now || new Date();

  // Calculate base components
  const recency = recencyWeight(context.lastPlayedAt, now);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const fallback = fallbackScore(context.userRating, context.playCount);

  // Throwback-specific calculations
  const lookbackStart = context.lookbackStart || APP_ENV.THROWBACK_LOOKBACK_START;
  const lookbackEnd = context.lookbackEnd || APP_ENV.THROWBACK_LOOKBACK_END;
  const playCountInWindow = context.playCountInWindow || context.playCount;

  // Calculate days since last play
  let daysSinceLastPlay = 0;
  if (context.daysSincePlay !== undefined) {
    daysSinceLastPlay = context.daysSincePlay;
  } else if (context.lastPlayedAt) {
    daysSinceLastPlay = Math.floor(
      (now.getTime() - context.lastPlayedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Nostalgia weight: favor older tracks within the window
  // Linear scale from lookbackStart to lookbackEnd
  const windowRange = lookbackEnd - lookbackStart;
  const daysIntoWindow = daysSinceLastPlay - lookbackStart;
  const nostalgiaWeight = Math.min(Math.max(daysIntoWindow / windowRange, 0), 1);

  // Play count weight: normalize by saturation
  const playCountWeight = Math.min(playCountInWindow / saturation, 1.0);

  // Rating weight: normalize to 0-1
  const ratingWeight = (context.userRating || 0) / 10.0; // Convert 0-10 to 0-1

  // Quality score: use rating if available, otherwise play count as proxy
  const qualityScore = (context.userRating || 0) > 0
    ? ratingWeight
    : Math.min(playCountInWindow / saturation, 1.0) * 0.6; // Cap unrated at 0.6

  const throwbackScore = nostalgiaWeight * playCountWeight * qualityScore;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore: throwbackScore,
    metadata: {
      nostalgiaWeight,
      qualityScore,
      strategyScore: throwbackScore
    }
  };
}

/**
 * Main scoring function - dispatches to appropriate strategy
 * @param strategy - The scoring strategy to use
 * @param context - Input data for scoring calculations
 * @returns Complete scoring result with components and final score
 */
export function calculateScore(strategy: ScoringStrategy, context: ScoringContext): ScoringResult {
  let components: ScoringComponents;

  switch (strategy) {
    case 'balanced':
      components = calculateBalancedScore(context);
      break;
    case 'quality':
      components = calculateQualityScore(context);
      break;
    case 'discovery':
      components = calculateDiscoveryScore(context);
      break;
    case 'throwback':
      components = calculateThrowbackScore(context);
      break;
    default:
      // Type-safe exhaustiveness check
      const _exhaustive: never = strategy;
      throw new Error(`Unknown scoring strategy: ${_exhaustive}`);
  }

  return {
    components,
    finalScore: components.finalScore,
    strategy
  };
}

/**
 * Get the default scoring strategy for a playlist type
 * @param playlistType - Type of playlist (daily, custom, discovery, throwback)
 * @returns Recommended scoring strategy
 */
export function getDefaultStrategy(
  playlistType: 'daily' | 'custom' | 'discovery' | 'throwback'
): ScoringStrategy {
  switch (playlistType) {
    case 'daily':
      return 'balanced';
    case 'custom':
      return 'quality';
    case 'discovery':
      return 'discovery';
    case 'throwback':
      return 'throwback';
    default:
      return 'balanced';
  }
}
