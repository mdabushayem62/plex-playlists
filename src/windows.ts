// Time-based windows for daily playlists (stable)
export const TIME_WINDOWS = ['morning', 'afternoon', 'evening'] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

// Special playlist windows
export const SPECIAL_WINDOWS = ['discovery', 'throwback'] as const;
export type SpecialWindow = (typeof SPECIAL_WINDOWS)[number];

// Cache maintenance windows
export const CACHE_WINDOWS = ['cache-warm', 'cache-refresh', 'custom-playlists'] as const;
export type CacheWindow = (typeof CACHE_WINDOWS)[number];

// Playlist window can be time-based, special, custom (database-driven), or cache maintenance
export type PlaylistWindow = TimeWindow | SpecialWindow | CacheWindow | string;

export interface TimeWindowDefinition {
  type: 'time';
  window: TimeWindow;
  startHour: number; // inclusive
  endHour: number; // inclusive hour (23 for 23:59)
}

export interface SpecialWindowDefinition {
  type: 'special';
  window: SpecialWindow;
  cron?: string;
  description?: string;
}

// Genre windows deprecated - custom playlists (stored in database) replaced this feature

export type WindowDefinition = TimeWindowDefinition | SpecialWindowDefinition;

export const DEFAULT_TIME_WINDOWS: TimeWindowDefinition[] = [
  { type: 'time', window: 'morning', startHour: 6, endHour: 11 },
  { type: 'time', window: 'afternoon', startHour: 12, endHour: 17 },
  { type: 'time', window: 'evening', startHour: 18, endHour: 23 }
];

export const DEFAULT_SPECIAL_WINDOWS: SpecialWindowDefinition[] = [
  { type: 'special', window: 'discovery', description: 'Weekly rediscovery of forgotten gems' },
  { type: 'special', window: 'throwback', description: 'Nostalgic tracks from 2-5 years ago' }
];

/**
 * Get all windows (time + special only)
 * Note: Custom playlists (genre/mood combinations) are stored in database, not here
 */
export async function getAllWindows(): Promise<WindowDefinition[]> {
  return [...DEFAULT_TIME_WINDOWS, ...DEFAULT_SPECIAL_WINDOWS];
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
