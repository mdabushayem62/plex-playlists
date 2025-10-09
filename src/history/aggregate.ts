import type { HistoryEntry } from './history-service.js';

export interface AggregatedHistory {
  ratingKey: string;
  playCount: number;
  lastPlayedAt: Date | null;
}

export const aggregateHistory = (entries: HistoryEntry[]): AggregatedHistory[] => {
  const map = new Map<string, AggregatedHistory>();

  for (const entry of entries) {
    const existing = map.get(entry.ratingKey);
    if (!existing) {
      map.set(entry.ratingKey, {
        ratingKey: entry.ratingKey,
        playCount: 1,
        lastPlayedAt: entry.viewedAt
      });
    } else {
      existing.playCount += 1;
      if (!existing.lastPlayedAt || existing.lastPlayedAt < entry.viewedAt) {
        existing.lastPlayedAt = entry.viewedAt;
      }
    }
  }

  return Array.from(map.values());
};
