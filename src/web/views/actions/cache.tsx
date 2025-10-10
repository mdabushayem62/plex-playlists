/**
 * Cache Management Page - TSX version
 * Shows genre cache statistics and management tools
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

export interface CachePageProps {
  stats: {
    artists: CacheStats;
    albums: CacheStats;
  };
  artistEntries: CacheEntry[];
  albumEntries: CacheEntry[];
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
  const { stats, artistEntries, albumEntries, setupComplete, page } = props;

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

        <h2>Genre Cache Management</h2>
        <p style="color: var(--pico-muted-color);">
          The genre cache stores artist and album genre information fetched from Last.fm and Spotify APIs.
        </p>

        {/* Artist Cache Statistics */}
        <StatsCard title="Artist Cache" stats={stats.artists} />

        {/* Album Cache Statistics */}
        <StatsCard title="Album Cache" stats={stats.albums} />

        {/* Actions */}
        <section style="margin-bottom: 2rem;">
          <h3>Actions</h3>

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

          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <button id="warmCacheBtn" class="secondary" onclick="warmCache()">
              🔥 Warm Artist Cache
            </button>
            <button id="warmAlbumCacheBtn" class="secondary" onclick="warmAlbumCache()">
              🔥 Warm Album Cache
            </button>
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
              <li>Artist cache is used as fallback when album genres aren't found</li>
              <li>Album cache provides more accurate genres for varied artists</li>
              <li>Warm Album Cache fetches genres for ~{stats.albums.total > 0 ? stats.albums.total : '11,000+'} albums (may take 20-30 min)</li>
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
