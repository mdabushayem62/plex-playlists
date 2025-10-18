/**
 * Configuration routes
 * View and manage application configuration
 */

import { Router } from 'express';
import { getViewPath } from '../server.js';
import { APP_ENV } from '../../config.js';
import { promises as fs } from 'fs';
import { getConfigFilePath } from '../../init.js';
import {
  setSettingWithWriteback,
  getSetting,
  getAllSettingsWithMetadata,
  validateSetting,
  getSettingsHistory,
  recordSettingChange,
  RESTART_REQUIRED_SETTINGS,
  type SettingKey
} from '../../db/settings-service.js';
import { getDb } from '../../db/index.js';
import { setupState } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getCacheStats } from '../../cache/cache-cli.js';
import { isHtmxRequest, withOobSidebar } from '../middleware/htmx.js';
import { configTabsRouter } from './config-tabs.js';

export const configRouter = Router();

// Mount tab API routes
configRouter.use('/api', configTabsRouter);

// Middleware to check setup status for navigation
async function getSetupStatus() {
  const db = getDb();
  const setupStates = await db.select().from(setupState).limit(1);
  return setupStates.length > 0 && setupStates[0].completed;
}

/**
 * Main configuration page - Settings with tabs
 * (Overview removed - settings page is now the main config page)
 */
configRouter.get('/', async (req, res) => {
  try {
    const setupComplete = await getSetupStatus();

    // Get active tab from query param or default to 'general'
    const activeTab = (req.query.tab as string) || 'general';

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

    // Get playlist config
    const configPath = getConfigFilePath('playlists.config.json');
    let playlistConfig = null;
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      playlistConfig = JSON.parse(content);
    } catch {
      // Config file doesn't exist or is invalid - that's okay
    }

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

    // Prepare data for rendering
    const data = {
      plexSettings,
      apiSettings,
      scoringSettings,
      schedulingSettings,
      cacheStats,
      playlistConfig,
      configPath,
      envVars,
      activeTab
    };

    // Check if this is an HTMX request
    if (isHtmxRequest(req)) {
      // Return partial HTML for HTMX with OOB sidebar update
      const { SettingsContent } = await import('../views/config/settings.js');
      const content = await SettingsContent(data);

      // Combine content with OOB sidebar to update active state
      const html = await withOobSidebar(content, {
        page: 'config',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      // Render full page layout for regular requests
      const { SettingsPage } = await import('../views/config/settings.js');
      const html = SettingsPage({
        ...data,
        page: 'config',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }
  } catch (error) {
    console.error('Settings page error:', error);
    res.status(500).send('Internal server error');
  }
});


// Genre playlist configuration routes removed - feature deprecated
// Custom playlists are now managed via /playlists page (database-driven)

/**
 * API: Get all settings with metadata for inline editing
 */
configRouter.get('/api/settings', async (req, res) => {
  try {
    const settings = await getAllSettingsWithMetadata();
    res.json({ settings });
  } catch (error) {
    console.error('Settings API error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * API: Update single setting with validation
 */
configRouter.put('/api/settings/:key', async (req, res) => {
  try {
    const key = req.params.key as SettingKey;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Missing value parameter' });
    }

    // Validate
    const validation = validateSetting(key, String(value));
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get old value for history
    const oldValue = await getSetting(key);

    // Save to database and write back to .env file
    await setSettingWithWriteback(key, String(value), true);

    // Log to history
    await recordSettingChange(key, oldValue, String(value), 'web_ui');

    // Reset Plex server cache if credentials changed
    if (key === 'plex_base_url' || key === 'plex_auth_token') {
      const { resetPlexServer } = await import('../../plex/client.js');
      resetPlexServer();
    }

    // Set toast notification headers for HTMX
    res.setHeader('X-Toast-Message', `${key} updated successfully`);
    res.setHeader('X-Toast-Type', 'success');

    if (RESTART_REQUIRED_SETTINGS.includes(key)) {
      // Add additional warning toast for restart required
      res.setHeader('X-Toast-Warning', 'Restart required for this change to take effect');
    }

    res.json({
      success: true,
      message: `${key} updated successfully`,
      requiresRestart: RESTART_REQUIRED_SETTINGS.includes(key)
    });
  } catch (error) {
    console.error('Setting update error:', error);
    res.setHeader('X-Toast-Message', 'Failed to update setting');
    res.setHeader('X-Toast-Type', 'error');
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/**
 * API: Batch update settings
 */
configRouter.post('/api/settings/batch', async (req, res) => {
  try {
    const { settings: settingsToUpdate } = req.body;

    if (!settingsToUpdate || typeof settingsToUpdate !== 'object') {
      return res.status(400).json({ error: 'Invalid settings object' });
    }

    const results = [];
    let requiresRestart = false;

    // Validate all first
    for (const [key, value] of Object.entries(settingsToUpdate)) {
      const validation = validateSetting(key as SettingKey, String(value));
      if (!validation.valid) {
        return res.status(400).json({
          error: `Validation failed for ${key}: ${validation.error}`
        });
      }
    }

    // All valid - proceed with updates
    let plexCredsChanged = false;
    for (const [key, value] of Object.entries(settingsToUpdate)) {
      const typedKey = key as SettingKey;
      const oldValue = await getSetting(typedKey);
      await setSettingWithWriteback(typedKey, String(value), true);

      await recordSettingChange(typedKey, oldValue, String(value), 'web_ui');

      results.push({ key, success: true });

      if (RESTART_REQUIRED_SETTINGS.includes(typedKey)) {
        requiresRestart = true;
      }

      if (typedKey === 'plex_base_url' || typedKey === 'plex_auth_token') {
        plexCredsChanged = true;
      }
    }

    // Reset Plex server cache if credentials changed
    if (plexCredsChanged) {
      const { resetPlexServer } = await import('../../plex/client.js');
      resetPlexServer();
    }

    res.json({ success: true, results, requiresRestart });
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Batch update failed' });
  }
});

/**
 * API: Reset setting to default (delete from DB)
 */
configRouter.delete('/api/settings/:key', async (req, res) => {
  try {
    const key = req.params.key as SettingKey;

    // Get old value for history
    const oldValue = await getSetting(key);

    // Delete from database and .env file (falls back to env var)
    await setSettingWithWriteback(key, null, true);

    // Log to history
    await recordSettingChange(key, oldValue, 'RESET_TO_DEFAULT', 'web_ui');

    // Set toast notification headers
    res.setHeader('X-Toast-Message', `${key} reset to default`);
    res.setHeader('X-Toast-Type', 'success');

    res.json({ success: true, message: `${key} reset to default` });
  } catch (error) {
    console.error('Setting reset error:', error);
    res.setHeader('X-Toast-Message', 'Failed to reset setting');
    res.setHeader('X-Toast-Type', 'error');
    res.status(500).json({ error: 'Failed to reset setting' });
  }
});

/**
 * API: Get settings change history
 */
configRouter.get('/api/settings/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await getSettingsHistory(limit);

    res.json({ history });
  } catch (error) {
    console.error('Settings history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Reset setup wizard (allows re-running)
 */
configRouter.post('/reset-setup', async (req, res) => {
  try {
    const db = getDb();

    // Mark setup as incomplete and reset to welcome step
    const setupStates = await db.select().from(setupState).limit(1);

    if (setupStates.length > 0) {
      await db
        .update(setupState)
        .set({
          currentStep: 'welcome',
          completed: false,
          updatedAt: new Date()
        })
        .where(eq(setupState.id, setupStates[0].id));
    }

    res.json({ success: true, message: 'Setup wizard has been reset' });
  } catch (error) {
    console.error('Reset setup error:', error);
    res.status(500).json({ error: 'Failed to reset setup' });
  }
});

/**
 * Test Plex connection
 */
configRouter.get('/api/test-plex-connection', async (req, res) => {
  try {
    const { getPlexServer } = await import('../../plex/client.js');
    const plex = await getPlexServer();

    // Try to get server info
    const response = await plex.query('/');
    const serverName = response.MediaContainer?.friendlyName || 'Unknown';

    res.json({
      success: true,
      message: 'Plex connection successful',
      serverName
    });
  } catch (error) {
    console.error('Plex connection test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    });
  }
});

/**
 * Test Last.fm API
 */
configRouter.get('/api/test-lastfm', async (req, res) => {
  try {
    const apiKey = await getSetting('lastfm_api_key') || APP_ENV.LASTFM_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Last.fm API key not configured'
      });
    }

    // Test with a simple artist search
    const testUrl = `http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=Radiohead&api_key=${apiKey}&format=json`;
    const response = await fetch(testUrl);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.message || 'Last.fm API error');
    }

    res.json({
      success: true,
      message: 'Last.fm API connection successful'
    });
  } catch (error) {
    console.error('Last.fm test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'API test failed'
    });
  }
});

/**
 * Test Spotify API
 */
configRouter.get('/api/test-spotify', async (req, res) => {
  try {
    const clientId = await getSetting('spotify_client_id') || APP_ENV.SPOTIFY_CLIENT_ID;
    const clientSecret = await getSetting('spotify_client_secret') || APP_ENV.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Spotify credentials not configured'
      });
    }

    // Test by getting an access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to authenticate with Spotify');
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error('No access token received from Spotify');
    }

    res.json({
      success: true,
      message: 'Spotify API connection successful'
    });
  } catch (error) {
    console.error('Spotify test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'API test failed'
    });
  }
});

/**
 * API: Get genre ignore list and statistics
 */
configRouter.get('/api/genres/ignore-list', async (req, res) => {
  try {
    const { getEffectiveConfig } = await import('../../db/settings-service.js');
    const { DEFAULT_GENRE_IGNORE_LIST, getGenreIgnoreListStats } = await import('../../metadata/genre-service.js');

    const config = await getEffectiveConfig();
    const ignoreList = config.genreIgnoreList.length > 0
      ? config.genreIgnoreList
      : DEFAULT_GENRE_IGNORE_LIST;

    // Get statistics from genre service
    const stats = await getGenreIgnoreListStats(ignoreList);

    res.json(stats);
  } catch (error) {
    console.error('Genre ignore list API error:', error);
    res.status(500).json({ error: 'Failed to fetch genre ignore list' });
  }
});

/**
 * API: Update genre ignore list
 */
configRouter.put('/api/genres/ignore-list', async (req, res) => {
  try {
    const { genres } = req.body;

    if (!Array.isArray(genres)) {
      return res.status(400).json({ error: 'genres must be an array' });
    }

    // Validate each genre is a string
    if (!genres.every(g => typeof g === 'string')) {
      return res.status(400).json({ error: 'All genres must be strings' });
    }

    // Normalize genres before saving
    const { normalizeGenres } = await import('../../metadata/genre-service.js');
    const normalizedGenres = normalizeGenres(genres);

    // Save to database
    await setSettingWithWriteback('genre_ignore_list', JSON.stringify(normalizedGenres), true);

    // Invalidate genre enrichment service config cache
    const { getGenreEnrichmentService } = await import('../../genre-enrichment.js');
    const service = getGenreEnrichmentService();
    service.invalidateConfigCache();

    res.setHeader('X-Toast-Message', 'Genre ignore list updated successfully');
    res.setHeader('X-Toast-Type', 'success');

    res.json({
      success: true,
      message: 'Genre ignore list updated',
      genres: normalizedGenres
    });
  } catch (error) {
    console.error('Genre ignore list update error:', error);
    res.setHeader('X-Toast-Message', 'Failed to update genre ignore list');
    res.setHeader('X-Toast-Type', 'error');
    res.status(500).json({ error: 'Failed to update genre ignore list' });
  }
});

/**
 * API: Reset genre ignore list to default
 */
configRouter.delete('/api/genres/ignore-list', async (req, res) => {
  try {
    // Delete from database (falls back to default)
    await setSettingWithWriteback('genre_ignore_list', null, true);

    // Invalidate genre enrichment service config cache
    const { getGenreEnrichmentService } = await import('../../genre-enrichment.js');
    const service = getGenreEnrichmentService();
    service.invalidateConfigCache();

    res.setHeader('X-Toast-Message', 'Genre ignore list reset to default');
    res.setHeader('X-Toast-Type', 'success');

    res.json({ success: true, message: 'Genre ignore list reset to default' });
  } catch (error) {
    console.error('Genre ignore list reset error:', error);
    res.setHeader('X-Toast-Message', 'Failed to reset genre ignore list');
    res.setHeader('X-Toast-Type', 'error');
    res.status(500).json({ error: 'Failed to reset genre ignore list' });
  }
});

/**
 * API: Get all unique genres from cache (for autocomplete)
 */
configRouter.get('/api/genres/all', async (req, res) => {
  try {
    const { getAllGenresWithCounts } = await import('../../metadata/genre-service.js');
    const genres = await getAllGenresWithCounts();
    res.json({ genres });
  } catch (error) {
    console.error('Get all genres error:', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

/**
 * Adaptive PlayQueue settings page
 * Beta feature for real-time queue adaptation based on skip patterns
 */
configRouter.get('/adaptive', async (req, res) => {
  try {
    const setupComplete = await getSetupStatus();

    // Get effective config (DB settings with env fallback)
    const { getEffectiveConfig } = await import('../../db/settings-service.js');
    const effectiveConfig = await getEffectiveConfig();

    // Get adaptive statistics
    const { getAdaptiveStats } = await import('../../adaptive/adaptive-repository.js');
    const stats = await getAdaptiveStats();

    const data = {
      enabled: effectiveConfig.adaptiveQueueEnabled,
      sensitivity: effectiveConfig.adaptiveSensitivity,
      minSkips: effectiveConfig.adaptiveMinSkipCount,
      windowMinutes: effectiveConfig.adaptiveWindowMinutes,
      cooldownSeconds: effectiveConfig.adaptiveCooldownSeconds,
      stats
    };

    // Check if this is an HTMX request
    if (isHtmxRequest(req)) {
      // Return partial HTML for HTMX with OOB sidebar update
      const { AdaptiveSettingsContent } = await import(getViewPath('config/adaptive.tsx'));
      const content = AdaptiveSettingsContent(data);

      // Combine content with OOB sidebar to update active state
      const html = await withOobSidebar(content, {
        page: 'config-adaptive',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      // Return full page layout for regular requests
      const { AdaptiveSettingsPage } = await import(getViewPath('config/adaptive.tsx'));
      const html = AdaptiveSettingsPage({
        ...data,
        page: 'config-adaptive',
        setupComplete
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    }
  } catch (error) {
    console.error('Adaptive settings page error:', error);
    res.status(500).send('Internal server error');
  }
});
