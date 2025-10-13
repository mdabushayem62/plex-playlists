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

  // Calculate health metrics
  const recentJobs = jobs.slice(0, 10);
  const successRate = jobs.length > 0
    ? Math.round((jobs.filter(j => j.status === 'success').length / jobs.length) * 100)
    : 100;
  const cacheHealthPercent = cacheStats.total > 0
    ? Math.round(((cacheStats.total - cacheStats.expired) / cacheStats.total) * 100)
    : 0;

  // Get critical alerts (failed jobs in last 24 hours)
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const criticalAlerts = jobs.filter(j =>
    j.status === 'failed' && new Date(j.startedAt).getTime() > oneDayAgo
  ).slice(0, 2);

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

        {/* System Health Overview */}
        <section>
          <h3>System Health</h3>
          <div class="grid-auto-wide">
            <div class="stat-card">
              <h3>{playlists.length}</h3>
              <p>Total Playlists</p>
              <small class="text-muted text-sm">
                {dailyPlaylists.length} daily, {genrePlaylists.length} custom
              </small>
            </div>
            <div class="stat-card">
              <h3 style={successRate >= 90 ? 'color: var(--pico-ins-color)' : successRate >= 70 ? 'color: #ff9800' : 'color: var(--pico-del-color)'}>{successRate}%</h3>
              <p>Success Rate</p>
              <small class="text-muted text-sm">
                {jobs.filter(j => j.status === 'success').length} / {jobs.length} runs
              </small>
            </div>
            <div class="stat-card">
              <h3 style={cacheHealthPercent >= 90 ? 'color: var(--pico-ins-color)' : cacheHealthPercent >= 70 ? 'color: #ff9800' : 'color: var(--pico-del-color)'}>{cacheHealthPercent}%</h3>
              <p>Cache Health</p>
              <small class="text-muted text-sm">
                {cacheStats.total - cacheStats.expired} / {cacheStats.total} valid
              </small>
            </div>
            <div class="stat-card">
              <h3>{playlists.reduce((sum, p) => sum + p.trackCount, 0)}</h3>
              <p>Total Tracks</p>
              <small class="text-muted text-sm">
                <a href="/playlists" style="font-size: 0.75rem;">View all →</a>
              </small>
            </div>
          </div>
        </section>

        {/* Critical Alerts */}
        {criticalAlerts.length > 0 && (
          <section>
            <h3>⚠️ Critical Alerts</h3>
            {criticalAlerts.map(job => (
              <div style="background: var(--pico-card-background-color); padding: var(--spacing-normal); border-radius: 0.5rem; border-left: 4px solid var(--pico-del-color); margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: var(--spacing-compact);">
                  <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                      <strong style="color: var(--pico-del-color); font-size: 0.95rem;">⚠️ {job.window}</strong>
                      <span class="status-badge status-failed" style="font-size: 0.7rem;">failed</span>
                    </div>
                    <div style="color: var(--pico-muted-color); font-size: 0.85rem;">
                      {timeAgo(job.startedAt)}
                    </div>
                    {job.error && (
                      <div style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--pico-muted-color); font-family: monospace; background: var(--pico-background-color); padding: 0.5rem; border-radius: 0.25rem;">
                        {job.error.length > 120 ? job.error.substring(0, 120) + '...' : job.error}
                      </div>
                    )}
                  </div>
                  <form method="POST" action={`/actions/generate/${job.window}`} style="margin: 0;">
                    <button type="submit" class="action-btn secondary" style="margin: 0; white-space: nowrap;" title="Retry playlist generation">
                      🔄 Retry
                    </button>
                  </form>
                </div>
              </div>
            ))}
            <p style="text-align: center; margin-top: 1rem;">
              <a href="/actions/history" class="text-sm">View full history →</a>
            </p>
          </section>
        )}

        {/* All Green - No Alerts */}
        {criticalAlerts.length === 0 && jobs.length > 0 && (
          <section>
            <div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; text-align: center; border-left: 4px solid var(--pico-ins-color);">
              <h3 style="margin: 0 0 0.5rem 0; color: var(--pico-ins-color);">✓ All Systems Operational</h3>
              <p style="color: var(--pico-muted-color); margin: 0;">
                No failed jobs in the last 24 hours. Everything is running smoothly!
              </p>
              <p style="margin-top: 0.75rem;">
                <a href="/actions/history" class="text-sm">View job history →</a>
              </p>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
