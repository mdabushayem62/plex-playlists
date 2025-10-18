/**
 * Config tabs API routes
 * Returns tab content partials for HTMX
 */

import { Router } from 'express';
import { getAllSettingsWithMetadata } from '../../db/settings-service.js';
import { getCacheStats } from '../../cache/cache-cli.js';
import { APP_ENV } from '../../config.js';
import {
  GeneralTabContent,
  ScoringTabContent,
  ApiKeysTabContent,
  SchedulingTabContent,
  GenreTabContent,
  CacheTabContent,
  ImportTabContent,
  EnvironmentTabContent,
  type TabsData
} from '../views/config/config-tabs.js';

export const configTabsRouter = Router();

/**
 * Helper to fetch all data needed for tabs
 */
async function fetchAllTabsData(): Promise<TabsData> {
  // Get all settings with metadata
  const allSettings = await getAllSettingsWithMetadata();

  // Filter by category
  const plexSettings = Object.entries(allSettings)
    .filter(([, metadata]) => metadata.category === 'plex')
    .reduce((acc, [key, metadata]) => {
      acc[key] = metadata;
      return acc;
    }, {} as Record<string, typeof allSettings[keyof typeof allSettings]>);

  const apiSettings = Object.entries(allSettings)
    .filter(([, metadata]) => metadata.category === 'api')
    .reduce((acc, [key, metadata]) => {
      acc[key] = metadata;
      return acc;
    }, {} as Record<string, typeof allSettings[keyof typeof allSettings]>);

  const scoringSettings = Object.entries(allSettings)
    .filter(([, metadata]) => metadata.category === 'scoring')
    .reduce((acc, [key, metadata]) => {
      acc[key] = metadata;
      return acc;
    }, {} as Record<string, typeof allSettings[keyof typeof allSettings]>);

  const schedulingSettings = Object.entries(allSettings)
    .filter(([, metadata]) => metadata.category === 'scheduling')
    .reduce((acc, [key, metadata]) => {
      acc[key] = metadata;
      return acc;
    }, {} as Record<string, typeof allSettings[keyof typeof allSettings]>);

  // Get cache stats from cache service (all three types)
  const cacheStats = await getCacheStats();

  // System env vars (read-only)
  const envVars = {
    database: {
      path: APP_ENV.DATABASE_PATH
    },
    webUi: {
      enabled: APP_ENV.WEB_UI_ENABLED,
      port: APP_ENV.WEB_UI_PORT
    }
  };

  return {
    plexSettings,
    apiSettings,
    scoringSettings,
    schedulingSettings,
    cacheStats,
    envVars
  };
}

/**
 * General tab (Plex settings)
 */
configTabsRouter.get('/general', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = GeneralTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('General tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * Scoring tab
 */
configTabsRouter.get('/scoring', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = ScoringTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Scoring tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * API Keys tab
 */
configTabsRouter.get('/api-keys', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = ApiKeysTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('API Keys tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * Scheduling tab
 */
configTabsRouter.get('/scheduling', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = SchedulingTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Scheduling tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * Genre tab
 */
configTabsRouter.get('/genre', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = GenreTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Genre tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * Cache tab
 */
configTabsRouter.get('/cache', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = CacheTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Cache tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * Import tab
 */
configTabsRouter.get('/import', async (_req, res) => {
  try {
    const html = ImportTabContent();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Import tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});

/**
 * Environment tab
 */
configTabsRouter.get('/environment', async (req, res) => {
  try {
    const data = await fetchAllTabsData();
    const html = EnvironmentTabContent({ data });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Environment tab error:', error);
    res.status(500).send('<div>Error loading tab content</div>');
  }
});
