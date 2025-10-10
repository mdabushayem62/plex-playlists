#!/usr/bin/env node
/**
 * Docker healthcheck script
 *
 * Verifies:
 * 1. Database file exists
 * 2. Web UI server is responding
 *
 * Exit codes:
 * 0 = healthy
 * 1 = unhealthy
 */

const http = require('http');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || '/data/plex-playlists.db';
const WEB_UI_PORT = process.env.WEB_UI_PORT || 8687;

function healthcheck() {
  try {
    // Check 1: Database file exists
    if (!fs.existsSync(DB_PATH)) {
      console.error('UNHEALTHY: Database file not found at', DB_PATH);
      process.exit(1);
    }

    // Check 2: Web UI is responding
    const req = http.request(
      {
        host: 'localhost',
        port: WEB_UI_PORT,
        path: '/',
        method: 'GET',
        timeout: 5000
      },
      (res) => {
        if (res.statusCode === 200) {
          console.log('HEALTHY: Web UI responding');
          process.exit(0);
        } else {
          console.error(`UNHEALTHY: Web UI returned status ${res.statusCode}`);
          process.exit(1);
        }
      }
    );

    req.on('error', (error) => {
      console.error('UNHEALTHY: Web UI not responding:', error.message);
      process.exit(1);
    });

    req.on('timeout', () => {
      console.error('UNHEALTHY: Web UI request timed out');
      req.destroy();
      process.exit(1);
    });

    req.end();

  } catch (error) {
    console.error('UNHEALTHY: Healthcheck failed:', error.message);
    process.exit(1);
  }
}

healthcheck();
