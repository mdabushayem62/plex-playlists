/**
 * Centralized test setup and mock configuration
 * Reduces boilerplate in test files
 *
 * Note: vi.mock() calls must be at the top level of the test file,
 * so these are documentation/patterns rather than executed setup.
 * Import mocking utilities instead.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi } from 'vitest';

/**
 * Create a mock logger (suppress logs in tests)
 */
export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

/**
 * Create mock APP_ENV config with defaults
 */
export function createMockConfig(overrides: Record<string, any> = {}) {
  return {
    PLAYLIST_TARGET_SIZE: 50,
    DISCOVERY_DAYS: 90,
    THROWBACK_LOOKBACK_START: 730,
    THROWBACK_LOOKBACK_END: 1825,
    THROWBACK_RECENT_EXCLUSION: 90,
    HISTORY_DAYS: 30,
    ...overrides
  };
}

/**
 * Create mock scoring strategies with default return value
 */
export function createMockScoringResult(defaultScore = 0.5) {
  return {
    finalScore: defaultScore,
    components: {
      metadata: {
        recencyPenalty: defaultScore,
        qualityScore: defaultScore,
        nostalgiaWeight: defaultScore
      }
    }
  };
}

/**
 * Setup all common mocks for playlist generation tests
 *
 * Usage pattern (at top of test file):
 * ```typescript
 * vi.mock('../../logger.js', () => ({ logger: createMockLogger() }));
 * vi.mock('../../config.js', () => ({ APP_ENV: createMockConfig() }));
 * vi.mock('../../plex/client.js');
 * vi.mock('../../plex/tracks.js');
 * vi.mock('../../db/index.js');
 * vi.mock('../../scoring/strategies.js');
 * ```
 *
 * Or use the convenience macro below in your test file.
 */
export const PLAYLIST_MOCK_PATTERN = `
vi.mock('../../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../config.js', () => ({
  APP_ENV: {
    PLAYLIST_TARGET_SIZE: 50,
    DISCOVERY_DAYS: 90,
    THROWBACK_LOOKBACK_START: 730,
    THROWBACK_LOOKBACK_END: 1825,
    THROWBACK_RECENT_EXCLUSION: 90,
    HISTORY_DAYS: 30
  }
}));
vi.mock('../../plex/client.js');
vi.mock('../../plex/tracks.js');
vi.mock('../../db/index.js');
vi.mock('../../scoring/strategies.js');
`;
