import { getEnabledGenrePlaylists, getAutoDiscoverConfig } from './config/playlist-config.js';
import { discoverGenres } from './config/genre-discovery.js';
import { logger } from './logger.js';

// Time-based windows for daily playlists (stable)
export const TIME_WINDOWS = ['morning', 'afternoon', 'evening'] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

// Genre windows are now dynamic - loaded from config
export type GenreWindow = string;
export type PlaylistWindow = TimeWindow | GenreWindow;

export interface TimeWindowDefinition {
  type: 'time';
  window: TimeWindow;
  startHour: number; // inclusive
  endHour: number; // inclusive hour (23 for 23:59)
}

export interface GenreWindowDefinition {
  type: 'genre';
  window: string;
  genre: string; // Genre name for filtering (may differ from window name)
  cron?: string;
  autoDiscovered?: boolean;
}

export type WindowDefinition = TimeWindowDefinition | GenreWindowDefinition;

export const DEFAULT_TIME_WINDOWS: TimeWindowDefinition[] = [
  { type: 'time', window: 'morning', startHour: 6, endHour: 11 },
  { type: 'time', window: 'afternoon', startHour: 12, endHour: 17 },
  { type: 'time', window: 'evening', startHour: 18, endHour: 23 }
];

/**
 * Get all genre windows from config (pinned + auto-discovered)
 */
export async function getGenreWindows(): Promise<GenreWindowDefinition[]> {
  const windows: GenreWindowDefinition[] = [];

  // 1. Load pinned playlists from config
  const pinned = getEnabledGenrePlaylists();
  for (const playlist of pinned) {
    windows.push({
      type: 'genre',
      window: playlist.name,
      genre: playlist.genre,
      cron: playlist.cron,
      autoDiscovered: false
    });
  }

  // 2. Auto-discover genres if enabled
  const autoDiscoverConfig = getAutoDiscoverConfig();
  if (autoDiscoverConfig.enabled) {
    try {
      const discovered = await discoverGenres();

      // Filter out genres that are already pinned
      const pinnedGenres = new Set(pinned.map(p => p.genre.toLowerCase()));

      for (const genre of discovered) {
        if (!pinnedGenres.has(genre.genre)) {
          windows.push({
            type: 'genre',
            window: genre.genre.replace(/\s+/g, '-'), // Convert "power metal" to "power-metal"
            genre: genre.genre,
            cron: autoDiscoverConfig.schedule,
            autoDiscovered: true
          });
        }
      }

      logger.debug(
        {
          pinned: pinned.length,
          autoDiscovered: discovered.length
        },
        'genre windows loaded'
      );
    } catch (error) {
      logger.error({ error }, 'failed to auto-discover genres');
    }
  }

  return windows;
}

/**
 * Get all windows (time + genre)
 */
export async function getAllWindows(): Promise<WindowDefinition[]> {
  const genreWindows = await getGenreWindows();
  return [...DEFAULT_TIME_WINDOWS, ...genreWindows];
}

/**
 * Get window definition by name
 */
export async function getWindowDefinition(window: PlaylistWindow): Promise<WindowDefinition | null> {
  const allWindows = await getAllWindows();
  return allWindows.find(w => w.window === window) || null;
}

/**
 * Check if a window is a time-based window
 */
export function isTimeWindow(window: PlaylistWindow): window is TimeWindow {
  return TIME_WINDOWS.includes(window as TimeWindow);
}

/**
 * Check if a window is a genre-based window
 */
export async function isGenreWindow(window: PlaylistWindow): Promise<boolean> {
  const genreWindows = await getGenreWindows();
  return genreWindows.some(gw => gw.window === window);
}

/**
 * Get a formatted label for a window
 */
export function windowLabel(window: PlaylistWindow): string {
  if (isTimeWindow(window)) {
    return window.charAt(0).toUpperCase() + window.slice(1);
  }
  // Convert "power-metal" to "Power Metal"
  return window
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
