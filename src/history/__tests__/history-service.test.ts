import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlexServer } from '@ctrl/plex';
import { fetchHistoryForWindow } from '../history-service.js';

// Mock the Plex client
vi.mock('../../plex/client.js', () => ({
  getPlexServer: vi.fn()
}));

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { getPlexServer } from '../../plex/client.js';
import { logger } from '../../logger.js';

// Helper to create mock history metadata
interface MockHistoryItem {
  type: string;
  ratingKey: string;
  historyKey: string;
  key?: string;
  parentKey?: string;
  grandparentKey?: string;
  viewedAt: number;
  accountID: number;
  librarySectionID: string;
}

function createMockHistoryItem(
  type: string,
  ratingKey: string,
  viewedAt: Date,
  accountId: number = 1
): MockHistoryItem {
  return {
    type,
    ratingKey, // Now included directly in HistoryMetadatum
    historyKey: `/status/sessions/history/${ratingKey}`,
    key: `/library/metadata/${ratingKey}`,
    viewedAt: Math.floor(viewedAt.getTime() / 1000), // Plex uses seconds
    accountID: accountId,
    librarySectionID: '6'
  };
}

function createMockServer(historyResult: MockHistoryItem[]): PlexServer {
  return {
    history: vi.fn().mockResolvedValue(historyResult),
    library: vi.fn().mockResolvedValue({
      sections: vi.fn().mockResolvedValue([
        {
          key: '6',
          title: 'Music',
          CONTENT_TYPE: 'audio',
          type: 'artist'
        }
      ])
    }),
    query: vi.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: historyResult,
        totalSize: historyResult.length
      }
    })
  } as unknown as PlexServer;
}

describe('fetchHistoryForWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches history for morning window', async () => {
    const morningDate = new Date('2025-01-15T08:00:00'); // 8am local time
    const historyItems = [
      createMockHistoryItem('track', '123', morningDate)
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    // New implementation uses server.history() with librarySectionId
    expect(server.history).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('123');
  });

  it('filters out non-track items', async () => {
    const now = new Date('2025-01-15T08:00:00'); // 8am local
    const historyItems = [
      createMockHistoryItem('track', '123', now),
      createMockHistoryItem('movie', '456', now), // Not a track
      createMockHistoryItem('track', '789', now)
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.ratingKey)).toEqual(['123', '789']);
  });

  it('filters by time window - morning (6-11am)', async () => {
    const historyItems = [
      createMockHistoryItem('track', '1', new Date('2025-01-15T06:00:00')), // 6am - included
      createMockHistoryItem('track', '2', new Date('2025-01-15T08:00:00')), // 8am - included
      createMockHistoryItem('track', '3', new Date('2025-01-15T11:00:00')), // 11am - included
      createMockHistoryItem('track', '4', new Date('2025-01-15T12:00:00')), // 12pm - excluded
      createMockHistoryItem('track', '5', new Date('2025-01-15T05:00:00'))  // 5am - excluded
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.ratingKey)).toEqual(['1', '2', '3']);
  });

  it('filters by time window - afternoon (12-5pm)', async () => {
    const historyItems = [
      createMockHistoryItem('track', '1', new Date('2025-01-15T11:00:00')), // 11am - excluded
      createMockHistoryItem('track', '2', new Date('2025-01-15T12:00:00')), // 12pm - included
      createMockHistoryItem('track', '3', new Date('2025-01-15T14:00:00')), // 2pm - included
      createMockHistoryItem('track', '4', new Date('2025-01-15T17:00:00')), // 5pm - included
      createMockHistoryItem('track', '5', new Date('2025-01-15T18:00:00'))  // 6pm - excluded
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('afternoon', 30);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.ratingKey)).toEqual(['2', '3', '4']);
  });

  it('filters by time window - evening (6-11pm)', async () => {
    const historyItems = [
      createMockHistoryItem('track', '1', new Date('2025-01-15T17:00:00')), // 5pm - excluded
      createMockHistoryItem('track', '2', new Date('2025-01-15T18:00:00')), // 6pm - included
      createMockHistoryItem('track', '3', new Date('2025-01-15T20:00:00')), // 8pm - included
      createMockHistoryItem('track', '4', new Date('2025-01-15T23:00:00')), // 11pm - included
      createMockHistoryItem('track', '5', new Date('2025-01-16T00:00:00'))  // 12am - excluded
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('evening', 30);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.ratingKey)).toEqual(['2', '3', '4']);
  });

  it('uses ratingKey field directly', async () => {
    const historyItems = [{
      type: 'track',
      ratingKey: '123',
      historyKey: '/status/sessions/history/123',
      key: '/library/metadata/123',
      viewedAt: Math.floor(new Date('2025-01-15T08:00:00').getTime() / 1000),
      accountID: 1,
      librarySectionID: '6'
    }];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result[0].ratingKey).toBe('123');
  });

  it('skips items with no rating key', async () => {
    const historyItems = [
      {
        type: 'track',
        ratingKey: '', // Empty ratingKey should be skipped
        historyKey: '',
        viewedAt: Math.floor(new Date('2025-01-15T08:00:00').getTime() / 1000),
        accountID: 1,
        librarySectionID: '6'
      },
      createMockHistoryItem('track', '123', new Date('2025-01-15T08:00:00'))
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('123');
  });

  it('handles timestamps in seconds (typical)', async () => {
    // Create a date at 8am local time, then get its timestamp in seconds
    const morningDate = new Date('2025-01-15T08:00:00');
    const timestampSeconds = Math.floor(morningDate.getTime() / 1000);

    const historyItems = [{
      type: 'track',
      ratingKey: '123',
      historyKey: '/status/sessions/history/123',
      key: '/library/metadata/123',
      viewedAt: timestampSeconds, // Timestamp in seconds
      accountID: 1,
      librarySectionID: '6'
    }];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result[0].viewedAt).toEqual(morningDate);
  });

  it('handles timestamps in milliseconds (fallback)', async () => {
    // Create a date at 8am local time
    const morningDate = new Date('2025-01-15T08:00:00');
    const timestampMs = morningDate.getTime(); // Get timestamp in ms

    const historyItems = [{
      type: 'track',
      ratingKey: '123',
      historyKey: '/status/sessions/history/123',
      key: '/library/metadata/123',
      viewedAt: timestampMs, // Already in ms (large number)
      accountID: 1,
      librarySectionID: '6'
    }];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result[0].viewedAt).toEqual(morningDate);
  });

  it('includes accountId in result', async () => {
    const historyItems = [
      createMockHistoryItem('track', '123', new Date('2025-01-15T08:00:00'), 42)
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result[0].accountId).toBe(42);
  });

  it('returns empty array when history is not an array', async () => {
    const server = { history: vi.fn().mockResolvedValue(null) } as unknown as PlexServer;
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips invalid history items', async () => {
    const historyItems = [
      null,
      'invalid string',
      createMockHistoryItem('track', '123', new Date('2025-01-15T08:00:00'))
    ] as unknown as MockHistoryItem[];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    const result = await fetchHistoryForWindow('morning', 30);

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('123');
  });

  it('passes custom days and maxresults to server.history', async () => {
    const server = createMockServer([]);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    await fetchHistoryForWindow('morning', 60, 10000);

    // New implementation uses server.history() with librarySectionId
    expect(server.history).toHaveBeenCalled();
    const historyCall = vi.mocked(server.history).mock.calls[0];
    expect(historyCall[0]).toBe(10000); // maxresults
    expect(historyCall[4]).toBe('6'); // librarySectionId
  });

  it('logs debug messages', async () => {
    const historyItems = [
      createMockHistoryItem('track', '123', new Date('2025-01-15T08:00:00'))
    ];

    const server = createMockServer(historyItems);
    vi.mocked(getPlexServer).mockResolvedValue(server);

    await fetchHistoryForWindow('morning', 30);

    // Implementation logs: "fetching history slice", "received history from plex",
    // "history entry types", "history slice ready"
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ window: 'morning', librarySectionId: '6' }),
      'fetching history slice'
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ window: 'morning', filteredCount: 1 }),
      'history slice ready'
    );
  });
});
