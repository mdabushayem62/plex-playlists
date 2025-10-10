/**
 * Global test setup for vitest
 * Runs before all test files
 */

import { afterAll, beforeAll } from 'vitest';

beforeAll(() => {
  // Suppress console output during tests
  global.console = {
    ...console,
    log: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };
});

afterAll(() => {
  // Cleanup any global resources
});
