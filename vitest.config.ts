import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      PLEX_BASE_URL: 'http://localhost:32400',
      PLEX_AUTH_TOKEN: 'test-token',
      DATABASE_PATH: ':memory:',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'drizzle/',
        '.venv/',
        'imported_playlists/',
        'test-*.ts',
        '*.config.ts',
        '*.config.js',
        'healthcheck.js',
      ],
    },
  },
});
