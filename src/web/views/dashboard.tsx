/**
 * Dashboard - main landing page
 * TSX version with pure JSX composition
 */

import Html from '@kitajs/html';
import { Layout } from './layout.tsx';

interface Playlist {
  id: number;
  window: string;
  title: string | null;
  trackCount: number;
  generatedAt: Date;
  plexRatingKey: string | null;
}

interface JobRun {
  id: number;
  window: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

interface CacheStats {
  total: number;
  bySource: Record<string, number>;
  expired: number;
}

export interface DashboardPageProps {
  playlists: Playlist[];
  dailyPlaylists: Playlist[];
  genrePlaylists: Playlist[];
  jobs: JobRun[];
  cacheStats: CacheStats;
  setupComplete: boolean;
  page: string;
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

function getPlaylistIcon(window: string): JSX.Element {
  if (window === 'morning') return '🌅';
  if (window === 'afternoon') return '☀️';
  if (window === 'evening') return '🌙';
  return '🎵';
}

export function DashboardPage(props: DashboardPageProps) {
  const {
    playlists,
    dailyPlaylists,
    genrePlaylists,
    jobs,
    cacheStats,
    setupComplete,
    page
  } = props;

  // Get most recent error for activity section (max 1)
  const mostRecentError = jobs.find(j => j.status === 'failed');

  return (
    <Layout title="Dashboard" page={page} setupComplete={setupComplete}>
      <div>
        <h2>Dashboard</h2>

        {/* Setup Wizard Banner */}
        {!setupComplete && (
          <div style="background: var(--pico-card-background-color); padding: var(--spacing-normal); border-radius: 0.5rem; margin-bottom: var(--spacing-section); border-left: 4px solid var(--pico-primary);">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">👋 Welcome! Let's get you set up</h3>
            <p style="margin: 0 0 0.75rem 0; font-size: 0.9rem;">
              Run the setup wizard to configure your playlist generator and learn about all the features.
            </p>
            <a href="/setup" role="button" style="margin: 0;">Start Setup Wizard →</a>
          </div>
        )}

        {/* Playlist Overview */}
        <section class="card-section">
          <h3>📋 Playlist Overview</h3>

          {/* Daily Playlists */}
          <div class="mb-normal">
            <h4 class="text-muted mb-normal">Daily Playlists</h4>
            <div class="grid-dense">
              <div class="row-item flex-between">
                <span>🌅 Morning</span>
                <span class="text-sm text-muted">Every day at 5:00am • 6-11am history</span>
              </div>
              <div class="row-item flex-between">
                <span>☀️ Afternoon</span>
                <span class="text-sm text-muted">Every day at 5:00am • 12-5pm history</span>
              </div>
              <div class="row-item flex-between">
                <span>🌙 Evening</span>
                <span class="text-sm text-muted">Every day at 5:00am • 6-11pm history</span>
              </div>
            </div>
          </div>

          {/* Special Playlists */}
          <div class="mb-normal">
            <h4 class="text-muted mb-normal">Special Playlists</h4>
            <div class="grid-dense">
              <div class="row-item flex-between">
                <span>🔍 Discovery</span>
                <span class="text-sm text-muted">Monday 6:00am • Forgotten gems (90+ days)</span>
              </div>
              <div class="row-item flex-between">
                <span>⏮️ Throwback</span>
                <span class="text-sm text-muted">Saturday 6:00am • Nostalgia (2-5 years ago)</span>
              </div>
            </div>
          </div>

          {/* Custom Playlists */}
          {genrePlaylists.length > 0 && (
            <div>
              <h4 class="text-muted mb-normal">
                Custom Playlists ({genrePlaylists.length})
              </h4>
              <div class="grid-dense">
                {genrePlaylists.slice(0, 3).map(p => (
                  <div class="row-item flex-between">
                    <a href={`/playlists/${p.id}`} style="text-decoration: none; color: inherit;">🎵 {p.title || p.window}</a>
                    <span class="text-sm text-muted">{p.trackCount} tracks • {timeAgo(p.generatedAt)}</span>
                  </div>
                ))}
              </div>
              {genrePlaylists.length > 3 && (
                <a href="/playlists" class="text-sm" style="display: block; text-align: center; margin-top: var(--spacing-normal);">
                  View all {genrePlaylists.length} custom playlists →
                </a>
              )}
            </div>
          )}

          <div class="flex-gap-sm mt-section pt-section border-top">
            <a href="/config/settings" class="text-sm">⚙️ Configure Schedules</a>
            <span class="text-muted">|</span>
            <a href="/playlists" class="text-sm">🎵 Manage Custom Playlists</a>
          </div>
        </section>

        {/* Stats Overview */}
        <div class="grid-auto-wide">
          <div class="stat-card">
            <h3>{playlists.length}</h3>
            <p>Total Playlists</p>
            <small class="text-muted text-sm">
              {dailyPlaylists.length} daily, {genrePlaylists.length} custom
            </small>
          </div>
          <div class="stat-card">
            <h3>{playlists.reduce((sum, p) => sum + p.trackCount, 0)}</h3>
            <p>Total Tracks</p>
          </div>
          <div class="stat-card">
            <h3>{jobs.filter(j => j.status === 'success').length}/{jobs.length}</h3>
            <p>Successful Runs</p>
          </div>
          <div class="stat-card">
            <h3>{cacheStats.total}</h3>
            <p>Cached Artists</p>
          </div>
        </div>

        {/* Your Playlists */}
        <section>
          <div class="flex-between mb-normal">
            <h3>Your Playlists</h3>
            <a href="/playlists" class="text-sm">View All →</a>
          </div>
          {playlists.length === 0 ? (
            <p class="text-muted">
              No playlists generated yet.
              {' '}<a href="/setup">Run setup wizard</a>{' '}to get started.
            </p>
          ) : (
            <>
              {/* Daily Playlists */}
              {dailyPlaylists.length > 0 && (
                <div class="mb-section">
                  <h4 class="text-sm text-muted mb-normal" style="text-transform: uppercase;">
                    Daily Playlists
                  </h4>
                  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
                    {dailyPlaylists.map(p => (
                      <a href={`/playlists/${p.id}`} style="text-decoration: none; color: inherit;">
                        <article>
                          <div class="mb-normal">
                            <strong>{p.title || p.window}</strong>
                          </div>
                          <p class="text-muted text-sm">
                            {p.trackCount} tracks • {timeAgo(p.generatedAt)}
                          </p>
                        </article>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom & Special Playlists */}
              {genrePlaylists.length > 0 && (
                <div>
                  <h4 class="text-sm text-muted mb-normal" style="text-transform: uppercase;">
                    Custom & Special Playlists ({genrePlaylists.length})
                  </h4>
                  <div class="grid-dense" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
                    {genrePlaylists.slice(0, 8).map(p => (
                      <a href={`/playlists/${p.id}`} class="text-sm" style="text-decoration: none; color: inherit;">
                        <div class="row-item">
                          {p.title || p.window}
                          <span class="text-muted"> • {p.trackCount}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                  {genrePlaylists.length > 8 && (
                    <p class="mt-section" style="text-align: center;">
                      <a href="/playlists" class="text-sm">
                        View all {genrePlaylists.length} playlists →
                      </a>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Recent Activity */}
        <section>
          <div class="flex-between mb-normal">
            <h3>Recent Activity</h3>
            <a href="/actions/history" class="text-sm">View Full History →</a>
          </div>
          {jobs.length === 0 ? (
            <p class="text-muted">No job history yet.</p>
          ) : (
            <>
              {/* Most Recent Error (if exists) */}
              {mostRecentError && (
                <div style="background: var(--pico-card-background-color); padding: var(--spacing-normal); border-radius: 0.5rem; border-left: 4px solid var(--pico-del-color); margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: start; gap: var(--spacing-compact);">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                        <strong style="color: var(--pico-del-color); font-size: 0.95rem;">⚠️ {mostRecentError.window}</strong>
                        <span class="status-badge status-failed" style="font-size: 0.7rem;">failed</span>
                      </div>
                      <div style="color: var(--pico-muted-color); font-size: 0.85rem;">
                        {timeAgo(mostRecentError.startedAt)}
                      </div>
                      {mostRecentError.error && (
                        <div style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--pico-muted-color); font-family: monospace; background: var(--pico-background-color); padding: 0.5rem; border-radius: 0.25rem;">
                          {mostRecentError.error.length > 120 ? mostRecentError.error.substring(0, 120) + '...' : mostRecentError.error}
                        </div>
                      )}
                    </div>
                    <form method="POST" action={`/actions/generate/${mostRecentError.window}`} style="margin: 0;">
                      <button type="submit" class="action-btn secondary" style="margin: 0; white-space: nowrap;" title="Retry playlist generation">
                        🔄 Retry
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Recent Jobs Table (max 5 items) */}
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
                  {jobs.slice(0, 5).map(job => {
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
            </>
          )}
        </section>

        {/* Cache Stats */}
        <section>
          <h3>Genre Cache</h3>
          <div class="grid-auto">
            {Object.entries(cacheStats.bySource).map(([source, count]) => (
              <div class="stat-card">
                <h3>{count}</h3>
                <p>{source}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h3>Quick Actions</h3>
          <div class="flex-gap" style="display: flex; flex-wrap: wrap;">
            <a href="/playlists" role="button" style="margin: 0;">View All Playlists</a>
            <a href="/actions" role="button" class="secondary" style="margin: 0;">Generate Playlists</a>
            <a href="/actions/cache" role="button" class="secondary" style="margin: 0;">Manage Cache</a>
            <a href="/config" role="button" class="outline" style="margin: 0;">Configuration</a>
          </div>
        </section>
      </div>
    </Layout>
  );
}
