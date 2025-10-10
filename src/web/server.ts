/**
 * Web UI server
 * Express server with EJS templates for dashboard and setup wizard
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';
import { dashboardRouter } from './routes/dashboard.js';
import { setupRouter } from './routes/setup.js';
import { actionsRouter } from './routes/actions.js';
import { configRouter } from './routes/config.js';
import { playlistsRouter } from './routes/playlists.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base path for web assets
// In production (Docker): /app/src/web
// In development: <project>/src/web
export const WEB_BASE_PATH = process.env.NODE_ENV === 'production'
  ? path.join(process.cwd(), 'src', 'web')
  : path.join(__dirname);

/**
 * Helper to get view path with correct extension for environment
 * In production, imports compiled .js files
 * In development, imports .tsx files (tsx runner handles them)
 */
export function getViewPath(relativePath: string): string {
  const basePath = path.join(WEB_BASE_PATH, 'views', relativePath);

  // In production, views are compiled to .js files
  if (process.env.NODE_ENV === 'production') {
    return basePath.replace(/\.tsx$/, '.js');
  }

  return basePath;
}

export interface WebServerConfig {
  port: number;
  enabled: boolean;
}

export function createWebServer(config: WebServerConfig) {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files
  app.use(express.static(path.join(WEB_BASE_PATH, 'public')));

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(WEB_BASE_PATH, 'views'));

  // Routes
  app.use('/', dashboardRouter);
  app.use('/setup', setupRouter);
  app.use('/actions', actionsRouter);
  app.use('/config', configRouter);
  app.use('/playlists', playlistsRouter);

  // Health check endpoint (for Docker)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Start server
  function start() {
    if (!config.enabled) {
      logger.info('web UI disabled');
      return;
    }

    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'web UI server started');
      console.log(`\n🌐 Web UI: http://localhost:${config.port}\n`);
    });
  }

  return { app, start };
}
