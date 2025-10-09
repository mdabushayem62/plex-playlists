import { describe, it, expect } from 'vitest';
import { aggregateHistory } from '../aggregate.js';
import type { HistoryEntry } from '../history-service.js';

describe('aggregateHistory', () => {
  it('returns empty array for no history entries', () => {
    const result = aggregateHistory([]);
    expect(result).toEqual([]);
  });

  it('aggregates single track with single play', () => {
    const entries: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
    ];

    const result = aggregateHistory(entries);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ratingKey: '123',
      playCount: 1,
      lastPlayedAt: new Date('2025-01-15T10:00:00Z'),
    });
  });

  it('aggregates multiple plays of same track', () => {
    const entries: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-14T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-13T10:00:00Z'), accountId: 1 },
    ];

    const result = aggregateHistory(entries);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ratingKey: '123',
      playCount: 3,
      lastPlayedAt: new Date('2025-01-15T10:00:00Z'), // Most recent
    });
  });

  it('tracks most recent play date correctly', () => {
    const entries: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-13T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-14T10:00:00Z'), accountId: 1 },
    ];

    const result = aggregateHistory(entries);

    // Should pick the latest date regardless of entry order
    expect(result[0].lastPlayedAt).toEqual(new Date('2025-01-15T10:00:00Z'));
  });

  it('aggregates multiple different tracks', () => {
    const entries: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
      { ratingKey: '456', viewedAt: new Date('2025-01-15T11:00:00Z'), accountId: 1 },
      { ratingKey: '789', viewedAt: new Date('2025-01-15T12:00:00Z'), accountId: 1 },
    ];

    const result = aggregateHistory(entries);

    expect(result).toHaveLength(3);

    const track123 = result.find(r => r.ratingKey === '123');
    const track456 = result.find(r => r.ratingKey === '456');
    const track789 = result.find(r => r.ratingKey === '789');

    expect(track123).toEqual({
      ratingKey: '123',
      playCount: 1,
      lastPlayedAt: new Date('2025-01-15T10:00:00Z'),
    });

    expect(track456).toEqual({
      ratingKey: '456',
      playCount: 1,
      lastPlayedAt: new Date('2025-01-15T11:00:00Z'),
    });

    expect(track789).toEqual({
      ratingKey: '789',
      playCount: 1,
      lastPlayedAt: new Date('2025-01-15T12:00:00Z'),
    });
  });

  it('handles mixed scenario with multiple tracks and plays', () => {
    const entries: HistoryEntry[] = [
      // Track 123 - played 3 times
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-14T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-13T10:00:00Z'), accountId: 1 },
      // Track 456 - played 2 times
      { ratingKey: '456', viewedAt: new Date('2025-01-15T11:00:00Z'), accountId: 1 },
      { ratingKey: '456', viewedAt: new Date('2025-01-12T11:00:00Z'), accountId: 1 },
      // Track 789 - played 1 time
      { ratingKey: '789', viewedAt: new Date('2025-01-15T12:00:00Z'), accountId: 1 },
    ];

    const result = aggregateHistory(entries);

    expect(result).toHaveLength(3);

    const track123 = result.find(r => r.ratingKey === '123');
    expect(track123?.playCount).toBe(3);
    expect(track123?.lastPlayedAt).toEqual(new Date('2025-01-15T10:00:00Z'));

    const track456 = result.find(r => r.ratingKey === '456');
    expect(track456?.playCount).toBe(2);
    expect(track456?.lastPlayedAt).toEqual(new Date('2025-01-15T11:00:00Z'));

    const track789 = result.find(r => r.ratingKey === '789');
    expect(track789?.playCount).toBe(1);
    expect(track789?.lastPlayedAt).toEqual(new Date('2025-01-15T12:00:00Z'));
  });

  it('handles entries from different accounts', () => {
    const entries: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 2 },
    ];

    const result = aggregateHistory(entries);

    // Should aggregate across accounts
    expect(result).toHaveLength(1);
    expect(result[0].playCount).toBe(2);
  });

  it('preserves chronological order independence', () => {
    const entries1: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-14T10:00:00Z'), accountId: 1 },
    ];

    const entries2: HistoryEntry[] = [
      { ratingKey: '123', viewedAt: new Date('2025-01-14T10:00:00Z'), accountId: 1 },
      { ratingKey: '123', viewedAt: new Date('2025-01-15T10:00:00Z'), accountId: 1 },
    ];

    const result1 = aggregateHistory(entries1);
    const result2 = aggregateHistory(entries2);

    // Results should be identical regardless of input order
    expect(result1).toEqual(result2);
  });
});
