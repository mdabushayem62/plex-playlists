import type { NormalizedTrack, RatingConfig } from './types.js';

const TOP_SONGS_PATTERN = /your.?top.?songs/i;
const LIKED_SONGS_PATTERN = /liked.?songs/i;

export const calculateRating = (track: NormalizedTrack, config: RatingConfig): number => {
  let maxRating = config.curated; // Default to lowest rating

  for (const playlist of track.sourcePlaylists) {
    if (TOP_SONGS_PATTERN.test(playlist)) {
      // "Your Top Songs" playlists get highest rating
      maxRating = Math.max(maxRating, config.topSongs);
    } else if (LIKED_SONGS_PATTERN.test(playlist)) {
      // "Liked Songs" gets medium rating
      maxRating = Math.max(maxRating, config.likedSongs);
    }
  }

  return maxRating;
};

export const getDefaultRatingConfig = (): RatingConfig => {
  return {
    topSongs: 4.5, // 4.5 stars for "Your Top Songs" playlists
    likedSongs: 4.0, // 4 stars for "Liked Songs"
    curated: 3.0 // 3 stars for other curated playlists
  };
};
