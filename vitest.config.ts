import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load .env for integration tests
if (process.env.INTEGRATION === 'true') {
  dotenv.config();
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-docs/**',
    ],
    // Only use test defaults if not running integration tests
    env: process.env.INTEGRATION === 'true' ? {} : {
      PLEX_BASE_URL: 'http://localhost:32400',
      PLEX_AUTH_TOKEN: 'test-token',
      DATABASE_PATH: ':memory:',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],

      // Start low, increase gradually
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
      },

      // Report on all files, not just tested ones
      all: true,

      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        'drizzle/',
        '.venv/',
        'imported_playlists/',
        'test-*.ts',
        '*.config.ts',
        '*.config.js',
        'healthcheck.js',
        'src/cli.ts',           // CLI entry point
        'src/index.ts',         // Server entry point
        'src/web/views/**',     // TSX views (require different testing)
        'src/types/**',         // Type-only files
        'src/**/types.ts',      // Type definition files
      ],
    },
  },
});
