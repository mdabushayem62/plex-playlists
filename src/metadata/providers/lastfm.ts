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

interface LastFmAlbumInfo {
  album?: {
    name: string;
    artist: string;
    tags?: {
      tag: LastFmTag[];
    };
    wiki?: {
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

      // Last.fm can return a single object instead of an array if there's only one tag
      let tags = response.toptags?.tag || [];
      if (!Array.isArray(tags)) {
        tags = tags ? [tags] : [];
      }

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
      // Last.fm can return a single object instead of an array if there's only one tag
      let tags = artist.tags?.tag || [];
      if (!Array.isArray(tags)) {
        tags = tags ? [tags] : [];
      }
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

  /**
   * Get top tags (genres) for an album
   * Returns array of genre strings sorted by popularity
   */
  async getAlbumGenres(artistName: string, albumName: string): Promise<string[]> {
    if (!artistName || !albumName || !this.apiKey) {
      return [];
    }

    try {
      const response = await got.get(LASTFM_API_BASE, {
        searchParams: {
          method: 'album.getinfo',
          artist: artistName,
          album: albumName,
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
      }).json<LastFmAlbumInfo>();

      if (response.error || !response.album) {
        logger.debug(
          { artistName, albumName, error: response.error, message: response.message },
          'lastfm album not found'
        );
        return [];
      }

      // Last.fm can return a single object instead of an array if there's only one tag
      let tags = response.album.tags?.tag || [];
      if (!Array.isArray(tags)) {
        tags = tags ? [tags] : [];
      }

      if (tags.length === 0) {
        logger.debug({ artistName, albumName }, 'no tags found on lastfm for album');
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
        { artistName, albumName, genres, totalTags: tags.length },
        'genres from lastfm for album'
      );

      return genres;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ artistName, albumName, error: errorMsg }, 'lastfm album request failed');
      return [];
    }
  }

  /**
   * Get detailed album info including tags and wiki
   */
  async getAlbumInfo(artistName: string, albumName: string): Promise<{
    name: string;
    artist: string;
    genres: string[];
    wiki?: string;
  } | null> {
    if (!artistName || !albumName || !this.apiKey) {
      return null;
    }

    try {
      const response = await got.get(LASTFM_API_BASE, {
        searchParams: {
          method: 'album.getinfo',
          artist: artistName,
          album: albumName,
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
      }).json<LastFmAlbumInfo>();

      if (response.error || !response.album) {
        logger.warn(
          { artistName, albumName, error: response.error, message: response.message },
          'lastfm album getinfo error'
        );
        return null;
      }

      const album = response.album;
      // Last.fm can return a single object instead of an array if there's only one tag
      let tags = album.tags?.tag || [];
      if (!Array.isArray(tags)) {
        tags = tags ? [tags] : [];
      }
      const genres = tags
        .map(tag => tag.name.toLowerCase())
        .slice(0, 10);

      return {
        name: album.name,
        artist: album.artist,
        genres,
        wiki: album.wiki?.summary
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ artistName, albumName, error: errorMsg }, 'lastfm album getinfo failed');
      return null;
    }
  }
}

// Singleton instance with caching
let lastfmClient: LastFmClient | null = null;
let cachedApiKey: string | undefined = undefined;

export const getLastFmClient = (apiKey?: string): LastFmClient => {
  // Reinitialize if API key changed (including from undefined to defined)
  if (!lastfmClient || cachedApiKey !== apiKey) {
    lastfmClient = new LastFmClient(apiKey);
    cachedApiKey = apiKey;
  }
  return lastfmClient;
};
