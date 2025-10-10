import { getDb } from '../db/index.js';
import { genreCache } from '../db/schema.js';
import { logger } from '../logger.js';
import { getAutoDiscoverConfig } from './playlist-config.js';

export interface DiscoveredGenre {
  genre: string;
  artistCount: number;
  source: 'spotify' | 'lastfm' | 'both';
}

/**
 * Analyze the genre cache and discover genres with enough artists
 */
export async function discoverGenres(): Promise<DiscoveredGenre[]> {
  const config = getAutoDiscoverConfig();

  if (!config.enabled) {
    logger.debug('genre auto-discovery is disabled');
    return [];
  }

  const db = getDb();

  try {
    // Get all cached genres
    const cachedArtists = await db
      .select({
        artistName: genreCache.artistName,
        genres: genreCache.genres,
        source: genreCache.source
      })
      .from(genreCache);

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
 * Get a summary of available genres for CLI display
 */
export async function getGenreSummary(): Promise<Map<string, number>> {
  const db = getDb();
  const genreCount = new Map<string, number>();

  try {
    const cachedArtists = await db
      .select({
        genres: genreCache.genres
      })
      .from(genreCache);

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
