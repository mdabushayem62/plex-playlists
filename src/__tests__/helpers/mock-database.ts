/**
 * Mock Database factory for testing
 * Provides mock database operations
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi } from 'vitest';

/**
 * Create a mock database instance with common operations
 */
export function createMockDatabase() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * Create a mock database with cache update support (for discovery/throwback)
 */
export function createMockDatabaseWithCacheUpdate() {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined)
      })
    })
  };
}

/**
 * Fluent builder for mock database
 */
export class MockDatabaseBuilder {
  private selectResults: any[] = [];
  private insertResults: any[] = [];

  /**
   * Configure select query to return specific results
   */
  withSelectResults(results: any[]): this {
    this.selectResults = results;
    return this;
  }

  /**
   * Configure insert to return specific results
   */
  withInsertResults(results: any[]): this {
    this.insertResults = results;
    return this;
  }

  /**
   * Build the mock database
   */
  build() {
    const db = createMockDatabase();
    vi.mocked(db.limit).mockResolvedValue(this.selectResults);
    vi.mocked(db.returning).mockResolvedValue(this.insertResults);
    return db;
  }
}

/**
 * Create a fluent mock database builder
 */
export function mockDatabase(): MockDatabaseBuilder {
  return new MockDatabaseBuilder();
}
