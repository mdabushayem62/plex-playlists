/**
 * Playlists routes
 * View and manage generated playlists
 */

import { Router } from 'express';
import { getViewPath } from '../server.js';
import { getDb } from '../../db/index.js';
import { playlists, playlistTracks, jobRuns, setupState, customPlaylists } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { TIME_WINDOWS } from '../../windows.js';
import { getGenreSummary, getMoodSummary } from '../../config/genre-discovery.js';
import { getPlaylistRecommendations } from '../../playlist/recommendations.js';

export const playlistsRouter = Router();

// Middleware to check setup status
async function getSetupStatus() {
  const db = getDb();
  const setupStates = await db.select().from(setupState).limit(1);
  return setupStates.length > 0 && setupStates[0].completed;
}

/**
 * Main playlists page - list all generated playlists
 */
playlistsRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    const setupComplete = await getSetupStatus();

    // Get all playlists, ordered by most recently generated
    const allPlaylists = await db
      .select()
      .from(playlists)
      .orderBy(desc(playlists.generatedAt));

    // Get windows for categorization
    const timeWindows = TIME_WINDOWS as readonly string[];
    const specialWindows = ['discovery', 'throwback'];

    // Get most recent job run for each window
    const jobsByWindow = new Map<string, typeof jobRuns.$inferSelect>();
    const recentJobs = await db
      .select()
      .from(jobRuns)
      .orderBy(desc(jobRuns.startedAt));

    for (const job of recentJobs) {
      if (!jobsByWindow.has(job.window)) {
        jobsByWindow.set(job.window, job);
      }
    }

    // Categorize playlists
    const categorizePlaylist = (window: string) => {
      if (timeWindows.includes(window)) return 'daily';
      if (specialWindows.includes(window)) return 'special';
      return 'custom';
    };

    // Enrich playlists with job status
    const enrichedPlaylists = allPlaylists.map(playlist => ({
      ...playlist,
      lastJob: jobsByWindow.get(playlist.window),
      category: categorizePlaylist(playlist.window)
    }));

    // Check which special playlists exist
    const existingSpecialWindows = new Set(
      enrichedPlaylists
        .filter(p => p.category === 'special')
        .map(p => p.window)
    );

    // Create list of special playlists to show (existing + missing)
    const specialPlaylistDefs = [
      {
        window: 'discovery',
        title: '🔍 Discovery',
        description: 'Forgotten gems from your library (90+ days unplayed)',
        exists: existingSpecialWindows.has('discovery')
      },
      {
        window: 'throwback',
        title: '⏪ Throwback',
        description: 'Nostalgic favorites from 2-5 years ago',
        exists: existingSpecialWindows.has('throwback')
      }
    ];

    // Render TSX component
    const { PlaylistsIndexPage } = await import(getViewPath('playlists/index.tsx'));
    const html = PlaylistsIndexPage({
      playlists: enrichedPlaylists,
      dailyPlaylists: enrichedPlaylists.filter(p => p.category === 'daily'),
      specialPlaylists: enrichedPlaylists.filter(p => p.category === 'special'),
      customPlaylists: enrichedPlaylists.filter(p => p.category === 'custom'),
      specialPlaylistDefs,
      totalTracks: allPlaylists.reduce((sum, p) => sum + p.trackCount, 0),
      setupComplete,
      page: 'playlists'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Playlists page error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Playlist builder page
 * IMPORTANT: This must come BEFORE /:id route to avoid "builder" being parsed as an ID
 */
playlistsRouter.get('/builder', async (req, res) => {
  try {
    const db = getDb();
    const setupComplete = await getSetupStatus();

    // Get all custom playlists
    const dbPlaylists = await db
      .select()
      .from(customPlaylists)
      .orderBy(desc(customPlaylists.createdAt));

    // Parse JSON fields
    const parsedPlaylists = dbPlaylists.map(p => ({
      ...p,
      genres: JSON.parse(p.genres) as string[],
      moods: JSON.parse(p.moods) as string[]
    }));

    // Get available genres and moods from cache
    const genreSummary = await getGenreSummary();
    const moodSummary = await getMoodSummary();

    // Filter to genres/moods with meaningful data (at least 5 artists/tracks)
    const availableGenres = Array.from(genreSummary.entries())
      .filter(([, count]) => count >= 5)
      .map(([genre]) => genre);

    const availableMoods = Array.from(moodSummary.entries())
      .filter(([, count]) => count >= 3)
      .map(([mood]) => mood);

    // Render TSX component
    const { PlaylistBuilderPage } = await import(getViewPath('playlists/builder.tsx'));
    const html = PlaylistBuilderPage({
      customPlaylists: parsedPlaylists,
      availableGenres,
      availableMoods,
      setupComplete,
      page: 'playlists'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Playlist builder page error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Create a new custom playlist
 */
playlistsRouter.post('/builder', async (req, res) => {
  try {
    const { name, genres, moods, targetSize, description } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!Array.isArray(genres) || !Array.isArray(moods)) {
      return res.status(400).json({ error: 'Genres and moods must be arrays' });
    }

    if (genres.length > 2) {
      return res.status(400).json({ error: 'Maximum 2 genres allowed' });
    }

    if (moods.length > 2) {
      return res.status(400).json({ error: 'Maximum 2 moods allowed' });
    }

    if (genres.length === 0 && moods.length === 0) {
      return res.status(400).json({ error: 'At least one genre or mood is required' });
    }

    if (targetSize && (targetSize < 10 || targetSize > 200)) {
      return res.status(400).json({ error: 'Target size must be between 10 and 200' });
    }

    const db = getDb();

    // Check for duplicate name
    const existing = await db
      .select()
      .from(customPlaylists)
      .where(eq(customPlaylists.name, name.trim()))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'A playlist with this name already exists' });
    }

    // Insert new playlist
    await db.insert(customPlaylists).values({
      name: name.trim(),
      genres: JSON.stringify(genres),
      moods: JSON.stringify(moods),
      targetSize: targetSize || 50,
      description: description || null,
      enabled: true
    });

    res.json({ success: true, message: 'Playlist created successfully' });
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

/**
 * Get playlist recommendations based on user's library
 */
playlistsRouter.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await getPlaylistRecommendations();
    res.json({ success: true, recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

/**
 * Toggle playlist enabled/disabled
 */
playlistsRouter.put('/builder/:id/toggle', async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id, 10);
    const { enabled } = req.body;

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean' });
    }

    const db = getDb();

    await db
      .update(customPlaylists)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(customPlaylists.id, playlistId));

    res.json({ success: true });
  } catch (error) {
    console.error('Toggle playlist error:', error);
    res.status(500).json({ error: 'Failed to toggle playlist' });
  }
});

/**
 * Generate a playlist immediately (trigger job)
 */
playlistsRouter.post('/builder/:id/generate', async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }

    const db = getDb();

    // Get playlist details
    const playlist = await db
      .select()
      .from(customPlaylists)
      .where(eq(customPlaylists.id, playlistId))
      .limit(1);

    if (playlist.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Import and trigger generation (async, don't wait)
    const { generateCustomPlaylist } = await import('../../playlist/custom-playlist-runner.js');

    // Run in background
    generateCustomPlaylist({ playlistId })
      .then(() => {
        console.log(`Custom playlist ${playlistId} generated successfully`);
      })
      .catch(err => {
        console.error(`Custom playlist ${playlistId} generation failed:`, err);
      });

    res.json({
      success: true,
      message: 'Playlist generation started'
    });
  } catch (error) {
    console.error('Generate playlist error:', error);
    res.status(500).json({ error: 'Failed to start generation' });
  }
});

/**
 * Delete a custom playlist
 */
playlistsRouter.delete('/builder/:id', async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }

    const db = getDb();

    await db
      .delete(customPlaylists)
      .where(eq(customPlaylists.id, playlistId));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

/**
 * Individual playlist detail page
 */
playlistsRouter.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const setupComplete = await getSetupStatus();
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId)) {
      return res.status(400).send('Invalid playlist ID');
    }

    // Get playlist
    const playlist = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (playlist.length === 0) {
      return res.status(404).send('Playlist not found');
    }

    // Get all playlists for navigation (sorted by window, then by generated date)
    const allPlaylists = await db
      .select()
      .from(playlists)
      .orderBy(desc(playlists.generatedAt));

    // Find previous and next playlists
    const currentIndex = allPlaylists.findIndex(p => p.id === playlistId);
    const prevPlaylist = currentIndex > 0 ? allPlaylists[currentIndex - 1] : null;
    const nextPlaylist = currentIndex < allPlaylists.length - 1 ? allPlaylists[currentIndex + 1] : null;

    // Get tracks
    const dbTracks = await db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position);

    // Transform database tracks to view format (plexRatingKey → ratingKey)
    const tracks = dbTracks.map(track => ({
      position: track.position,
      ratingKey: track.plexRatingKey,
      title: track.title,
      artist: track.artist,
      album: track.album,
      genres: track.genres,
      score: track.score,
      recencyWeight: track.recencyWeight,
      fallbackScore: track.fallbackScore
    }));

    // Get most recent job for this window
    const recentJobs = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.window, playlist[0].window))
      .orderBy(desc(jobRuns.startedAt))
      .limit(5);

    // Calculate genre statistics for tag cloud
    const genreMap = new Map<string, number>();
    tracks.forEach(track => {
      if (track.genres) {
        try {
          const genres = JSON.parse(track.genres);
          genres.forEach((genre: string) => {
            genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
          });
        } catch {
          // Skip invalid JSON
        }
      }
    });

    const genreStats = Array.from(genreMap.entries())
      .map(([genre, count]) => ({ genre, count, percentage: (count / tracks.length) * 100 }))
      .sort((a, b) => b.count - a.count);

    // Render TSX component
    const { PlaylistDetailPage } = await import(getViewPath('playlists/detail.tsx'));
    const html = PlaylistDetailPage({
      playlist: playlist[0],
      tracks,
      recentJobs,
      genreStats,
      prevPlaylist,
      nextPlaylist,
      setupComplete,
      page: 'playlists',
      breadcrumbs: [
        { label: 'Dashboard', url: '/' },
        { label: 'Playlists', url: '/playlists' },
        { label: playlist[0].title || playlist[0].window, url: null }
      ]
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Playlist detail error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Export playlist as M3U
 */
playlistsRouter.get('/:id/export/m3u', async (req, res) => {
  try {
    const db = getDb();
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId)) {
      return res.status(400).send('Invalid playlist ID');
    }

    // Get playlist
    const playlist = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (playlist.length === 0) {
      return res.status(404).send('Playlist not found');
    }

    // Get tracks
    const tracks = await db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position);

    // Generate M3U content
    let m3uContent = '#EXTM3U\n';
    m3uContent += `#PLAYLIST:${playlist[0].title || playlist[0].window}\n\n`;

    tracks.forEach(track => {
      // M3U extended format: #EXTINF:duration,artist - title
      m3uContent += `#EXTINF:-1,${track.artist || 'Unknown Artist'} - ${track.title || 'Unknown Title'}\n`;
      // Note: We don't have file paths, so we'll use a placeholder
      // In a real scenario, you'd query Plex for the actual media path
      m3uContent += `# Plex Rating Key: ${track.plexRatingKey}\n`;
      m3uContent += `# Album: ${track.album || 'Unknown'}\n`;
      m3uContent += `# Score: ${track.score ? track.score.toFixed(3) : 'N/A'}\n\n`;
    });

    // Set headers for download
    const filename = `${playlist[0].window}-${new Date().toISOString().split('T')[0]}.m3u`;
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(m3uContent);
  } catch (error) {
    console.error('M3U export error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Export playlist as CSV
 */
playlistsRouter.get('/:id/export/csv', async (req, res) => {
  try {
    const db = getDb();
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId)) {
      return res.status(400).send('Invalid playlist ID');
    }

    // Get playlist
    const playlist = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (playlist.length === 0) {
      return res.status(404).send('Playlist not found');
    }

    // Get tracks
    const tracks = await db
      .select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position);

    // Generate CSV content
    let csvContent = 'Position,Title,Artist,Album,Rating Key,Score,Recency Weight,Fallback Score,Genres\n';

    tracks.forEach(track => {
      const genres = track.genres ? `"${track.genres.replace(/"/g, '""')}"` : '""';
      const title = track.title ? `"${track.title.replace(/"/g, '""')}"` : '""';
      const artist = track.artist ? `"${track.artist.replace(/"/g, '""')}"` : '""';
      const album = track.album ? `"${track.album.replace(/"/g, '""')}"` : '""';

      csvContent += `${track.position + 1},${title},${artist},${album},${track.plexRatingKey},`;
      csvContent += `${track.score || ''},${track.recencyWeight || ''},${track.fallbackScore || ''},${genres}\n`;
    });

    // Set headers for download
    const filename = `${playlist[0].window}-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).send('Internal server error');
  }
});
