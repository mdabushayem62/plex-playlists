import { differenceInCalendarDays } from "date-fns";

import { APP_ENV } from "../config.js";
import type { HourlyGenrePreference } from "../patterns/types.js";

export const recencyWeight = (
  lastPlayed: Date | null,
  now: Date = new Date(),
): number => {
  if (!lastPlayed) {
    return 1;
  }
  const days = Math.max(differenceInCalendarDays(now, lastPlayed), 0);
  const halfLife = APP_ENV.HALF_LIFE_DAYS;
  if (halfLife <= 0) {
    return days === 0 ? 0 : 1;
  }
  const lambda = Math.log(2) / halfLife;
  return Math.exp(-lambda * days);
};

export const normalizeStarRating = (rating?: number): number => {
  if (rating == null) {
    return 0.5; // neutral baseline when no rating
  }
  // Plex star ratings: 1-5 (with halves). Convert to 0-1 scale.
  const clamped = Math.min(Math.max(rating, 0), 5);
  return clamped / 5;
};

export const normalizePlayCount = (count?: number): number => {
  if (!count || count <= 0) {
    return 0;
  }
  const saturation = Math.max(APP_ENV.PLAY_COUNT_SATURATION, 1);
  return Math.min(count / saturation, 1);
};

/**
 * Calculate skip penalty based on skip count and view count
 * Returns a multiplier (0.5-1.0) to penalize frequently-skipped tracks
 *
 * @param skipCount - Number of times track was skipped
 * @param viewCount - Number of times track was played
 * @param maxPenalty - Maximum penalty (0.5 = reduce score by 50% at worst)
 * @returns Penalty multiplier where 1.0 = no penalty, 0.5 = maximum penalty
 *
 * Examples:
 * - 0 skips, 10 plays → 1.0 (no penalty)
 * - 5 skips, 10 plays → 0.75 (25% penalty for 50% skip rate)
 * - 10 skips, 10 plays → 0.5 (50% penalty for 100% skip rate)
 */
export const skipPenalty = (
  skipCount?: number,
  viewCount?: number,
  maxPenalty: number = 0.5,
): number => {
  // No penalty if no data or no skips
  if (!skipCount || skipCount <= 0 || !viewCount || viewCount <= 0) {
    return 1.0;
  }

  // Calculate skip rate (0.0 to 1.0+)
  const skipRate = skipCount / viewCount;

  // Apply penalty with cap (e.g., 50% skip rate = 25% penalty, 100% skip rate = 50% penalty)
  const penalty = Math.min(skipRate * maxPenalty, maxPenalty);

  return 1.0 - penalty;
};

export const fallbackScore = (rating?: number, playCount?: number): number => {
  const ratingComponent = normalizeStarRating(rating) * 0.6;
  const playCountComponent = normalizePlayCount(playCount) * 0.4;
  return ratingComponent + playCountComponent;
};

// ========== ENHANCED SCORING COMPONENTS (Quick Wins) ==========

/**
 * Time-of-day profile configuration
 * Defines preferred genres, energy targets, tempo targets, and mood tags for each time window
 */
export interface TimeProfile {
  preferredGenres: string[];
  energyTarget: number; // 0-1, target energy level
  targetTempo: number; // BPM, target tempo
  moodTags: string[];
  boost: number; // Max boost value (0-1)
}

/**
 * Time-of-day profiles for morning/afternoon/evening
 */
export const TIME_PROFILES: Record<string, TimeProfile> = {
  morning: {
    preferredGenres: [
      "acoustic",
      "folk",
      "indie",
      "singer/songwriter",
      "pop",
      "jazz",
    ],
    energyTarget: 0.4,
    targetTempo: 120,
    moodTags: ["happy", "uplifting", "calm", "peaceful", "cheerful"],
    boost: 0.15,
  },
  afternoon: {
    preferredGenres: [
      "ambient",
      "electronic",
      "jazz",
      "classical",
      "instrumental",
      "chillout",
    ],
    energyTarget: 0.5,
    targetTempo: 100,
    moodTags: ["focused", "calm", "peaceful", "contemplative", "mellow"],
    boost: 0.1,
  },
  evening: {
    preferredGenres: [
      "rock",
      "electronic",
      "indie",
      "dance",
      "alternative",
      "hip-hop",
    ],
    energyTarget: 0.7,
    targetTempo: 130,
    moodTags: ["energetic", "party", "upbeat", "exciting", "passionate"],
    boost: 0.15,
  },
};

/**
 * Get learned genre preferences for a specific hour
 * Returns genre weights from user's historical listening patterns
 *
 * @param hour - Hour of day (0-23)
 * @param learnedPatterns - Array of hourly genre preferences from pattern analysis
 * @returns Map of genre -> weight for this hour
 */
export const getGenrePreferencesForHour = (
  hour: number,
  learnedPatterns: HourlyGenrePreference[]
): Map<string, number> => {
  const prefsForHour = learnedPatterns.filter((p) => p.hour === hour);
  const genreWeights = new Map<string, number>();

  for (const pref of prefsForHour) {
    genreWeights.set(pref.genre.toLowerCase(), pref.weight);
  }

  return genreWeights;
};

/**
 * Calculate time-of-day boost based on genre, energy, and mood alignment
 * Returns a boost score (0 to profile.boost)
 *
 * Now supports learned patterns from user's playback history:
 * - If learnedPatterns provided, uses historical genre preferences (70% weight)
 * - Falls back to hardcoded TIME_PROFILES (30% weight) for energy/mood
 *
 * @param genres - Track genres
 * @param moods - Track moods
 * @param energy - Track energy level (0-1)
 * @param timeWindow - Time window (morning/afternoon/evening)
 * @param learnedPatterns - Optional learned genre preferences from history
 * @returns Boost score (0-1)
 */
export const timeOfDayBoost = (
  genres: string[] = [],
  moods: string[] = [],
  energy: number | undefined,
  timeWindow?: "morning" | "afternoon" | "evening",
  learnedPatterns?: HourlyGenrePreference[]
): number => {
  if (!timeWindow || !TIME_PROFILES[timeWindow]) {
    return 0;
  }

  const profile = TIME_PROFILES[timeWindow];
  let boost = 0;

  // If learned patterns available, use them for genre matching (70% of boost)
  if (learnedPatterns && learnedPatterns.length > 0) {
    // Get current hour from time window
    const now = new Date();
    const currentHour = now.getHours();

    const genreWeights = getGenrePreferencesForHour(currentHour, learnedPatterns);

    // Calculate learned genre boost
    let maxGenreWeight = 0;
    for (const genre of genres) {
      const normalizedGenre = genre.toLowerCase();
      const weight = genreWeights.get(normalizedGenre) || 0;
      maxGenreWeight = Math.max(maxGenreWeight, weight);
    }

    // Use learned pattern weight (0-1) as percentage of max boost
    boost += profile.boost * 0.7 * maxGenreWeight;

    // Energy/mood contribute smaller portion (30% combined)
    if (energy !== undefined) {
      const energyDiff = Math.abs(energy - profile.energyTarget);
      if (energyDiff < 0.2) {
        boost += profile.boost * 0.2 * (1 - energyDiff / 0.2);
      }
    }

    const hasMatchingMood = moods.some((m) =>
      profile.moodTags.some((pm) => m.toLowerCase().includes(pm.toLowerCase())),
    );
    if (hasMatchingMood) {
      boost += profile.boost * 0.1;
    }
  } else {
    // Fallback to hardcoded TIME_PROFILES (original logic)
    // Genre match (50% of max boost)
    const hasMatchingGenre = genres.some((g) =>
      profile.preferredGenres.some((pg) =>
        g.toLowerCase().includes(pg.toLowerCase()),
      ),
    );
    if (hasMatchingGenre) {
      boost += profile.boost * 0.5;
    }

    // Energy alignment (30% of max boost)
    if (energy !== undefined) {
      const energyDiff = Math.abs(energy - profile.energyTarget);
      if (energyDiff < 0.2) {
        boost += profile.boost * 0.3 * (1 - energyDiff / 0.2); // Linear falloff
      }
    }

    // Mood match (20% of max boost)
    const hasMatchingMood = moods.some((m) =>
      profile.moodTags.some((pm) => m.toLowerCase().includes(pm.toLowerCase())),
    );
    if (hasMatchingMood) {
      boost += profile.boost * 0.2;
    }
  }

  return boost;
};

/**
 * Calculate energy alignment score
 * Returns how well track energy matches target energy (0-1)
 *
 * @param trackEnergy - Track energy level (0-1)
 * @param targetEnergy - Target energy level (0-1)
 * @returns Alignment score (0-1), where 1 = perfect match
 */
export const energyAlignment = (
  trackEnergy: number | undefined,
  targetEnergy: number,
): number => {
  if (trackEnergy === undefined) {
    return 0.5; // Neutral score if no energy data
  }

  // Calculate distance and convert to similarity score
  const distance = Math.abs(trackEnergy - targetEnergy);
  return 1 - Math.min(distance, 1);
};

/**
 * Calculate tempo match score
 * Returns how well track tempo matches target tempo (0-1)
 *
 * @param trackTempo - Track tempo in BPM
 * @param targetTempo - Target tempo in BPM
 * @param threshold - Max BPM difference for full score (default: 10)
 * @returns Match score (0-1), where 1 = within threshold
 */
export const tempoMatch = (
  trackTempo: number | undefined,
  targetTempo: number | undefined,
  threshold: number = 10,
): number => {
  if (!trackTempo || !targetTempo) {
    return 0.5; // Neutral score if no tempo data
  }

  const difference = Math.abs(trackTempo - targetTempo);
  if (difference <= threshold) {
    return 1.0;
  }

  // Linear falloff beyond threshold (up to 2x threshold)
  return Math.max(0, 1 - (difference - threshold) / threshold);
};

/**
 * Calculate artist spacing penalty
 * Returns a penalty multiplier (0-1) for recently played artists
 *
 * @param artistName - Track artist name
 * @param recentArtists - List of recently played artists
 * @param penaltyAmount - Penalty multiplier (0-1, default: 0.3 = 30% penalty)
 * @returns Penalty multiplier (0.5-1.0), where 1 = no penalty, 0.7 = 30% penalty
 */
export const artistSpacingPenalty = (
  artistName: string | undefined,
  recentArtists: string[] = [],
  penaltyAmount: number = 0.3,
): number => {
  if (!artistName || recentArtists.length === 0) {
    return 1.0; // No penalty
  }

  const wasRecentlyPlayed = recentArtists.some(
    (a) => a.toLowerCase() === artistName.toLowerCase(),
  );

  return wasRecentlyPlayed ? 1 - penaltyAmount : 1.0;
};

/**
 * Calculate genre spacing penalty
 * Returns a penalty multiplier (0-1) for recently played genres
 *
 * @param trackGenres - Track genres
 * @param recentGenres - List of recently played genres
 * @param penaltyAmount - Penalty multiplier (0-1, default: 0.15 = 15% penalty)
 * @returns Penalty multiplier (0.85-1.0), where 1 = no penalty
 */
export const genreSpacingPenalty = (
  trackGenres: string[] = [],
  recentGenres: string[] = [],
  penaltyAmount: number = 0.15,
): number => {
  if (trackGenres.length === 0 || recentGenres.length === 0) {
    return 1.0; // No penalty
  }

  // Check if any track genre was recently played
  const hasRecentGenre = trackGenres.some((tg) =>
    recentGenres.some((rg) => rg.toLowerCase() === tg.toLowerCase()),
  );

  return hasRecentGenre ? 1 - penaltyAmount : 1.0;
};

/**
 * Calculate genre match score
 * Returns how well track genres match target genres (0-1)
 *
 * Uses multi-level matching:
 * 1. Exact matches (0.7-1.0): Same genre name
 * 2. Substring matches (0.5-0.7): One contains the other
 * 3. Similar genres (0.4-0.6): Related genres via EveryNoise/Voltraco data
 * 4. No match (0.3): No relationship found
 *
 * @param trackGenres - Track genres
 * @param targetGenres - Target genres to match (from playlist config or recent history)
 * @returns Match score (0-1), where 1 = exact match
 */
export const genreMatchScore = async (
  trackGenres: string[] = [],
  targetGenres: string[] = [],
): Promise<number> => {
  if (trackGenres.length === 0 || targetGenres.length === 0) {
    return 0.5; // Neutral score if no genre data
  }

  // Count exact matches
  const exactMatches = trackGenres.filter((tg) =>
    targetGenres.some((target) => target.toLowerCase() === tg.toLowerCase()),
  ).length;

  if (exactMatches > 0) {
    // Normalize by track genre count (more matches = higher score)
    return 0.7 + 0.3 * Math.min(exactMatches / trackGenres.length, 1);
  }

  // Check for partial matches (substring matching)
  const partialMatches = trackGenres.filter((tg) =>
    targetGenres.some(
      (target) =>
        tg.toLowerCase().includes(target.toLowerCase()) ||
        target.toLowerCase().includes(tg.toLowerCase()),
    ),
  ).length;

  if (partialMatches > 0) {
    return 0.5 + 0.2 * Math.min(partialMatches / trackGenres.length, 1);
  }

  // Check for similar genres using genre similarity service
  // Import lazily to avoid circular dependencies
  const { getGenreSimilarityService } = await import('../metadata/genre-similarity.js');
  const similarityService = getGenreSimilarityService();

  let similarMatches = 0;
  for (const trackGenre of trackGenres) {
    for (const targetGenre of targetGenres) {
      const isSimilar = await similarityService.areGenresSimilar(trackGenre, targetGenre);
      if (isSimilar) {
        similarMatches++;
        break; // Count each track genre only once
      }
    }
  }

  if (similarMatches > 0) {
    return 0.4 + 0.2 * Math.min(similarMatches / trackGenres.length, 1);
  }

  return 0.3; // Some penalty for no match
};

/**
 * Calculate mood similarity score using cosine similarity
 * Returns how similar track mood vector is to target mood vector (0-1)
 *
 * @param trackMoodVector - Track mood vector (mood -> confidence)
 * @param targetMoodVector - Target mood vector (mood -> confidence)
 * @returns Similarity score (0-1), where 1 = identical moods
 */
export const moodSimilarity = (
  trackMoodVector: Record<string, number> = {},
  targetMoodVector: Record<string, number> = {},
): number => {
  const trackMoods = Object.keys(trackMoodVector);
  const targetMoods = Object.keys(targetMoodVector);

  if (trackMoods.length === 0 || targetMoods.length === 0) {
    return 0.5; // Neutral score if no mood data
  }

  // Calculate cosine similarity
  let dotProduct = 0;
  let trackMagnitude = 0;
  let targetMagnitude = 0;

  // Get all unique mood keys
  const allMoods = new Set([...trackMoods, ...targetMoods]);

  for (const mood of allMoods) {
    const trackValue = trackMoodVector[mood] || 0;
    const targetValue = targetMoodVector[mood] || 0;

    dotProduct += trackValue * targetValue;
    trackMagnitude += trackValue * trackValue;
    targetMagnitude += targetValue * targetValue;
  }

  if (trackMagnitude === 0 || targetMagnitude === 0) {
    return 0.5;
  }

  const similarity =
    dotProduct / (Math.sqrt(trackMagnitude) * Math.sqrt(targetMagnitude));

  // Normalize to 0-1 (cosine similarity is -1 to 1)
  return (similarity + 1) / 2;
};

/**
 * Calculate discovery/exploration boost for tracks
 * Returns an additive boost (0-0.20) that rewards discovery and exploration
 *
 * @param viewCount - Number of times track was played
 * @param addedAt - Date track was added to library (optional)
 * @param now - Current date for recency calculations
 * @returns Boost value (0-0.20) to add to base score
 *
 * Boosts:
 * - Never-played tracks: +0.15 (strong discovery incentive)
 * - Low-playcount tracks (1-5 plays): +0.10 (moderate discovery)
 * - Recently-added tracks (≤30 days): +0.05 with linear decay (explore new additions)
 *
 * Examples:
 * - 0 plays, added today → 0.20 boost (0.15 never-played + 0.05 new)
 * - 0 plays, added 1 year ago → 0.15 boost (0.15 never-played only)
 * - 3 plays, added 15 days ago → 0.125 boost (0.10 low-play + 0.025 new)
 * - 10 plays, added 2 years ago → 0 boost (no incentives)
 */
export const explorationBoost = (
  viewCount: number,
  addedAt?: Date,
  now: Date = new Date(),
): number => {
  let boost = 0;

  // Never-played tracks (strong discovery incentive)
  if (viewCount === 0) {
    boost += 0.15;
  }
  // Low-playcount tracks (1-5 plays)
  else if (viewCount <= 5) {
    boost += 0.1;
  }

  // Recently-added tracks (within 30 days)
  if (addedAt) {
    const daysSinceAdded =
      (now.getTime() - addedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAdded <= 30) {
      boost += 0.05 * (1 - daysSinceAdded / 30); // Linear decay
    }
  }

  return boost;
};
