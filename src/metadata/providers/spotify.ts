import got from 'got';
import { logger } from '../../logger.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

interface SpotifyAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers?: {
    total: number;
  };
  images?: Array<{
    url: string;
    height: number;
    width: number;
  }>;
}

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
    total: number;
  };
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
  genres: string[];
  release_date: string;
  album_type: string;
  images?: Array<{
    url: string;
    height: number;
    width: number;
  }>;
}

interface SpotifyAlbumSearchResponse {
  albums: {
    items: SpotifyAlbum[];
    total: number;
  };
}

export class SpotifyClient {
  private clientId: string | null;
  private clientSecret: string | null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private enabled: boolean;
  private rateLimitResetAt: number = 0;
  private readonly maxRetries: number = 5;
  private readonly baseRetryDelay: number = 1000; // Start with 1 second
  private readonly maxRetryDelay: number = 300000; // Cap at 5 minutes (300 seconds)

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || null;
    this.clientSecret = clientSecret || null;
    this.enabled = !!(clientId && clientSecret);

    if (this.enabled) {
      logger.info({ clientId: this.clientId?.substring(0, 8) + '...' }, 'spotify client initialized');
    } else {
      logger.warn('spotify client disabled (no credentials provided)');
      logger.warn('Get free credentials at: https://developer.spotify.com/dashboard');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if we're currently rate limited and wait if necessary
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    if (now < this.rateLimitResetAt) {
      const waitMs = this.rateLimitResetAt - now;
      logger.info({ waitMs: Math.ceil(waitMs / 1000) }, 'waiting for spotify rate limit to reset');
      await this.sleep(waitMs);
    }
  }

  /**
   * Get access token using client credentials flow
   * Tokens are cached and refreshed automatically when expired
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    try {
      const authString = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await got.post(SPOTIFY_AUTH_URL, {
        form: {
          grant_type: 'client_credentials'
        },
        headers: {
          Authorization: `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: {
          request: 5000
        }
      }).json<SpotifyAuthResponse>();

      this.accessToken = response.access_token;
      this.tokenExpiresAt = Date.now() + (response.expires_in * 1000);

      logger.debug(
        { expiresIn: response.expires_in },
        'spotify access token obtained'
      );

      return this.accessToken;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg }, 'spotify auth failed');
      return null;
    }
  }

  /**
   * Search for an artist and return their genres and popularity
   * Implements exponential backoff retry for rate limits
   */
  async searchArtist(artistName: string): Promise<SpotifyArtist | null> {
    if (!artistName || !this.enabled) {
      return null;
    }

    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    // Wait if we're currently rate limited
    await this.waitForRateLimit();

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await got.get(`${SPOTIFY_API_BASE}/search`, {
          searchParams: {
            q: artistName,
            type: 'artist',
            limit: 1
          },
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: {
            request: 10000
          },
          retry: {
            limit: 0 // We handle retries manually for better control
          }
        }).json<SpotifySearchResponse>();

        const artists = response.artists?.items || [];
        if (artists.length === 0) {
          logger.debug({ artistName }, 'no artist found on spotify');
          return null;
        }

        const artist = artists[0];

        // Check if it's a reasonable match (fuzzy name comparison)
        const normalizedQuery = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedResult = artist.name.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (!normalizedResult.includes(normalizedQuery) && !normalizedQuery.includes(normalizedResult)) {
          logger.debug(
            { artistName, foundName: artist.name },
            'spotify artist name mismatch'
          );
          return null;
        }

        logger.debug(
          {
            artistName,
            spotifyName: artist.name,
            genres: artist.genres,
            popularity: artist.popularity
          },
          'artist found on spotify'
        );

        return artist;
      } catch (error) {
        const isRateLimit = (error as { response?: { statusCode?: number } }).response?.statusCode === 429;
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (isRateLimit) {
          // Extract Retry-After header (in seconds)
          const retryAfter = (error as { response?: { headers?: Record<string, string> } }).response?.headers?.['retry-after'];
          const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;

          // Calculate backoff delay with cap
          const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt);
          const uncappedDelay = retryAfterMs || exponentialDelay;
          const delayMs = Math.min(uncappedDelay, this.maxRetryDelay);

          // Set global rate limit if Retry-After is provided (capped)
          if (retryAfterMs) {
            this.rateLimitResetAt = Date.now() + delayMs;
          }

          const wasCapped = uncappedDelay > this.maxRetryDelay;
          logger.warn(
            {
              artistName,
              attempt: attempt + 1,
              maxRetries: this.maxRetries,
              delaySeconds: Math.ceil(delayMs / 1000),
              retryAfter: retryAfter || 'not provided',
              cappedFrom: wasCapped ? Math.ceil(uncappedDelay / 1000) : undefined
            },
            'spotify rate limit hit, retrying after delay'
          );

          // Don't retry if this is the last attempt
          if (attempt < this.maxRetries - 1) {
            await this.sleep(delayMs);
            continue;
          }
        }

        // For non-rate-limit errors or final attempt, log and return null
        if (attempt === this.maxRetries - 1) {
          logger.warn(
            { artistName, error: errorMsg, attempts: this.maxRetries },
            'spotify search failed after all retries'
          );
        }
        return null;
      }
    }

    return null;
  }

  /**
   * Get genres for an artist
   * Returns array of genre strings sorted by Spotify's internal ranking
   */
  async getArtistGenres(artistName: string): Promise<string[]> {
    const artist = await this.searchArtist(artistName);
    if (!artist || !artist.genres) {
      return [];
    }

    // Spotify genres are already normalized to lowercase
    return artist.genres.slice(0, 10);
  }

  /**
   * Get artist info including genres, popularity, and followers
   */
  async getArtistInfo(artistName: string): Promise<{
    name: string;
    genres: string[];
    popularity: number;
    followers?: number;
  } | null> {
    const artist = await this.searchArtist(artistName);
    if (!artist) {
      return null;
    }

    return {
      name: artist.name,
      genres: artist.genres || [],
      popularity: artist.popularity,
      followers: artist.followers?.total
    };
  }

  /**
   * Search for an album by artist and album name
   * Implements exponential backoff retry for rate limits
   */
  async searchAlbum(artistName: string, albumName: string): Promise<SpotifyAlbum | null> {
    if (!artistName || !albumName || !this.enabled) {
      return null;
    }

    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    // Wait if we're currently rate limited
    await this.waitForRateLimit();

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const query = `album:${albumName} artist:${artistName}`;
        const response = await got.get(`${SPOTIFY_API_BASE}/search`, {
          searchParams: {
            q: query,
            type: 'album',
            limit: 5 // Get top 5 to find best match
          },
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: {
            request: 10000
          },
          retry: {
            limit: 0 // We handle retries manually for better control
          }
        }).json<SpotifyAlbumSearchResponse>();

        const albums = response.albums?.items || [];
        if (albums.length === 0) {
          logger.debug({ artistName, albumName }, 'no album found on spotify');
          return null;
        }

        // Find best match by comparing normalized names
        const normalizedAlbumQuery = albumName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedArtistQuery = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');

        let bestMatch: SpotifyAlbum | null = null;
        for (const album of albums) {
          const normalizedAlbumResult = album.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const normalizedArtistResult = album.artists[0]?.name.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

          // Check if both album and artist match
          const albumMatches = normalizedAlbumResult.includes(normalizedAlbumQuery) ||
                               normalizedAlbumQuery.includes(normalizedAlbumResult);
          const artistMatches = normalizedArtistResult.includes(normalizedArtistQuery) ||
                                normalizedArtistQuery.includes(normalizedArtistResult);

          if (albumMatches && artistMatches) {
            bestMatch = album;
            break; // Use first matching album
          }
        }

        if (!bestMatch) {
          logger.debug(
            { artistName, albumName, foundAlbums: albums.map(a => a.name) },
            'no matching album found on spotify'
          );
          return null;
        }

        // Fetch full album details to get genres (search results may not include genres)
        const albumDetails = await this.getAlbumById(bestMatch.id);

        logger.debug(
          {
            artistName,
            albumName,
            spotifyAlbum: bestMatch.name,
            spotifyArtist: bestMatch.artists[0]?.name,
            genres: albumDetails?.genres || []
          },
          'album found on spotify'
        );

        return albumDetails || bestMatch;
      } catch (error) {
        const isRateLimit = (error as { response?: { statusCode?: number } }).response?.statusCode === 429;
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (isRateLimit) {
          // Extract Retry-After header (in seconds)
          const retryAfter = (error as { response?: { headers?: Record<string, string> } }).response?.headers?.['retry-after'];
          const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;

          // Calculate backoff delay with cap
          const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt);
          const uncappedDelay = retryAfterMs || exponentialDelay;
          const delayMs = Math.min(uncappedDelay, this.maxRetryDelay);

          // Set global rate limit if Retry-After is provided (capped)
          if (retryAfterMs) {
            this.rateLimitResetAt = Date.now() + delayMs;
          }

          const wasCapped = uncappedDelay > this.maxRetryDelay;
          logger.warn(
            {
              artistName,
              albumName,
              attempt: attempt + 1,
              maxRetries: this.maxRetries,
              delaySeconds: Math.ceil(delayMs / 1000),
              retryAfter: retryAfter || 'not provided',
              cappedFrom: wasCapped ? Math.ceil(uncappedDelay / 1000) : undefined
            },
            'spotify rate limit hit, retrying after delay'
          );

          // Don't retry if this is the last attempt
          if (attempt < this.maxRetries - 1) {
            await this.sleep(delayMs);
            continue;
          }
        }

        // For non-rate-limit errors or final attempt, log and return null
        if (attempt === this.maxRetries - 1) {
          logger.warn(
            { artistName, albumName, error: errorMsg, attempts: this.maxRetries },
            'spotify album search failed after all retries'
          );
        }
        return null;
      }
    }

    return null;
  }

  /**
   * Get album details by Spotify ID
   * Used to fetch full album info including genres
   */
  async getAlbumById(albumId: string): Promise<SpotifyAlbum | null> {
    if (!albumId || !this.enabled) {
      return null;
    }

    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    await this.waitForRateLimit();

    try {
      const album = await got.get(`${SPOTIFY_API_BASE}/albums/${albumId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: {
          request: 10000
        }
      }).json<SpotifyAlbum>();

      return album;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ albumId, error: errorMsg }, 'spotify get album by id failed');
      return null;
    }
  }

  /**
   * Get genres for an album
   * Returns array of genre strings from Spotify
   * Note: Spotify album genres often come from the artist, but can be more specific
   */
  async getAlbumGenres(artistName: string, albumName: string): Promise<string[]> {
    const album = await this.searchAlbum(artistName, albumName);
    if (!album || !album.genres) {
      return [];
    }

    // Spotify genres are already normalized to lowercase
    return album.genres.slice(0, 10);
  }
}

// Singleton instance
let spotifyClient: SpotifyClient | null = null;

export const getSpotifyClient = (clientId?: string, clientSecret?: string): SpotifyClient => {
  if (!spotifyClient) {
    spotifyClient = new SpotifyClient(clientId, clientSecret);
  }
  return spotifyClient;
};
