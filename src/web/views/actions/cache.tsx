/**
 * Cache Management Page - TSX version
 * Shows metadata cache statistics and management tools
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface CacheEntry {
  artistName: string;
  albumName?: string;
  genres: string;
  source: string;
  cachedAt: Date;
  expiresAt: Date | null;
}

interface CacheStats {
  total: number;
  bySource: Record<string, number>;
  expired: number;
  expiringWithin7Days: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export interface AudioMuseStats {
  configured: boolean;
  audioMuse?: {
    totalTracks: number;
    totalArtists: number;
    tempo: { min: number; max: number; avg: number };
    energy: { min: number; max: number; avg: number };
  };
  sync?: {
    totalInAudioMuse: number;
    totalSynced: number;
    coveragePercent: number;
  };
  error?: string;
  message?: string;
}

export interface CachePageProps {
  stats: {
    artists: CacheStats;
    albums: CacheStats;
  };
  artistEntries: CacheEntry[];
  albumEntries: CacheEntry[];
  audioMuseStats: AudioMuseStats | null;
  setupComplete: boolean;
  page: string;
}

function formatDate(date: Date): JSX.Element {
  return new Date(date).toLocaleDateString();
}

function timeAgo(date: Date): JSX.Element {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function StatsCard({ title, stats }: { title: string; stats: CacheStats }): JSX.Element {
  return (
    <div style="margin-bottom: 2rem;">
      <h3>{title}</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
        <div class="stat-card">
          <h3>{stats.total}</h3>
          <p>Total Entries</p>
        </div>
        {Object.entries(stats.bySource).map(([source, count]) => (
          <div class="stat-card">
            <h3>{count}</h3>
            <p>{source}</p>
          </div>
        ))}
      </div>

      {(stats.oldestEntry || stats.newestEntry) && (
        <div style="margin-top: 1rem; color: var(--pico-muted-color); font-size: 0.875rem;">
          {stats.oldestEntry && <div>Oldest entry: {formatDate(stats.oldestEntry)}</div>}
          {stats.newestEntry && <div>Newest entry: {formatDate(stats.newestEntry)}</div>}
        </div>
      )}
    </div>
  );
}

export function CachePage(props: CachePageProps): JSX.Element {
  const { stats, artistEntries, albumEntries, audioMuseStats, setupComplete, page } = props;

  return (
    <Layout title="Cache Management" page={page} setupComplete={setupComplete}>
      <>
      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><a href="/actions">Actions</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Cache Management</span></li>
          </ol>
        </nav>

        <h2>Metadata Cache Management</h2>
        <p style="color: var(--pico-muted-color);">
          The metadata cache stores artist and album information (genres, moods, popularity) fetched from Last.fm and Spotify APIs.
        </p>

        {/* Artist Cache Statistics */}
        <StatsCard title="Artist Cache" stats={stats.artists} />

        {/* Album Cache Statistics */}
        <StatsCard title="Album Cache" stats={stats.albums} />

        {/* AudioMuse Integration */}
        {audioMuseStats && (
          <div style="margin-bottom: 2rem;">
            <h3>AudioMuse Audio Features</h3>
            {!audioMuseStats.configured ? (
              <div style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem;">
                <p style="color: var(--pico-muted-color); margin: 0;">
                  {audioMuseStats.message || 'AudioMuse not configured'}
                </p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem;">
                  Add <code>AUDIOMUSE_DB_HOST</code>, <code>AUDIOMUSE_DB_USER</code>, and <code>AUDIOMUSE_DB_PASSWORD</code> to .env
                </p>
              </div>
            ) : audioMuseStats.error ? (
              <div style="background: var(--pico-del-color); padding: 1rem; border-radius: 0.5rem;">
                <p style="margin: 0;"><strong>Connection Error:</strong> {audioMuseStats.error}</p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: var(--pico-muted-color);">
                  {audioMuseStats.message}
                </p>
              </div>
            ) : (
              <>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                  <div class="stat-card">
                    <h3>{audioMuseStats.sync?.totalSynced || 0}</h3>
                    <p>Synced Tracks</p>
                  </div>
                  <div class="stat-card">
                    <h3>{audioMuseStats.audioMuse?.totalTracks || 0}</h3>
                    <p>AudioMuse Total</p>
                  </div>
                  <div class="stat-card">
                    <h3>{audioMuseStats.sync?.coveragePercent?.toFixed(1) || 0}%</h3>
                    <p>Coverage</p>
                  </div>
                  <div class="stat-card">
                    <h3>{audioMuseStats.audioMuse?.totalArtists || 0}</h3>
                    <p>Artists</p>
                  </div>
                </div>
                {audioMuseStats.audioMuse && (
                  <div style="margin-top: 1rem; color: var(--pico-muted-color); font-size: 0.875rem;">
                    <div>Tempo: {audioMuseStats.audioMuse.tempo.min.toFixed(0)} - {audioMuseStats.audioMuse.tempo.max.toFixed(0)} BPM (avg: {audioMuseStats.audioMuse.tempo.avg.toFixed(0)})</div>
                    <div>Energy: {(audioMuseStats.audioMuse.energy.min * 100).toFixed(1)}% - {(audioMuseStats.audioMuse.energy.max * 100).toFixed(1)}% (avg: {(audioMuseStats.audioMuse.energy.avg * 100).toFixed(1)}%)</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <section style="margin-bottom: 2rem;">
          <h3>Cache Actions</h3>

          {/* Artist Cache Progress */}
          <div id="artist-cache-progress" style="display: none; background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div>
                <strong id="artist-cache-progress-label">Warming artist cache...</strong>
                <div style="color: var(--pico-muted-color); font-size: 0.875rem;" id="artist-cache-progress-message">Starting...</div>
              </div>
              <div style="text-align: right;">
                <div id="artist-cache-progress-percent" style="font-size: 1.25rem; font-weight: bold;">0%</div>
                <div id="artist-cache-progress-eta" style="color: var(--pico-muted-color); font-size: 0.75rem;">calculating...</div>
              </div>
            </div>
            <progress id="artist-cache-progress-bar" value="0" max="100" style="width: 100%;"></progress>
          </div>

          {/* Album Cache Progress */}
          <div id="album-cache-progress" style="display: none; background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div>
                <strong id="album-cache-progress-label">Warming album cache...</strong>
                <div style="color: var(--pico-muted-color); font-size: 0.875rem;" id="album-cache-progress-message">Starting...</div>
              </div>
              <div style="text-align: right;">
                <div id="album-cache-progress-percent" style="font-size: 1.25rem; font-weight: bold;">0%</div>
                <div id="album-cache-progress-eta" style="color: var(--pico-muted-color); font-size: 0.75rem;">calculating...</div>
              </div>
            </div>
            <progress id="album-cache-progress-bar" value="0" max="100" style="width: 100%;"></progress>
          </div>

          {/* AudioMuse Sync Progress */}
          <div id="audiomuse-sync-progress" style="display: none; background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div>
                <strong id="audiomuse-sync-progress-label">Syncing AudioMuse features...</strong>
                <div style="color: var(--pico-muted-color); font-size: 0.875rem;" id="audiomuse-sync-progress-message">Starting...</div>
              </div>
              <div style="text-align: right;">
                <div id="audiomuse-sync-progress-percent" style="font-size: 1.25rem; font-weight: bold;">0%</div>
                <div id="audiomuse-sync-progress-eta" style="color: var(--pico-muted-color); font-size: 0.75rem;">calculating...</div>
              </div>
            </div>
            <progress id="audiomuse-sync-progress-bar" value="0" max="100" style="width: 100%;"></progress>
          </div>

          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <button id="warmCacheBtn" class="secondary" onclick="warmCache()">
              🔥 Warm Artist Cache
            </button>
            <button id="warmAlbumCacheBtn" class="secondary" onclick="warmAlbumCache()">
              🔥 Warm Album Cache
            </button>
            {audioMuseStats?.configured && !audioMuseStats.error && (
              <button id="syncAudioMuseBtn" class="secondary" onclick="syncAudioMuse()">
                🎵 Sync AudioMuse Features
              </button>
            )}
            <button
              id="clearAllBtn"
              class="secondary"
              onclick={`confirmClearAll(${stats.artists.total + stats.albums.total})`}
              disabled={stats.artists.total + stats.albums.total === 0}
            >
              Clear All ({stats.artists.total + stats.albums.total})
            </button>
          </div>
          <div id="action-status" style="margin-top: 1rem;"></div>

          <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem; margin-top: 1rem;">
            <p style="margin: 0 0 0.5rem 0;">
              💡 <strong>Tips:</strong>
            </p>
            <ul style="margin: 0; padding-left: 1.5rem;">
              <li><strong>Artist Cache:</strong> Fallback when album genres aren't found</li>
              <li><strong>Album Cache:</strong> More accurate genres for varied artists</li>
              <li><strong>AudioMuse:</strong> Provides tempo, energy, mood, and audio features for tracks</li>
              <li>Album cache warming may take 20-30 minutes for large libraries</li>
              {audioMuseStats?.configured && !audioMuseStats.error && audioMuseStats.sync && (
                <li>AudioMuse sync matches tracks by title/artist (coverage: {audioMuseStats.sync.coveragePercent.toFixed(1)}%)</li>
              )}
            </ul>
          </div>
        </section>

        {/* Artist Entries */}
        <section style="margin-bottom: 2rem;">
          <h3>Artist Cache Sample (Latest 50)</h3>
          {artistEntries.length === 0 ? (
            <p style="color: var(--pico-muted-color);">
              No cache entries yet. Generate a playlist from the <a href="/actions">Actions</a> page to populate the cache.
            </p>
          ) : (
            <>
              <div style="overflow-x: auto;">
                <table>
                  <thead>
                    <tr>
                      <th>Artist</th>
                      <th>Genres</th>
                      <th>Source</th>
                      <th>Cached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artistEntries.map(entry => {
                      let genres: string;
                      try {
                        genres = JSON.parse(entry.genres).join(', ');
                      } catch {
                        genres = 'Invalid';
                      }

                      return (
                        <tr>
                          <td><strong>{entry.artistName}</strong></td>
                          <td style="font-size: 0.875rem;">
                            {genres.length > 50 ? genres.substring(0, 50) + '...' : genres}
                          </td>
                          <td>{entry.source}</td>
                          <td style="font-size: 0.875rem;">{timeAgo(entry.cachedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stats.artists.total > 50 && (
                <p style="color: var(--pico-muted-color); margin-top: 0.5rem; font-size: 0.875rem;">
                  Showing latest 50 of {stats.artists.total} entries.
                </p>
              )}
            </>
          )}
        </section>

        {/* Album Entries */}
        <section>
          <h3>Album Cache Sample (Latest 50)</h3>
          {albumEntries.length === 0 ? (
            <p style="color: var(--pico-muted-color);">
              No album cache entries yet. Use "Warm Album Cache" to populate.
            </p>
          ) : (
            <>
              <div style="overflow-x: auto;">
                <table>
                  <thead>
                    <tr>
                      <th>Album</th>
                      <th>Artist</th>
                      <th>Genres</th>
                      <th>Source</th>
                      <th>Cached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {albumEntries.map(entry => {
                      let genres: string;
                      try {
                        genres = JSON.parse(entry.genres).join(', ');
                      } catch {
                        genres = 'Invalid';
                      }

                      return (
                        <tr>
                          <td><strong>{(entry as any).albumName || 'Unknown'}</strong></td>
                          <td>{entry.artistName}</td>
                          <td style="font-size: 0.875rem;">
                            {genres.length > 50 ? genres.substring(0, 50) + '...' : genres}
                          </td>
                          <td>{entry.source}</td>
                          <td style="font-size: 0.875rem;">{timeAgo(entry.cachedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stats.albums.total > 50 && (
                <p style="color: var(--pico-muted-color); margin-top: 0.5rem; font-size: 0.875rem;">
                  Showing latest 50 of {stats.albums.total} entries.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* Load shared job monitoring module and cache.js */}
      <script src="/js/job-monitor.js"></script>
      <script src="/js/cache.js"></script>
      </>
    </Layout>
  );
}
