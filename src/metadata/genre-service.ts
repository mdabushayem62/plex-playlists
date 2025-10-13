/**
 * Genre service
 * Handles genre normalization, filtering, ignore list management, and statistics
 */

import { logger } from '../logger.js';
import { getDb } from '../db/index.js';
import { artistCache } from '../db/schema.js';

/**
 * Default meta-genres to ignore (overly broad categories that provide little specificity)
 * These are filtered out during playlist generation but kept in cache for analytics
 */
export const DEFAULT_GENRE_IGNORE_LIST = [
  'electronic',
  'pop/rock',
  'club/dance',
  'pop',
  'rock',
  'dance',
  'alternative',
  'indie',
  'experimental',
  'edm',
  'metal',
  'jazz',
  'hip-hop',
  'hip hop',
  'ambient',
  'techno',
  'house',
  'trance'
];

/**
 * Genre mapping rules for normalization
 * Maps variations to a canonical form
 */
const GENRE_NORMALIZATION_MAP: Record<string, string> = {
  // Hyphenated compounds (prefer hyphen for compound adjectives)
  'electro swing': 'electro-swing',
  'synth pop': 'synth-pop',
  synthpop: 'synth-pop',
  'tech house': 'tech-house',
  'trip hop': 'trip-hop',
  'nu jazz': 'nu-jazz',
  'nu disco': 'nu-disco',
  'post hardcore': 'post-hardcore',
  'folk metal': 'folk-metal',
  'jazz funk': 'jazz-funk',
  'jazz rock': 'jazz-rock',
  'italo disco': 'italo-disco',
  'chill out': 'chillout',
  'chill-out': 'chillout',

  // Slash compounds (prefer slash for blended genres)
  'pop rock': 'pop/rock',
  'singer-songwriter': 'singer/songwriter',
  'singer songwriter': 'singer/songwriter',

  // Space normalization
  "jungle/drum'n'bass": 'jungle/drum-n-bass',
  "drum'n'bass": 'drum-n-bass',
  "drum and bass": 'drum-n-bass',
  'drum & bass': 'drum-n-bass',
  'dnb': 'drum-n-bass',

  // Hip-hop variations
  'hip hop': 'hip-hop',
  hiphop: 'hip-hop',

  // K-pop variations
  kpop: 'k-pop',
  'k pop': 'k-pop',

  // Common abbreviations and variations
  'r&b': 'rnb',
  'r & b': 'rnb',
  'rhythm and blues': 'rnb'
};

/**
 * Normalize a single genre string
 * - Lowercase
 * - Trim whitespace
 * - Apply normalization rules
 * - Standardize punctuation
 *
 * @param genre - Raw genre string
 * @returns Normalized genre string
 */
export function normalizeGenre(genre: string): string {
  if (!genre) return '';

  // Step 1: Lowercase and trim
  let normalized = genre.toLowerCase().trim();

  // Step 2: Apply specific normalization rules
  if (GENRE_NORMALIZATION_MAP[normalized]) {
    normalized = GENRE_NORMALIZATION_MAP[normalized];
  }

  // Step 3: Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  // Step 4: Remove leading/trailing hyphens or slashes
  normalized = normalized.replace(/^[-/]+|[-/]+$/g, '');

  return normalized;
}

/**
 * Normalize an array of genres
 * - Normalizes each genre
 * - Removes duplicates (after normalization)
 * - Sorts alphabetically for consistency
 *
 * @param genres - Array of raw genre strings
 * @returns Array of normalized, deduplicated genres
 */
export function normalizeGenres(genres: string[]): string[] {
  if (!Array.isArray(genres) || genres.length === 0) {
    return [];
  }

  // Normalize and deduplicate
  const normalized = genres
    .map(normalizeGenre)
    .filter(g => g.length > 0);

  // Remove duplicates (case-insensitive already handled by normalization)
  const unique = [...new Set(normalized)];

  // Sort for consistency
  return unique.sort();
}

/**
 * Filter out meta-genres from a genre list
 * Meta-genres are overly broad categories that provide little specificity
 *
 * @param genres - Array of genre strings (should be normalized)
 * @param ignoreList - List of genres to filter out
 * @returns Filtered genre array
 */
export function filterMetaGenres(genres: string[], ignoreList: string[]): string[] {
  if (!Array.isArray(genres) || genres.length === 0) {
    return [];
  }

  if (!Array.isArray(ignoreList) || ignoreList.length === 0) {
    return genres;
  }

  // Normalize both the ignore list and genres for case-insensitive matching
  const normalizedIgnoreList = ignoreList.map(g => normalizeGenre(g));
  const ignoreSet = new Set(normalizedIgnoreList);

  // Filter out ignored genres (normalize each genre for comparison)
  const filtered = genres.filter(genre => !ignoreSet.has(normalizeGenre(genre)));

  // If we filtered everything out, return the original list
  // (better to have broad genres than no genres at all)
  if (filtered.length === 0) {
    logger.debug(
      { genres, ignoreList: normalizedIgnoreList },
      'genre filtering removed all genres, keeping original list'
    );
    return genres;
  }

  return filtered;
}

/**
 * Normalize and filter genres in one operation
 * This is the main entry point for genre processing
 *
 * @param genres - Array of raw genre strings
 * @param ignoreList - Optional list of genres to filter out (defaults to DEFAULT_GENRE_IGNORE_LIST)
 * @returns Normalized and filtered genre array
 */
export function processGenres(
  genres: string[],
  ignoreList: string[] = DEFAULT_GENRE_IGNORE_LIST
): string[] {
  const normalized = normalizeGenres(genres);
  return filterMetaGenres(normalized, ignoreList);
}

/**
 * Check if a genre matches a filter (case-insensitive substring match)
 * Both genre and filter are normalized before comparison
 *
 * @param genre - Genre to check
 * @param filter - Filter string to match against
 * @returns True if genre contains filter
 */
export function genreMatchesFilter(genre: string, filter: string): boolean {
  const normalizedGenre = normalizeGenre(genre);
  const normalizedFilter = normalizeGenre(filter);

  return normalizedGenre.includes(normalizedFilter);
}

/**
 * Check if any genre in a list matches a filter
 *
 * @param genres - Array of genres
 * @param filter - Filter string to match against
 * @returns True if any genre matches
 */
export function genresMatchFilter(genres: string[], filter: string): boolean {
  return genres.some(genre => genreMatchesFilter(genre, filter));
}

// ========== Genre Ignore List Management ==========

export interface GenreIgnoreListStats {
  ignoreList: string[];
  isDefault: boolean;
  statistics: {
    totalArtists: number;
    totalUniqueGenres: number;
    artistsAffected: number;
    genresFilteredCount: number;
    filteredGenres: Array<{
      genre: string;
      artistCount: number;
    }>;
  };
}

/**
 * Get genre ignore list statistics
 * Shows which genres are being filtered and how many artists are affected
 *
 * @param ignoreList - Current ignore list (from settings or default)
 * @returns Statistics about the ignore list impact
 */
export async function getGenreIgnoreListStats(ignoreList: string[]): Promise<GenreIgnoreListStats> {
  const db = getDb();
  const cacheEntries = await db.select().from(artistCache);

  // Parse all genres and count occurrences
  const genreCounts = new Map<string, number>();
  const allGenres = new Set<string>();

  for (const entry of cacheEntries) {
    try {
      const genres = JSON.parse(entry.genres) as string[];
      genres.forEach(genre => {
        allGenres.add(genre);
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });
    } catch {
      // Skip invalid JSON
    }
  }

  // Calculate how many would be affected by filtering
  let artistsAffected = 0;
  let genresFilteredCount = 0;

  for (const entry of cacheEntries) {
    try {
      const genres = JSON.parse(entry.genres) as string[];
      const beforeCount = genres.length;
      const afterCount = genres.filter(g => !ignoreList.includes(g)).length;

      if (afterCount < beforeCount) {
        artistsAffected++;
        genresFilteredCount += (beforeCount - afterCount);
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // Get top genres that are in ignore list
  const filteredGenres = Array.from(genreCounts.entries())
    .filter(([genre]) => ignoreList.includes(genre))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([genre, count]) => ({ genre, artistCount: count }));

  return {
    ignoreList,
    isDefault: JSON.stringify(ignoreList) === JSON.stringify(DEFAULT_GENRE_IGNORE_LIST),
    statistics: {
      totalArtists: cacheEntries.length,
      totalUniqueGenres: allGenres.size,
      artistsAffected,
      genresFilteredCount,
      filteredGenres
    }
  };
}

/**
 * Get all unique genres from cache (for autocomplete/selection UI)
 * Returns genres sorted by popularity (artist count)
 *
 * @returns Array of genres with their artist counts
 */
export async function getAllGenresWithCounts(): Promise<Array<{ genre: string; artistCount: number }>> {
  const db = getDb();
  const cacheEntries = await db.select().from(artistCache);

  // Parse all genres and count occurrences
  const genreCounts = new Map<string, number>();

  for (const entry of cacheEntries) {
    try {
      const genres = JSON.parse(entry.genres) as string[];
      genres.forEach(genre => {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });
    } catch {
      // Skip invalid JSON
    }
  }

  // Sort by popularity
  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre, artistCount]) => ({ genre, artistCount }));
}
