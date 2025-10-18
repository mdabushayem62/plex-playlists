/**
 * Scoring Strategies
 * Centralized implementations of all playlist scoring algorithms
 */

import { APP_ENV } from "../config.js";
import {
  recencyWeight,
  normalizeStarRating,
  normalizePlayCount,
  fallbackScore,
  skipPenalty,
  timeOfDayBoost,
  energyAlignment,
  tempoMatch,
  artistSpacingPenalty,
  genreSpacingPenalty,
  genreMatchScore,
  moodSimilarity,
  explorationBoost,
  TIME_PROFILES,
} from "./weights.js";
import type {
  ScoringContext,
  ScoringComponents,
  ScoringResult,
  ScoringStrategy,
} from "./types.js";

/**
 * Calculate balanced score (default for daily playlists)
 * Strategy: Core weights + Quick Win enhancements
 * - Core: 35% recency + 25% rating + 10% play count
 * - Enhancements: time-of-day boost, energy alignment, genre match, mood similarity, artist spacing
 * Best for: Time-based playlists that favor recently played tracks
 * Skip penalty: Reduces score for frequently-skipped tracks (50% max penalty)
 */
export async function calculateBalancedScore(
  context: ScoringContext,
): Promise<ScoringComponents> {
  const recency = recencyWeight(context.lastPlayedAt, context.now);
  const fallback = fallbackScore(context.userRating, context.playCount);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const penalty = skipPenalty(context.skipCount, context.playCount);

  // Core score components (70% total)
  let baseScore =
    recency * 0.35 + // Reduced from 0.50 to make room for genre/mood
    ratingScore * 0.25 + // Same
    playCountScore * 0.1; // Same

  // Quick Win: Genre match (up to +15%)
  const genreScore = await genreMatchScore(context.genres, context.targetGenres);
  baseScore += genreScore * 0.15;

  // Quick Win: Mood similarity (up to +10%)
  const moodScore = moodSimilarity(
    context.audioFeatures?.moodVector,
    context.targetMoodVector,
  );
  baseScore += moodScore * 0.1;

  // Quick Win: Time-of-day boost (up to +15%)
  const todBoost = timeOfDayBoost(
    context.genres,
    context.moods,
    context.audioFeatures?.energy,
    context.timeWindow,
    context.learnedPatterns,
  );
  baseScore += todBoost;

  // Quick Win: Energy + Tempo alignment (up to +5%)
  if (context.audioFeatures?.energy !== undefined && context.timeWindow) {
    const targetEnergy = TIME_PROFILES[context.timeWindow]?.energyTarget || 0.5;
    const energyScore = energyAlignment(
      context.audioFeatures.energy,
      targetEnergy,
    );

    const targetTempo = TIME_PROFILES[context.timeWindow]?.targetTempo;
    const tempoScore = tempoMatch(context.audioFeatures.tempo, targetTempo);

    // Combine energy and tempo (weighted 70/30)
    const combinedScore = energyScore * 0.7 + tempoScore * 0.3;
    baseScore += combinedScore * 0.05;
  }

  // Quick Win: Exploration boost (up to +0.20)
  const discoveryBoost = explorationBoost(
    context.playCount,
    context.addedAt,
    context.now,
  );
  baseScore += discoveryBoost;

  // Apply penalties as multipliers
  const artistPenalty = artistSpacingPenalty(
    context.artistName,
    context.recentArtists,
  );
  const genrePenalty = genreSpacingPenalty(
    context.genres,
    context.recentGenres,
  );
  const combinedPenalty = penalty * artistPenalty * genrePenalty;

  // Final score with penalties
  const finalScore = baseScore * combinedPenalty;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore,
    metadata: {
      skipPenalty: penalty,
      genreMatchScore: genreScore,
      moodMatchScore: moodScore,
      timeOfDayBoost: todBoost,
      energyAlignmentScore:
        context.audioFeatures?.energy !== undefined && context.timeWindow
          ? energyAlignment(
              context.audioFeatures.energy,
              TIME_PROFILES[context.timeWindow]?.energyTarget || 0.5,
            )
          : undefined,
      tempoMatchScore:
        context.audioFeatures?.tempo !== undefined && context.timeWindow
          ? tempoMatch(
              context.audioFeatures.tempo,
              TIME_PROFILES[context.timeWindow]?.targetTempo,
            )
          : undefined,
      discoveryBoost,
      artistSpacingPenalty: artistPenalty,
    },
  };
}

/**
 * Calculate quality-first score (default for custom playlists)
 * Strategy: Core weights + Quick Win enhancements
 * - Core: 40% rating + 20% play count + 5% recency
 * - Enhancements: genre match, mood similarity, energy alignment, artist spacing
 * Best for: Genre/mood playlists that prioritize track quality over recency
 * Skip penalty: Reduces score for frequently-skipped tracks (50% max penalty)
 */
export async function calculateQualityScore(
  context: ScoringContext,
): Promise<ScoringComponents> {
  const recency = recencyWeight(context.lastPlayedAt, context.now);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const fallback = fallbackScore(context.userRating, context.playCount);
  const penalty = skipPenalty(context.skipCount, context.playCount);

  // Core score components (65% total)
  let baseScore =
    ratingScore * 0.4 + // Reduced from 0.55 to make room for genre/mood
    playCountScore * 0.2 + // Reduced from 0.25
    recency * 0.05; // Same

  // Quick Win: Genre match (up to +15%)
  const genreScore = await genreMatchScore(context.genres, context.targetGenres);
  baseScore += genreScore * 0.15;

  // Quick Win: Mood similarity (up to +10%)
  const moodScore = moodSimilarity(
    context.audioFeatures?.moodVector,
    context.targetMoodVector,
  );
  baseScore += moodScore * 0.1;

  // Quick Win: Energy + Tempo alignment (up to +10% for quality playlists)
  // Quality playlists may target specific energy levels
  if (context.audioFeatures?.energy !== undefined && context.timeWindow) {
    const targetEnergy = TIME_PROFILES[context.timeWindow]?.energyTarget || 0.5;
    const energyScore = energyAlignment(
      context.audioFeatures.energy,
      targetEnergy,
    );

    const targetTempo = TIME_PROFILES[context.timeWindow]?.targetTempo;
    const tempoScore = tempoMatch(context.audioFeatures.tempo, targetTempo);

    // Combine energy and tempo (weighted 70/30)
    const combinedScore = energyScore * 0.7 + tempoScore * 0.3;
    baseScore += combinedScore * 0.1;
  }

  // Quick Win: Time-of-day boost (smaller for quality playlists, up to +5%)
  const todBoost = timeOfDayBoost(
    context.genres,
    context.moods,
    context.audioFeatures?.energy,
    context.timeWindow,
    context.learnedPatterns,
  );
  baseScore += todBoost * 0.33; // Only 1/3 of the boost for quality playlists

  // Quick Win: Exploration boost (up to +0.20)
  const discoveryBoost = explorationBoost(
    context.playCount,
    context.addedAt,
    context.now,
  );
  baseScore += discoveryBoost;

  // Apply penalties as multipliers
  const artistPenalty = artistSpacingPenalty(
    context.artistName,
    context.recentArtists,
  );
  const genrePenalty = genreSpacingPenalty(
    context.genres,
    context.recentGenres,
  );
  const combinedPenalty = penalty * artistPenalty * genrePenalty;

  // Final score with penalties
  const finalScore = baseScore * combinedPenalty;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore,
    metadata: {
      skipPenalty: penalty,
      genreMatchScore: genreScore,
      moodMatchScore: moodScore,
      timeOfDayBoost: todBoost * 0.33,
      energyAlignmentScore:
        context.audioFeatures?.energy !== undefined && context.timeWindow
          ? energyAlignment(
              context.audioFeatures.energy,
              TIME_PROFILES[context.timeWindow]?.energyTarget || 0.5,
            )
          : undefined,
      tempoMatchScore:
        context.audioFeatures?.tempo !== undefined && context.timeWindow
          ? tempoMatch(
              context.audioFeatures.tempo,
              TIME_PROFILES[context.timeWindow]?.targetTempo,
            )
          : undefined,
      discoveryBoost,
      artistSpacingPenalty: artistPenalty,
    },
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
export function calculateDiscoveryScore(
  context: ScoringContext,
): ScoringComponents {
  const saturation = APP_ENV.PLAY_COUNT_SATURATION;
  const now = context.now || new Date();

  // Calculate base components
  const recency = recencyWeight(context.lastPlayedAt, now);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const fallback = fallbackScore(context.userRating, context.playCount);

  // Discovery-specific calculations
  const starWeight = (context.userRating || 0) / 10.0; // Convert 0-10 to 0-1
  const playCountPenalty =
    1 - Math.min(context.playCount, saturation) / saturation;

  // Calculate days since play for recency penalty
  let daysSincePlay = 0;
  if (context.daysSincePlay !== undefined) {
    daysSincePlay = context.daysSincePlay;
  } else if (context.lastPlayedAt) {
    daysSincePlay = Math.max(
      (now.getTime() - context.lastPlayedAt.getTime()) / (1000 * 60 * 60 * 24),
      0,
    );
  }
  const recencyPenalty = Math.min(daysSincePlay / 365, 1); // Max at 1 year

  // Quality score: use rating if available, otherwise play count as proxy
  const qualityScore =
    (context.userRating || 0) > 0
      ? starWeight
      : Math.min(context.playCount / saturation, 1.0) * 0.5;

  // Base discovery score
  let discoveryScore = qualityScore * playCountPenalty * recencyPenalty;

  // Quick Win: Exploration boost (additive, up to +0.20)
  const discoveryBoost = explorationBoost(
    context.playCount,
    context.addedAt,
    context.now,
  );
  discoveryScore += discoveryBoost;

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
      discoveryBoost,
      strategyScore: discoveryScore,
    },
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
export function calculateThrowbackScore(
  context: ScoringContext,
): ScoringComponents {
  const saturation = APP_ENV.PLAY_COUNT_SATURATION;
  const now = context.now || new Date();

  // Calculate base components
  const recency = recencyWeight(context.lastPlayedAt, now);
  const ratingScore = normalizeStarRating(context.userRating);
  const playCountScore = normalizePlayCount(context.playCount);
  const fallback = fallbackScore(context.userRating, context.playCount);

  // Throwback-specific calculations
  const lookbackStart =
    context.lookbackStart || APP_ENV.THROWBACK_LOOKBACK_START;
  const lookbackEnd = context.lookbackEnd || APP_ENV.THROWBACK_LOOKBACK_END;
  const playCountInWindow = context.playCountInWindow || context.playCount;

  // Calculate days since last play
  let daysSinceLastPlay = 0;
  if (context.daysSincePlay !== undefined) {
    daysSinceLastPlay = context.daysSincePlay;
  } else if (context.lastPlayedAt) {
    daysSinceLastPlay = Math.floor(
      (now.getTime() - context.lastPlayedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  // Nostalgia weight: favor older tracks within the window
  // Linear scale from lookbackStart to lookbackEnd
  const windowRange = lookbackEnd - lookbackStart;
  const daysIntoWindow = daysSinceLastPlay - lookbackStart;
  const nostalgiaWeight = Math.min(
    Math.max(daysIntoWindow / windowRange, 0),
    1,
  );

  // Play count weight: normalize by saturation
  const playCountWeight = Math.min(playCountInWindow / saturation, 1.0);

  // Rating weight: normalize to 0-1
  const ratingWeight = (context.userRating || 0) / 10.0; // Convert 0-10 to 0-1

  // Quality score: use rating if available, otherwise play count as proxy
  const qualityScore =
    (context.userRating || 0) > 0
      ? ratingWeight
      : Math.min(playCountInWindow / saturation, 1.0) * 0.6; // Cap unrated at 0.6

  // Base throwback score
  let throwbackScore = nostalgiaWeight * playCountWeight * qualityScore;

  // Quick Win: Exploration boost (additive, up to +0.20)
  const discoveryBoost = explorationBoost(
    context.playCount,
    context.addedAt,
    context.now,
  );
  throwbackScore += discoveryBoost;

  return {
    recencyWeight: recency,
    ratingScore,
    playCountScore,
    fallbackScore: fallback,
    finalScore: throwbackScore,
    metadata: {
      nostalgiaWeight,
      qualityScore,
      discoveryBoost,
      strategyScore: throwbackScore,
    },
  };
}

/**
 * Main scoring function - dispatches to appropriate strategy
 * @param strategy - The scoring strategy to use
 * @param context - Input data for scoring calculations
 * @returns Complete scoring result with components and final score
 */
export async function calculateScore(
  strategy: ScoringStrategy,
  context: ScoringContext,
): Promise<ScoringResult> {
  let components: ScoringComponents;

  switch (strategy) {
    case "balanced":
      components = await calculateBalancedScore(context);
      break;
    case "quality":
      components = await calculateQualityScore(context);
      break;
    case "discovery":
      components = calculateDiscoveryScore(context);
      break;
    case "throwback":
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
    strategy,
  };
}

/**
 * Get the default scoring strategy for a playlist type
 * @param playlistType - Type of playlist (daily, custom, discovery, throwback)
 * @returns Recommended scoring strategy
 */
export function getDefaultStrategy(
  playlistType: "daily" | "custom" | "discovery" | "throwback",
): ScoringStrategy {
  switch (playlistType) {
    case "daily":
      return "balanced";
    case "custom":
      return "quality";
    case "discovery":
      return "discovery";
    case "throwback":
      return "throwback";
    default:
      return "balanced";
  }
}
