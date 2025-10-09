export interface SpotifyTrack {
  trackUri: string;
  trackName: string;
  artistName: string;
  albumName: string;
  sourcePlaylist: string;
}

export interface YouTubeMusicTrack {
  songTitle: string;
  artistName: string;
  albumTitle: string;
  sourcePlaylist: string;
}

export interface NormalizedTrack {
  title: string;
  artist: string;
  album: string;
  sourcePlaylists: string[];
}

export interface RatingConfig {
  topSongs: number; // Rating for "Your Top Songs" playlists
  likedSongs: number; // Rating for "Liked Songs"
  curated: number; // Rating for other playlists
}

export interface ImportResult {
  totalTracks: number;
  matchedTracks: number;
  ratingsSet: number;
  skippedExisting: number;
  errors: string[];
}
