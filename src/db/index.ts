import DatabaseConstructor from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_ENV } from '../config.js';
import { logger } from '../logger.js';
import * as schema from './schema.js';

export type DatabaseClient = ReturnType<typeof drizzle<typeof schema>>;

let dbClient: DatabaseClient | null = null;
let sqliteInstance: BetterSqliteDatabase | null = null;

const runMigrations = (db: DatabaseClient): void => {
  try {
    // Get the project root
    // When running from source (src/db/index.ts): go up 2 levels
    // When running from bundled dist (dist/chunk-*.js): go up 1 level
    const currentFile = fileURLToPath(import.meta.url);
    const __dirname = dirname(currentFile);

    // Check if we're in a dist directory
    let projectRoot: string;
    if (__dirname.includes('/dist')) {
      // Running from bundled code in dist/
      projectRoot = dirname(__dirname);
    } else {
      // Running from source in src/db/
      projectRoot = dirname(dirname(__dirname));
    }

    const migrationsFolder = `${projectRoot}/drizzle`;
    logger.debug({ migrationsFolder }, 'running database migrations');
    migrate(db, { migrationsFolder });
    logger.info('database migrations completed');
  } catch (error) {
    logger.error({ err: error }, 'migration failed');
    throw error;
  }
};

export const getDb = (): DatabaseClient => {
  if (dbClient) {
    return dbClient;
  }

  const dbPath = APP_ENV.DATABASE_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  sqliteInstance = new DatabaseConstructor(dbPath);
  dbClient = drizzle(sqliteInstance, { schema });

  runMigrations(dbClient);

  return dbClient;
};

export const closeDb = (): void => {
  if (!dbClient || !sqliteInstance) {
    return;
  }
  sqliteInstance.close();
  sqliteInstance = null;
  dbClient = null;
};
