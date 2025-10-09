import got from 'got';
import { logger } from '../../logger.js';

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';

interface LastFmTag {
  name: string;
  count: number;
  url: string;
}

interface LastFmTopTagsResponse {
  toptags?: {
    tag: LastFmTag[];
  };
  error?: number;
  message?: string;
}

interface LastFmArtistInfo {
  artist?: {
    name: string;
    tags?: {
      tag: LastFmTag[];
    };
    bio?: {
      summary: string;
    };
  };
  error?: number;
  message?: string;
}

export class LastFmClient {
  private apiKey: string | null;
  private enabled: boolean;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || null;
    this.enabled = !!apiKey;

    if (this.enabled && this.apiKey) {
      logger.info({ apiKey: this.apiKey.substring(0, 8) + '...' }, 'lastfm client initialized');
    } else {
      logger.warn('lastfm client disabled (no API key provided)');
      logger.warn('Get free API key at: https://www.last.fm/api/account/create');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get top tags (genres) for an artist
   * Returns array of genre strings sorted by popularity
   */
  async getArtistGenres(artistName: string): Promise<string[]> {
    if (!artistName || !this.apiKey) {
      return [];
    }

    try {
      const response = await got.get(LASTFM_API_BASE, {
        searchParams: {
          method: 'artist.gettoptags',
          artist: artistName,
          api_key: this.apiKey,
          format: 'json',
          autocorrect: 1 // Enable name correction
        },
        timeout: {
          request: 5000
        },
        retry: {
          limit: 2,
          methods: ['GET']
        }
      }).json<LastFmTopTagsResponse>();

      if (response.error) {
        logger.warn(
          { artistName, error: response.error, message: response.message },
          'lastfm api error'
        );
        return [];
      }

      const tags = response.toptags?.tag || [];

      if (tags.length === 0) {
        logger.debug({ artistName }, 'no tags found on lastfm');
        return [];
      }

      // Filter and normalize tags
      const genres = tags
        .filter(tag => tag.count > 50) // Only tags with reasonable popularity
        .map(tag => tag.name.toLowerCase())
        .filter(name => {
          // Filter out non-genre tags
          const exclude = ['seen live', 'favorite', 'favourites', 'albums i own', 'beautiful'];
          return !exclude.some(ex => name.includes(ex));
        })
        .slice(0, 10); // Top 10 genres

      logger.debug(
        { artistName, genres, totalTags: tags.length },
        'genres from lastfm'
      );

      return genres;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ artistName, error: errorMsg }, 'lastfm request failed');
      return [];
    }
  }

  /**
   * Get detailed artist info including tags and bio
   */
  async getArtistInfo(artistName: string): Promise<{
    name: string;
    genres: string[];
    bio?: string;
  } | null> {
    if (!artistName || !this.apiKey) {
      return null;
    }

    try {
      const response = await got.get(LASTFM_API_BASE, {
        searchParams: {
          method: 'artist.getinfo',
          artist: artistName,
          api_key: this.apiKey,
          format: 'json',
          autocorrect: 1
        },
        timeout: {
          request: 5000
        },
        retry: {
          limit: 2,
          methods: ['GET']
        }
      }).json<LastFmArtistInfo>();

      if (response.error || !response.artist) {
        logger.warn(
          { artistName, error: response.error, message: response.message },
          'lastfm getinfo error'
        );
        return null;
      }

      const artist = response.artist;
      const tags = artist.tags?.tag || [];
      const genres = tags
        .map(tag => tag.name.toLowerCase())
        .slice(0, 10);

      return {
        name: artist.name,
        genres,
        bio: artist.bio?.summary
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ artistName, error: errorMsg }, 'lastfm getinfo failed');
      return null;
    }
  }
}

// Singleton instance
let lastfmClient: LastFmClient | null = null;

export const getLastFmClient = (apiKey?: string): LastFmClient => {
  if (!lastfmClient) {
    lastfmClient = new LastFmClient(apiKey);
  }
  return lastfmClient;
};
