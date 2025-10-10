/**
 * Actions dashboard - manual operations
 * TSX version with pure JSX composition
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface JobProgress {
  id: string;
  type: 'playlist' | 'cache';
  status: 'running' | 'success' | 'failed';
  started: Date;
  finished?: Date;
  progress?: number;
  error?: string;
}

interface GenreWindow {
  window: string;
  displayName?: string;
}

interface JobRun {
  id: number;
  window: string;
  status: string;
  startedAt: Date;
  finishedAt?: Date | null;
  error?: string | null;
}

export interface ActionsPageProps {
  timeWindows: readonly string[];
  genreWindows: GenreWindow[];
  recentJobs: JobRun[];
  cacheStats: {
    artists: {
      total: number;
      bySource: Record<string, number>;
      expired: number;
    };
    albums: {
      total: number;
      bySource: Record<string, number>;
      expired: number;
    };
  };
  activeJobs: JobProgress[];
  page: string;
  setupComplete: boolean;
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

export function ActionsPage(props: ActionsPageProps): JSX.Element {
  const {
    timeWindows,
    genreWindows,
    recentJobs,
    cacheStats,
    activeJobs,
    page,
    setupComplete
  } = props;

  return (
    <Layout title="Manual Actions" page={page} setupComplete={setupComplete}>
      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Actions</span></li>
          </ol>
        </nav>

        <h2>Manual Actions</h2>
        <p style="color: var(--pico-muted-color);">
          Trigger on-demand operations like playlist generation and cache management.
        </p>

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <section style="margin-bottom: 2rem;">
            <h3>Active Jobs</h3>
            <div id="active-jobs">
              {activeJobs.map(job => (
                <div class="stat-card" id={`job-${job.id}`}>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong>{job.type === 'playlist' ? '🎵 Playlist Generation' : '💾 Cache Warming'}</strong>
                      <div style="color: var(--pico-muted-color); font-size: 0.875rem;">
                        Started {timeAgo(job.started)}
                      </div>
                    </div>
                    <div>
                      <span class={`status-badge status-${job.status}`}>{job.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Playlist Generation */}
        <section style="margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0 0 0.5rem 0;">Generate Playlists</h3>
              <p style="color: var(--pico-muted-color); margin: 0;">
                Generate playlists immediately without waiting for the scheduled time.
              </p>
            </div>
            <a href="/playlists/builder" role="button" class="secondary" style="white-space: nowrap;">
              🎨 Custom Playlists
            </a>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h4 style="margin: 0;">Time-Based Playlists</h4>
            <small style="color: var(--pico-muted-color);">
              For genre/mood combinations, use the <a href="/playlists/builder">playlist builder</a>
            </small>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            {timeWindows.map(window => (
              <form method="POST" action={`/actions/generate/${window}`}>
                <button type="submit" style="width: 100%;">
                  {window === 'morning' ? '🌅' : window === 'afternoon' ? '☀️' : '🌙'}
                  {' '}
                  {window.charAt(0).toUpperCase() + window.slice(1)}
                </button>
              </form>
            ))}
          </div>

          {genreWindows.length > 0 && (
            <>
              <h4>Genre Playlists ({genreWindows.length})</h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                {genreWindows.map(gw => (
                  <form method="POST" action={`/actions/generate/${gw.window}`}>
                    <button type="submit" class="secondary" style="width: 100%;">
                      🎵 {gw.displayName || gw.window}
                    </button>
                  </form>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Cache Management */}
        <section style="margin-bottom: 2rem;">
          <h3>Cache Management</h3>

          <h4>Artist Cache</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div class="stat-card">
              <h3>{cacheStats.artists.total}</h3>
              <p>Total Artists</p>
            </div>
            {Object.entries(cacheStats.artists.bySource).map(([source, count]) => (
              <div class="stat-card">
                <h3>{count}</h3>
                <p>{source}</p>
              </div>
            ))}
            <div class="stat-card">
              <h3>{cacheStats.artists.expired}</h3>
              <p>Expired</p>
            </div>
          </div>

          {/* Artist Cache Progress Bar */}
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

          <h4>Album Cache</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div class="stat-card">
              <h3>{cacheStats.albums.total}</h3>
              <p>Total Albums</p>
            </div>
            {Object.entries(cacheStats.albums.bySource).map(([source, count]) => (
              <div class="stat-card">
                <h3>{count}</h3>
                <p>{source}</p>
              </div>
            ))}
            <div class="stat-card">
              <h3>{cacheStats.albums.expired}</h3>
              <p>Expired</p>
            </div>
          </div>

          {/* Album Cache Progress Bar */}
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
            <button id="warmCacheBtn" class="secondary" onclick="warmCache()">🔥 Warm Artist Cache</button>
            <button id="warmAlbumCacheBtn" class="secondary" onclick="warmAlbumCache()">🔥 Warm Album Cache</button>
            <a href="/actions/cache" role="button" class="secondary">View Details</a>
            <form method="POST" action="/actions/cache/clear-expired" style="display: inline;">
              <button type="submit" class="secondary">Clear Expired</button>
            </form>
          </div>
          <div id="cache-warm-status" style="margin-top: 1rem;"></div>

          <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem; margin-top: 1rem;">
            <p style="margin: 0 0 0.5rem 0;">
              💡 <strong>Tip:</strong> Album genres are more accurate for varied artists (e.g., Taylor Swift).
            </p>
            <p style="margin: 0;">
              Artist cache is used as fallback when album genres aren't found.
            </p>
          </div>
        </section>

        {/* Import Ratings */}
        <section style="margin-bottom: 2rem;">
          <h3>Import Ratings</h3>
          <p style="color: var(--pico-muted-color); margin-bottom: 1rem;">
            Import ratings from CSV (Spotify, iTunes, Navidrome) or JSON (YouTube Music) exports.
          </p>

          <form id="importForm" hx-post="/actions/import/run" hx-target="#import-results" hx-indicator="#import-spinner">
            <label>
              Import Directory Path
              <input
                type="text"
                name="csvPath"
                value="/config/ratings"
                placeholder="/config/ratings"
                required
              />
              <small>Path to directory containing CSV or JSON files (auto-detected)</small>
            </label>

            <div style="display: flex; gap: 1rem; align-items: center;">
              <button type="submit" class="secondary">🔄 Start Import</button>
              <div id="import-spinner" class="htmx-indicator" style="color: var(--pico-muted-color);">
                Processing...
              </div>
            </div>
          </form>

          <div id="import-results" style="margin-top: 1rem;"></div>

          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer;">CSV Format Requirements</summary>
            <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
              <p style="margin-bottom: 0.5rem;">
                Your CSV files must include: <code>title</code>, <code>artist</code>, <code>album</code>, and <code>rating</code>
              </p>
              <p style="margin: 0; font-size: 0.875rem;">
                📖 See <a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/importing.md" target="_blank">Importing Guide</a>
                for detailed format specifications.
              </p>
            </div>
          </details>
        </section>

        {/* Recent Job History */}
        <section>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">Recent Job History</h3>
            <a href="/actions/history" style="font-size: 0.875rem;">View Full History →</a>
          </div>
          {recentJobs.length === 0 ? (
            <p style="color: var(--pico-muted-color);">No job history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => {
                  const duration = job.finishedAt && job.startedAt
                    ? Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
                    : null;
                  return (
                    <tr>
                      <td>{job.window}</td>
                      <td>
                        <span class={`status-badge status-${job.status}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>{timeAgo(job.startedAt)}</td>
                      <td>{duration ? duration + 's' : job.status === 'running' ? '...' : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Load shared job monitoring module and actions.js */}
      <script src="/js/job-monitor.js"></script>
      <script src="/js/actions.js"></script>

      {/* Initialize with active job IDs */}
      <script>{`
        window.activeJobIds = ${JSON.stringify(activeJobs.map(j => j.id))};
      `}</script>
    </Layout>
  );
}
