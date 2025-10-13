import { getDb } from '../db/index.js';
import { artistCache } from '../db/schema.js';
import { logger } from '../logger.js';
import type { MusicSection, Section } from '@ctrl/plex';

export interface DiscoveredGenre {
  genre: string;
  artistCount: number;
  source: 'spotify' | 'lastfm' | 'both';
}

export interface DiscoveredMood {
  mood: string;
  trackCount: number;
  avgRating: number;
  avgPlayCount: number;
}

/**
 * Analyze the genre cache and discover genres with enough artists
 * NOTE: This function is deprecated in favor of mood-based discovery
 */
export async function discoverGenres(minArtists = 5, maxPlaylists = 20, exclude: string[] = []): Promise<DiscoveredGenre[]> {
  // Legacy function - keeping for potential future use
  const config = { enabled: false, minArtists, maxPlaylists, exclude };

  if (!config.enabled) {
    logger.debug('genre auto-discovery is disabled');
    return [];
  }

  const db = getDb();

  try {
    // Get all cached genres
    const cachedArtists = await db
      .select({
        artistName: artistCache.artistName,
        genres: artistCache.genres,
        source: artistCache.source
      })
      .from(artistCache);

    if (cachedArtists.length === 0) {
      logger.warn('no cached genres found for auto-discovery');
      return [];
    }

    // Count artists per genre
    const genreArtistMap = new Map<string, Set<string>>();
    const genreSourceMap = new Map<string, Set<string>>();

    for (const artist of cachedArtists) {
      try {
        const genres = JSON.parse(artist.genres) as string[];
        for (const genre of genres) {
          const normalizedGenre = genre.toLowerCase().trim();

          // Skip excluded genres
          if (config.exclude.includes(normalizedGenre)) {
            continue;
          }

          // Track artists for this genre
          if (!genreArtistMap.has(normalizedGenre)) {
            genreArtistMap.set(normalizedGenre, new Set());
            genreSourceMap.set(normalizedGenre, new Set());
          }

          genreArtistMap.get(normalizedGenre)!.add(artist.artistName);
          genreSourceMap.get(normalizedGenre)!.add(artist.source);
        }
      } catch {
        logger.warn({ artistName: artist.artistName }, 'failed to parse genres');
      }
    }

    // Convert to DiscoveredGenre array
    const discovered: DiscoveredGenre[] = [];

    for (const [genre, artists] of genreArtistMap.entries()) {
      if (artists.size >= config.minArtists) {
        const sources = genreSourceMap.get(genre)!;
        const source = sources.size > 1 ? 'both' : (sources.values().next().value as 'spotify' | 'lastfm');

        discovered.push({
          genre,
          artistCount: artists.size,
          source
        });
      }
    }

    // Sort by artist count descending
    discovered.sort((a, b) => b.artistCount - a.artistCount);

    // Limit to maxPlaylists
    const limited = discovered.slice(0, config.maxPlaylists);

    logger.info(
      {
        totalGenres: genreArtistMap.size,
        discoveredAboveThreshold: discovered.length,
        selected: limited.length,
        minArtists: config.minArtists,
        maxPlaylists: config.maxPlaylists
      },
      'genre discovery complete'
    );

    if (limited.length > 0) {
      logger.debug(
        { genres: limited.map(g => `${g.genre} (${g.artistCount})`) },
        'discovered genres'
      );
    }

    return limited;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, 'genre discovery failed');
    return [];
  }
}

/**
 * Discover moods based on user's listening habits
 * Analyzes high-rated and frequently-played tracks to find dominant moods
 *
 * @param options Configuration for mood discovery
 * @returns Array of discovered moods sorted by weighted score
 */
export async function discoverMoods(options: {
  minTracks?: number;
  maxPlaylists?: number;
  considerStarRatings?: boolean;
  considerPlayCount?: boolean;
}): Promise<DiscoveredMood[]> {
  const {
    minTracks = 20,
    maxPlaylists = 10,
    considerStarRatings = true,
    considerPlayCount = true
  } = options;

  const db = getDb();

  try {
    // Get all cached artist moods
    const cachedArtists = await db
      .select({
        artistName: artistCache.artistName,
        moods: artistCache.moods
      })
      .from(artistCache);

    if (cachedArtists.length === 0) {
      logger.warn('no cached moods found for auto-discovery');
      return [];
    }

    // Import Plex client
    const { getPlexServer } = await import('../plex/client.js');
    const plex = await getPlexServer();
    const library = await plex.library();
    const sections = await library.sections();

    // Type guard for MusicSection
    const isMusicSection = (section: Section): section is MusicSection =>
      (section as MusicSection).searchTracks !== undefined && section.CONTENT_TYPE === 'audio';

    const musicSection = sections.find(isMusicSection);

    if (!musicSection) {
      logger.warn('no music section found in Plex');
      return [];
    }

    // Fetch all tracks with ratings and play counts
    // Note: This might be slow for large libraries, consider caching
    const allTracks = await musicSection.searchTracks();

    // Map artist names to moods
    const artistMoodMap = new Map<string, string[]>();
    for (const artist of cachedArtists) {
      try {
        const moods = JSON.parse(artist.moods || '[]') as string[];
        if (moods.length > 0) {
          artistMoodMap.set(artist.artistName.toLowerCase(), moods);
        }
      } catch {
        // Skip malformed entries
      }
    }

    // Analyze tracks and aggregate mood data
    const moodData = new Map<string, { trackCount: number; totalRating: number; totalPlayCount: number }>();

    for (const track of allTracks) {
      const artistName = track.grandparentTitle?.toLowerCase();
      if (!artistName) continue;

      const rating = track.userRating || 0; // Plex uses 0-10 scale (0-5 stars * 2)
      const playCount = track.viewCount || 0;

      // Filter: Only consider tracks with decent ratings or play counts
      const meetsRatingThreshold = considerStarRatings && rating >= 8; // 4+ stars
      const meetsPlayCountThreshold = considerPlayCount && playCount >= 3; // 3+ plays

      if (!meetsRatingThreshold && !meetsPlayCountThreshold) {
        continue;
      }

      // Get moods for this artist
      const moods = artistMoodMap.get(artistName);
      if (!moods || moods.length === 0) continue;

      // Attribute this track to all moods of the artist
      for (const mood of moods) {
        const normalizedMood = mood.toLowerCase().trim();

        if (!moodData.has(normalizedMood)) {
          moodData.set(normalizedMood, { trackCount: 0, totalRating: 0, totalPlayCount: 0 });
        }

        const data = moodData.get(normalizedMood)!;
        data.trackCount++;
        data.totalRating += rating;
        data.totalPlayCount += playCount;
      }
    }

    // Convert to DiscoveredMood array with averages
    const discovered: DiscoveredMood[] = [];

    for (const [mood, data] of moodData.entries()) {
      if (data.trackCount >= minTracks) {
        discovered.push({
          mood,
          trackCount: data.trackCount,
          avgRating: data.totalRating / data.trackCount,
          avgPlayCount: data.totalPlayCount / data.trackCount
        });
      }
    }

    // Sort by weighted score (rating * 0.6 + playCount * 0.4)
    discovered.sort((a, b) => {
      const scoreA = (a.avgRating / 10) * 0.6 + Math.min(a.avgPlayCount / 10, 1) * 0.4;
      const scoreB = (b.avgRating / 10) * 0.6 + Math.min(b.avgPlayCount / 10, 1) * 0.4;
      return scoreB - scoreA;
    });

    // Limit to maxPlaylists
    const limited = discovered.slice(0, maxPlaylists);

    logger.info(
      {
        totalMoods: moodData.size,
        discoveredAboveThreshold: discovered.length,
        selected: limited.length,
        minTracks,
        maxPlaylists
      },
      'mood discovery complete'
    );

    if (limited.length > 0) {
      logger.debug(
        { moods: limited.map(m => `${m.mood} (${m.trackCount} tracks, avg rating: ${m.avgRating.toFixed(1)})`) },
        'discovered moods'
      );
    }

    return limited;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, 'mood discovery failed');
    return [];
  }
}

/**
 * Get a summary of available genres for CLI display
 */
export async function getGenreSummary(): Promise<Map<string, number>> {
  const db = getDb();
  const genreCount = new Map<string, number>();

  try {
    const cachedArtists = await db
      .select({
        genres: artistCache.genres
      })
      .from(artistCache);

    for (const artist of cachedArtists) {
      try {
        const genres = JSON.parse(artist.genres) as string[];
        for (const genre of genres) {
          const normalizedGenre = genre.toLowerCase().trim();
          genreCount.set(normalizedGenre, (genreCount.get(normalizedGenre) || 0) + 1);
        }
      } catch {
        // Skip malformed entries
      }
    }
  } catch (error) {
    logger.error({ error }, 'failed to generate genre summary');
  }

  return genreCount;
}

/**
 * Get a summary of available moods for UI display
 */
export async function getMoodSummary(): Promise<Map<string, number>> {
  const db = getDb();
  const moodCount = new Map<string, number>();

  try {
    const cachedArtists = await db
      .select({
        moods: artistCache.moods
      })
      .from(artistCache);

    for (const artist of cachedArtists) {
      try {
        const moods = JSON.parse(artist.moods || '[]') as string[];
        for (const mood of moods) {
          const normalizedMood = mood.toLowerCase().trim();
          moodCount.set(normalizedMood, (moodCount.get(normalizedMood) || 0) + 1);
        }
      } catch {
        // Skip malformed entries
      }
    }
  } catch (error) {
    logger.error({ error }, 'failed to generate mood summary');
  }

  return moodCount;
}
