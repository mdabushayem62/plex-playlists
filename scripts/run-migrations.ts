/**
 * Run database migrations
 * Used for CI/CD and manual migration runs
 * Standalone script that doesn't require full app config
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'plex-playlists.db');
  const migrationsFolder = join(__dirname, '..', 'drizzle');

  console.log('🔧 Running database migrations...');
  console.log(`📁 Database: ${dbPath}`);
  console.log(`📂 Migrations: ${migrationsFolder}`);

  try {
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder });

    sqlite.close();
    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
