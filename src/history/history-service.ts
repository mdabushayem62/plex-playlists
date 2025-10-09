import { subDays } from 'date-fns';

import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import { getPlexServer } from '../plex/client.js';
import type { PlaylistWindow, TimeWindowDefinition } from '../windows.js';
import { DEFAULT_TIME_WINDOWS } from '../windows.js';

// Type definition from @ctrl/plex (not exported from main module)
interface HistoryMetadatum {
  type?: string;
  key?: string;
  parentKey?: string;
  grandparentKey?: string;
  viewedAt: number;
  accountID: number;
}

export interface HistoryEntry {
  ratingKey: string;
  viewedAt: Date;
  accountId: number;
}

const TIME_WINDOW_LOOKUP = Object.fromEntries(DEFAULT_TIME_WINDOWS.map(w => [w.window, w]));

const getTimeWindowDefinition = (window: PlaylistWindow): TimeWindowDefinition | null => {
  return TIME_WINDOW_LOOKUP[window] || null;
};

const isWithinTimeWindow = (date: Date, windowDef: TimeWindowDefinition): boolean => {
  const { startHour, endHour } = windowDef;
  const hour = date.getHours();
  return hour >= startHour && hour <= endHour;
};

const extractRatingKey = (metadata: HistoryMetadatum): string | null => {
  const key = metadata.key ?? metadata.parentKey ?? metadata.grandparentKey;
  if (!key) {
    return null;
  }
  const match = key.match(/\/library\/metadata\/(\d+)/);
  return match?.[1] ?? null;
};

const toDate = (viewedAt: number): Date => {
  // Plex history typically uses seconds; fall back to ms if value is large.
  if (viewedAt > 1_000_000_000_000) {
    return new Date(viewedAt);
  }
  return new Date(viewedAt * 1000);
};

export const fetchHistoryForWindow = async (
  window: PlaylistWindow,
  days: number = APP_ENV.HISTORY_DAYS,
  maxresults = 5000
): Promise<HistoryEntry[]> => {
  const server = await getPlexServer();
  const mindate = subDays(new Date(), days);
  const timeWindowDef = getTimeWindowDefinition(window);
  const windowType = timeWindowDef ? 'time' : 'genre';

  logger.debug({ window, mindate, maxresults, windowType }, 'fetching history slice');
  const history = await server.history(maxresults, mindate);

  if (!history || !Array.isArray(history)) {
    logger.warn({ history }, 'history response is not an array');
    return [];
  }

  const filtered: HistoryEntry[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') {
      logger.debug({ item }, 'skipping invalid history item');
      continue;
    }
    if (item.type !== 'track') {
      continue;
    }
    const viewedAt = toDate(item.viewedAt);

    // For time windows, filter by hour of day; for genre windows, include all times
    if (timeWindowDef && !isWithinTimeWindow(viewedAt, timeWindowDef)) {
      continue;
    }

    const ratingKey = extractRatingKey(item);
    if (!ratingKey) {
      continue;
    }

    filtered.push({ ratingKey, viewedAt, accountId: item.accountID });
  }

  logger.debug({ window, count: filtered.length }, 'history slice ready');
  return filtered;
};
