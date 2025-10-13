import { subDays } from 'date-fns';

import type { HistoryResult } from '@ctrl/plex';

import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import { getPlexServer } from '../plex/client.js';
import type { PlaylistWindow, TimeWindowDefinition } from '../windows.js';
import { DEFAULT_TIME_WINDOWS } from '../windows.js';

// Cache for music library section ID (fetched once per session)
let musicLibrarySectionId: string | null = null;

const getMusicLibrarySectionId = async (): Promise<string | null> => {
  if (musicLibrarySectionId) {
    return musicLibrarySectionId;
  }

  try {
    const server = await getPlexServer();
    const library = await server.library();
    const sections = await library.sections();
    const musicSection = sections.find(s => s.CONTENT_TYPE === 'audio');

    if (musicSection) {
      musicLibrarySectionId = musicSection.key;
      logger.debug(
        { sectionId: musicLibrarySectionId, title: musicSection.title },
        'found music library section'
      );
      return musicLibrarySectionId;
    }

    logger.warn('no music library section found');
    return null;
  } catch (error) {
    logger.error({ error }, 'failed to get music library section');
    return null;
  }
};

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

const extractRatingKey = (metadata: HistoryResult): string | null => {
  // Use ratingKey directly from the updated @ctrl/plex types
  return metadata.ratingKey || null;
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

  // Get music library section ID for better filtering
  const librarySectionId = await getMusicLibrarySectionId();

  logger.debug(
    { window, mindate, maxresults, windowType, librarySectionId },
    'fetching history slice'
  );

  // Fetch history with library section filter using fixed @ctrl/plex method
  const history = await server.history(maxresults, mindate, undefined, undefined, librarySectionId ?? undefined);

  if (!Array.isArray(history)) {
    logger.warn(
      {
        historyType: typeof history,
        historyValue: history
      },
      'unexpected history response format'
    );
    return [];
  }

  logger.debug(
    {
      rawHistoryCount: history.length,
      dateRange: { from: mindate.toISOString(), to: new Date().toISOString() }
    },
    'received history from plex'
  );

  // Log type breakdown for debugging
  if (history.length > 0) {
    const typeCounts = history
      .filter((item): item is HistoryResult => item != null && typeof item === 'object')
      .reduce((acc: Record<string, number>, item: HistoryResult) => {
        const type = item?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    logger.debug({ typeCounts }, 'history entry types');
  } else {
    logger.warn(
      { days, mindate, librarySectionId },
      'no history entries found - verify Plex account is signed in and "Allow media deletion" is enabled in Plex library settings'
    );
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

  logger.debug(
    {
      window,
      rawCount: history.length,
      trackCount: history.filter((h: HistoryResult) => h != null && h.type === 'track').length,
      filteredCount: filtered.length,
      windowFilterApplied: !!timeWindowDef
    },
    'history slice ready'
  );

  return filtered;
};
