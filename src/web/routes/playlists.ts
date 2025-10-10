/**
 * Playlists routes
 * View and manage generated playlists
 */

import { Router } from 'express';
import { getViewPath } from '../server.js';
import { getDb } from '../../db/index.js';
import { playlists, playlistTracks, jobRuns, setupState } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { TIME_WINDOWS } from '../../windows.js';

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

    // Get genre windows for categorization
    const timeWindows = TIME_WINDOWS as readonly string[];

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

    // Enrich playlists with job status
    const enrichedPlaylists = allPlaylists.map(playlist => ({
      ...playlist,
      lastJob: jobsByWindow.get(playlist.window),
      category: timeWindows.includes(playlist.window) ? 'daily' : 'genre'
    }));

    // Render TSX component
    const { PlaylistsIndexPage } = await import(getViewPath('playlists/index.tsx'));
    const html = PlaylistsIndexPage({
      playlists: enrichedPlaylists,
      dailyPlaylists: enrichedPlaylists.filter(p => p.category === 'daily'),
      genrePlaylists: enrichedPlaylists.filter(p => p.category === 'genre'),
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
