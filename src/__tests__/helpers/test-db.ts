/**
 * Test database helper
 * Creates in-memory SQLite databases for testing
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema.js';

export interface TestDbContext {
  db: BetterSQLite3Database<typeof schema> & { $client: Database.Database };
  sqlite: Database.Database;
}

/**
 * Create a test database with migrations applied
 */
export function createTestDb(): TestDbContext {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema }) as BetterSQLite3Database<typeof schema> & { $client: Database.Database };

  // Run migrations
  migrate(db, { migrationsFolder: './drizzle' });

  return { db, sqlite };
}

/**
 * Close test database
 */
export function closeTestDb(ctx: TestDbContext): void {
  ctx.sqlite.close();
}
