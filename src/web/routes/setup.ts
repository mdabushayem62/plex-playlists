/**
 * Setup wizard routes
 */

import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { setupState } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { APP_ENV } from '../../config.js';
import { setSetting, getEffectiveConfig } from '../../db/settings-service.js';
import { PlexServer } from '@ctrl/plex';
import { importRatingsFromCSVs } from '../../import/importer-fast.js';
import { existsSync } from 'fs';
import { getViewPath } from '../server.js';
import { getCacheStats } from '../../cache/cache-cli.js';
import { getGenreSummary } from '../../config/genre-discovery.js';

export const setupRouter = Router();

// Setup steps definition
const SETUP_STEPS = [
  { id: 'welcome', title: 'Welcome', path: '/setup' },
  { id: 'import', title: 'Import Ratings', path: '/setup/import' },
  { id: 'library_analysis', title: 'Library Analysis', path: '/setup/library-analysis' },
  { id: 'playlists', title: 'Generate Playlists', path: '/setup/playlists' },
  { id: 'complete', title: 'Complete', path: '/setup/complete' }
] as const;

type SetupStep = (typeof SETUP_STEPS)[number]['id'];

/**
 * Get or create setup state
 */
async function getSetupState() {
  const db = getDb();
  const states = await db.select().from(setupState).limit(1);

  if (states.length === 0) {
    // Create initial setup state
    const [newState] = await db
      .insert(setupState)
      .values({
        currentStep: 'welcome',
        completed: false,
        stepData: JSON.stringify({})
      })
      .returning();
    return newState;
  }

  return states[0];
}

/**
 * Update setup state
 */
async function updateSetupState(step: SetupStep, data?: Record<string, unknown>) {
  const db = getDb();
  const state = await getSetupState();

  const existingData = state.stepData ? JSON.parse(state.stepData) : {};
  const newData = { ...existingData, ...data };

  await db
    .update(setupState)
    .set({
      currentStep: step,
      stepData: JSON.stringify(newData),
      updatedAt: new Date()
    })
    .where(eq(setupState.id, state.id));
}

/**
 * Mark setup as complete
 */
async function completeSetup() {
  const db = getDb();
  const state = await getSetupState();

  await db
    .update(setupState)
    .set({
      currentStep: 'complete',
      completed: true,
      updatedAt: new Date()
    })
    .where(eq(setupState.id, state.id));
}

// Step 1: Welcome & Plex connection check
setupRouter.get('/', async (req, res) => {
  try {
    const state = await getSetupState();

    // Check if already completed
    if (state.completed) {
      return res.redirect('/');
    }

    // Get effective configuration (DB overrides + env var fallbacks)
    const effectiveConfig = await getEffectiveConfig();

    // Check Plex connection using database settings (not cached client)
    let plexConnected = false;
    let plexServerInfo = null;
    let connectionError = null;
    try {
      // Use database settings directly to test connection
      if (effectiveConfig.plexBaseUrl && effectiveConfig.plexAuthToken) {
        const testServer = new PlexServer(effectiveConfig.plexBaseUrl, effectiveConfig.plexAuthToken);
        const response = await testServer.query('/');
        plexConnected = true;

        // The Plex API returns a nested MediaContainer object
        // Access the actual data from response.MediaContainer
        const mediaContainer = response.MediaContainer;

        plexServerInfo = {
          name: mediaContainer.friendlyName || 'Unknown',
          version: mediaContainer.version || 'Unknown',
          platform: mediaContainer.platform || 'Unknown'
        };
      } else {
        connectionError = 'Plex URL or token not configured';
      }
    } catch (error) {
      // Plex not connected - capture error for display
      connectionError = error instanceof Error ? error.message : 'Unknown error';
      console.error('Plex connection error in setup:', error);
    }

    // Render TSX component
    const { WelcomePage } = await import(getViewPath('setup/welcome.tsx'));
    const html = WelcomePage({
      step: 'welcome',
      steps: SETUP_STEPS,
      currentStepIndex: 0,
      plexConnected,
      plexServerInfo,
      connectionError,
      plexUrl: effectiveConfig.plexBaseUrl,
      plexToken: effectiveConfig.plexAuthToken ? '***' + effectiveConfig.plexAuthToken.slice(-4) : ''
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Save Plex configuration from web UI
setupRouter.post('/plex-config', async (req, res) => {
  try {
    const { plexUrl, plexToken } = req.body;

    if (!plexUrl || !plexToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Test connection before saving
    try {
      const testServer = new PlexServer(plexUrl, plexToken);
      await testServer.query('/');

      // Connection successful - save to database
      await setSetting('plex_base_url', plexUrl);
      await setSetting('plex_auth_token', plexToken);

      // Reset cached Plex client so it picks up new credentials
      const { resetPlexServer } = await import('../../plex/client.js');
      resetPlexServer();

      res.json({ success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      res.status(400).json({ error: `Failed to connect to Plex: ${errorMsg}` });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start setup (move to import step)
setupRouter.post('/start', async (req, res) => {
  try {
    await updateSetupState('import');
    res.redirect('/setup/import');
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Step 2: Import ratings
setupRouter.get('/import', async (req, res) => {
  try {
    const state = await getSetupState();

    // Render TSX component
    const { ImportPage } = await import(getViewPath('setup/import.tsx'));
    const html = ImportPage({
      step: 'import',
      steps: SETUP_STEPS,
      currentStepIndex: 1,
      state
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Skip import step
setupRouter.post('/import/skip', async (req, res) => {
  try {
    await updateSetupState('library_analysis', { importSkipped: true });
    res.redirect('/setup/library-analysis');
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Run import from directory path
setupRouter.post('/import/run', async (req, res) => {
  try {
    const { csvPath } = req.body;

    if (!csvPath) {
      return res.status(400).send(`
        <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
          <strong>Error:</strong> CSV path is required
        </div>
      `);
    }

    // Validate path exists
    if (!existsSync(csvPath)) {
      return res.status(400).send(`
        <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
          <strong>Error:</strong> Directory not found: <code>${csvPath}</code>
          <p style="margin: 0.5rem 0 0 0;">
            Make sure the path is correct and the directory exists on your server.
          </p>
        </div>
      `);
    }

    // Run import asynchronously
    res.send(`
      <div style="background: var(--pico-primary); padding: 1rem; border-radius: 0.25rem; margin-bottom: 1rem;">
        <strong>✓ Import Started</strong>
        <p style="margin: 0.5rem 0 0 0;">
          Processing CSV files from <code>${csvPath}</code>. This may take several minutes...
        </p>
      </div>
      <div id="import-progress">
        <p style="color: var(--pico-muted-color);">⏳ Running import...</p>
      </div>
    `);

    // Run import in background
    (async () => {
      try {
        const result = await importRatingsFromCSVs(csvPath, false);

        // Update setup state with import results
        await updateSetupState('library_analysis', {
          importCompleted: true,
          importResults: {
            totalTracks: result.totalTracks,
            matchedTracks: result.matchedTracks,
            ratingsSet: result.ratingsSet,
            skippedExisting: result.skippedExisting,
            errorCount: result.errors.length
          }
        });
      } catch (error) {
        console.error('Import error:', error);
      }
    })();

  } catch (error) {
    res.status(500).send(`
      <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.25rem;">
        <strong>Error:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
      </div>
    `);
  }
});

// Step 3: Library Analysis (consolidates cache + genres + API keys)
setupRouter.get('/library-analysis', async (req, res) => {
  try {
    const state = await getSetupState();

    // Get current cache stats from cache service
    const stats = await getCacheStats();
    const cacheStats = {
      total: stats.artists.total,
      bySource: stats.artists.bySource
    };

    // Get genre statistics from genre discovery service
    const genreSummaryMap = await getGenreSummary();
    const topGenres = Array.from(genreSummaryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([genre, count]) => ({ genre, count }));

    // Get import results if available
    let importResults = null;
    if (state.stepData) {
      try {
        const stepData = JSON.parse(state.stepData);
        importResults = stepData.importResults || null;
      } catch {
        // Ignore parse errors
      }
    }

    // Check which API keys are configured
    const apiKeysConfigured = {
      lastfm: !!APP_ENV.LASTFM_API_KEY,
      spotify: !!(APP_ENV.SPOTIFY_CLIENT_ID && APP_ENV.SPOTIFY_CLIENT_SECRET)
    };

    // Render TSX component
    const { LibraryAnalysisPage } = await import(getViewPath('setup/library-analysis.tsx'));
    const html = LibraryAnalysisPage({
      step: 'library_analysis',
      steps: SETUP_STEPS,
      currentStepIndex: 2,
      state,
      cacheStats,
      topGenres,
      totalGenres: genreSummaryMap.size,
      importResults,
      apiKeysConfigured
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Go back to import
setupRouter.post('/library-analysis/back', async (req, res) => {
  try {
    await updateSetupState('import');
    res.redirect('/setup/import');
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Proceed to playlists step
setupRouter.post('/library-analysis/next', async (req, res) => {
  try {
    await updateSetupState('playlists');
    res.redirect('/setup/playlists');
  } catch {
    res.status(500).send('Internal server error');
  }
});

// OLD ROUTES - Redirect to library-analysis for backward compatibility
setupRouter.get('/cache', async (req, res) => {
  res.redirect('/setup/library-analysis');
});

setupRouter.get('/genres', async (req, res) => {
  res.redirect('/setup/library-analysis');
});

setupRouter.get('/api-keys', async (req, res) => {
  res.redirect('/setup/library-analysis');
});

// Legacy POST routes redirect to new flow
setupRouter.post('/cache/next', async (req, res) => {
  res.redirect('/setup/library-analysis');
});

setupRouter.post('/genres/next', async (req, res) => {
  res.redirect('/setup/playlists');
});

setupRouter.post('/api-keys/next', async (req, res) => {
  res.redirect('/setup/playlists');
});

// Step 4: Generate first playlists
setupRouter.get('/playlists', async (req, res) => {
  try {
    const state = await getSetupState();

    // Get genre statistics from genre discovery service
    const genreSummaryMap = await getGenreSummary();
    const topGenres = Array.from(genreSummaryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre, artistCount]) => ({ genre, artistCount }));

    // Get total artist count from cache stats
    const cacheStats = await getCacheStats();

    // Get effective config for schedule info
    const effectiveConfig = await getEffectiveConfig();

    // Render TSX component
    const { PlaylistsPage } = await import(getViewPath('setup/playlists.tsx'));
    const html = PlaylistsPage({
      step: 'playlists',
      steps: SETUP_STEPS,
      currentStepIndex: 3,
      state,
      topGenres,
      totalGenres: genreSummaryMap.size,
      totalArtists: cacheStats.artists.total,
      dailyPlaylistsCron: effectiveConfig.dailyPlaylistsCron
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Complete setup
setupRouter.post('/complete', async (req, res) => {
  try {
    await completeSetup();
    res.redirect('/setup/complete');
  } catch {
    res.status(500).send('Internal server error');
  }
});

// Step 5: Complete
setupRouter.get('/complete', async (req, res) => {
  try {
    const state = await getSetupState();
    const effectiveConfig = await getEffectiveConfig();

    // Render TSX component
    const { CompletePage } = await import(getViewPath('setup/complete.tsx'));
    const html = CompletePage({
      step: 'complete',
      steps: SETUP_STEPS,
      currentStepIndex: 4,
      state,
      dailyPlaylistsCron: effectiveConfig.dailyPlaylistsCron
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('Internal server error');
  }
});
