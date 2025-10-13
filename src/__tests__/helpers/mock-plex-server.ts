/**
 * Mock Plex Server factory for testing
 * Provides fluent interface for configuring Plex API mocks
 */

import { vi } from 'vitest';
import type { HistoryResult, Track } from '@ctrl/plex';

export interface MockPlexServerConfig {
  historyPages?: HistoryResult[][];
  musicSectionKey?: string;
  hasMusicSection?: boolean;
}

/**
 * Create a mock Plex library with configurable sections
 */
export function createMockLibrary(hasMusicSection = true, musicSectionKey = 'music-1') {
  const sections = hasMusicSection
    ? [{ CONTENT_TYPE: 'audio', key: musicSectionKey }]
    : [{ CONTENT_TYPE: 'video', key: 'movies-1' }];

  return {
    sections: vi.fn().mockResolvedValue(sections)
  };
}

/**
 * Create a mock Plex server with configurable responses
 */
export function createMockPlexServer(config: MockPlexServerConfig = {}) {
  const {
    historyPages = [[]],
    musicSectionKey = 'music-1',
    hasMusicSection = true
  } = config;

  const historyMock = vi.fn();

  // Configure paginated responses
  historyPages.forEach(page => {
    historyMock.mockResolvedValueOnce(page);
  });

  // Always return empty array at the end to stop pagination
  historyMock.mockResolvedValue([]);

  return {
    history: historyMock,
    library: vi.fn().mockResolvedValue(createMockLibrary(hasMusicSection, musicSectionKey))
  };
}

/**
 * Fluent builder for mock Plex server
 *
 * Example:
 * const server = mockPlexServer()
 *   .withHistory(mockHistory)
 *   .withPaginatedHistory([page1, page2])
 *   .withNoMusicSection()
 *   .build();
 */
export class MockPlexServerBuilder {
  private historyPages: HistoryResult[][] = [[]];
  private hasMusicSection = true;
  private musicSectionKey = 'music-1';

  /**
   * Set single page of history
   */
  withHistory(history: HistoryResult[]): this {
    this.historyPages = [history];
    return this;
  }

  /**
   * Set multiple pages of history (for pagination tests)
   */
  withPaginatedHistory(pages: HistoryResult[][]): this {
    this.historyPages = pages;
    return this;
  }

  /**
   * Configure empty history
   */
  withEmptyHistory(): this {
    this.historyPages = [[]];
    return this;
  }

  /**
   * Configure server with no music section (should fail gracefully)
   */
  withNoMusicSection(): this {
    this.hasMusicSection = false;
    return this;
  }

  /**
   * Configure custom music section key
   */
  withMusicSectionKey(key: string): this {
    this.musicSectionKey = key;
    return this;
  }

  /**
   * Build the mock server
   */
  build() {
    return createMockPlexServer({
      historyPages: this.historyPages,
      hasMusicSection: this.hasMusicSection,
      musicSectionKey: this.musicSectionKey
    });
  }
}

/**
 * Create a fluent mock Plex server builder
 */
export function mockPlexServer(): MockPlexServerBuilder {
  return new MockPlexServerBuilder();
}

/**
 * Create a map of tracks by rating key (for fetchTracksByRatingKeys mock)
 */
export function createTrackMap(tracks: Partial<Track>[]): Map<string, Track> {
  return new Map(
    tracks.map(track => [track.ratingKey!, track as Track])
  );
}
