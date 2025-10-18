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
  activeJobs: JobRun[];
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

/**
 * Dashboard content only (for HTMX partial rendering)
 */
export function DashboardContent(props: Omit<DashboardPageProps, 'page' | 'setupComplete'>) {
  const {
    playlists,
    dailyPlaylists,
    genrePlaylists,
    jobs,
    activeJobs,
    cacheStats
  } = props;

  // Calculate health metrics
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

  const recentJobs = jobs.slice(0, 5); // Show 5 most recent jobs
  const recentPlaylists = [...playlists]
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, 3); // Show 3 most recent playlists

  return (
    <div>
        <div class="flex-between mb-5" style="align-items: center;">
          <h2 style="margin: 0;">Dashboard</h2>
          <div style="display: flex; gap: 0.75rem;">
            <a href="/playlists/builder" role="button" class="secondary" style="margin: 0; padding: 0.5rem 1rem;">
              🎨 Create Playlist
            </a>
            <a href="/config" role="button" class="outline" style="margin: 0; padding: 0.5rem 1rem;">
              ⚙️ Settings
            </a>
          </div>
        </div>

        {/* System Health Overview */}
        <section style="margin-bottom: 2rem;">
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
              <small class="text-muted text-xs">
                {jobs.filter(j => j.status === 'success').length} / {jobs.length} runs
              </small>
            </div>
            <div class="stat-card">
              <h3 style={cacheHealthPercent >= 90 ? 'color: var(--pico-ins-color)' : cacheHealthPercent >= 70 ? 'color: #ff9800' : 'color: var(--pico-del-color)'}>{cacheHealthPercent}%</h3>
              <p>Cache Health</p>
              <small class="text-muted text-xs">
                {cacheStats.total - cacheStats.expired} / {cacheStats.total} valid
              </small>
            </div>
            <div class="stat-card">
              <h3>{playlists.reduce((sum, p) => sum + p.trackCount, 0)}</h3>
              <p>Total Tracks</p>
              <small class="text-muted text-xs">
                <a href="/playlists" class="text-xs">View all →</a>
              </small>
            </div>
          </div>
        </section>

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <section style="margin-bottom: 2rem;">
            <h3>⚡ Active Jobs</h3>
            <p class="text-muted mb-4">
              Currently running playlist generation jobs. Updates stream in real-time.
            </p>
            {activeJobs.map(job => (
              <div id={'job-' + job.id} class="card p-4 rounded-lg mb-4">
                <div class="flex-between">
                  <div>
                    <h4 class="m-0">{job.window}</h4>
                    <p class="text-muted-sm m-0">Started {timeAgo(job.startedAt)}</p>
                  </div>
                  <span class={'status-badge status-' + job.status}>
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Critical Alerts */}
        {criticalAlerts.length > 0 && (
          <section style="margin-bottom: 2rem;">
            <h3>⚠️ Critical Alerts</h3>
            {criticalAlerts.map(job => (
              <div class="card-dense rounded-lg border-left-error mb-3">
                <div class="flex-between gap-1" style="align-items: start;">
                  <div class="flex-1">
                    <div class="flex-center gap-3 mb-1">
                      <strong style="color: var(--pico-del-color); font-size: 0.95rem;">⚠️ {job.window}</strong>
                      <span class="status-badge status-failed" style="font-size: 0.7rem;">failed</span>
                    </div>
                    <div class="text-muted-sm">
                      {timeAgo(job.startedAt)}
                    </div>
                    {job.error && (
                      <div class="text-muted-sm mt-3 p-3 rounded" style="font-family: monospace; background: var(--pico-background-color);">
                        {job.error.length > 120 ? job.error.substring(0, 120) + '...' : job.error}
                      </div>
                    )}
                  </div>
                  <form method="POST" action={`/actions/generate/${job.window}`} class="m-0">
                    <button type="submit" class="action-btn secondary m-0" style="white-space: nowrap;" title="Retry playlist generation">
                      🔄 Retry
                    </button>
                  </form>
                </div>
              </div>
            ))}
            <p class="text-center mt-5">
              <a href="/analytics" class="text-sm">View full history →</a>
            </p>
          </section>
        )}

        {/* All Green - No Alerts */}
        {criticalAlerts.length === 0 && jobs.length > 0 && (
          <section style="margin-bottom: 2rem;">
            <div class="card p-6 rounded-lg text-center border-left-success">
              <h3 class="m-0 mb-3" style="color: var(--pico-ins-color);">✓ All Systems Operational</h3>
              <p class="text-muted m-0">
                No failed jobs in the last 24 hours. Everything is running smoothly!
              </p>
            </div>
          </section>
        )}

        {/* Recently Generated Playlists */}
        {recentPlaylists.length > 0 && (
          <section style="margin-bottom: 2rem;">
            <div class="flex-between mb-4">
              <h3 style="margin: 0;">Recently Generated</h3>
              <a href="/playlists" class="text-sm">View all playlists →</a>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
              {recentPlaylists.map(playlist => (
                <article class="m-0">
                  <header>
                    <h4 class="m-0">
                      <a href={`/playlists/${playlist.id}`} style="text-decoration: none; color: inherit;">
                        {playlist.title || playlist.window}
                      </a>
                    </h4>
                  </header>
                  <div style="padding: 0.75rem 0;">
                    <p class="text-muted-sm mb-1">
                      <strong>{playlist.trackCount}</strong> tracks
                    </p>
                    <p class="text-muted-sm mb-1">
                      Updated {timeAgo(playlist.generatedAt)}
                    </p>
                  </div>
                  <footer style="border-top: 1px solid var(--pico-muted-border-color); padding-top: 0.75rem;">
                    <a href={`/playlists/${playlist.id}`} role="button" class="secondary m-0" style="width: 100%; text-align: center;">
                      View Tracks
                    </a>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Recent Activity */}
        {recentJobs.length > 0 && (
          <section style="margin-bottom: 2rem;">
            <div class="flex-between mb-4">
              <h3 style="margin: 0;">Recent Activity</h3>
              <a href="/actions/history" class="text-sm">View full history →</a>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Playlist</th>
                  <th>Status</th>
                  <th>When</th>
                  <th class="text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => (
                  <tr>
                    <td>
                      <a href={`/playlists?search=${job.window}`}>
                        {job.window}
                      </a>
                    </td>
                    <td>
                      <span class={`status-badge status-${job.status}`} style="font-size: 0.75rem;">
                        {job.status}
                      </span>
                    </td>
                    <td class="text-muted-sm">{timeAgo(job.startedAt)}</td>
                    <td class="text-right text-muted-sm">
                      {job.finishedAt
                        ? `${Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

      {/* Job monitoring scripts */}
      {activeJobs.length > 0 && (
        <>
          <script src="/js/job-monitor.js"></script>
          <script>{`
            // Monitor active jobs on page load
            const activeJobIds = ${JSON.stringify(activeJobs.map(j => j.id))};
            const jobEventSources = new Map();

            // Monitor each active job via SSE
            activeJobIds.forEach(jobId => {
              const eventSource = new EventSource('/actions/jobs/' + jobId + '/stream');
              jobEventSources.set(jobId, eventSource);

              eventSource.onmessage = (event) => {
                const job = JSON.parse(event.data);
                updateJobDisplay(jobId, job);

                // If job is complete, reload page after a delay
                if (job.status !== 'running') {
                  setTimeout(() => {
                    eventSource.close();
                    jobEventSources.delete(jobId);

                    // Reload if all jobs are complete
                    if (jobEventSources.size === 0) {
                      window.location.reload();
                    }
                  }, 2000);
                }
              };

              eventSource.onerror = () => {
                console.error('SSE connection error for job', jobId);
                eventSource.close();
                jobEventSources.delete(jobId);
              };
            });

            // Update job display in real-time
            function updateJobDisplay(jobId, job) {
              const jobElement = document.getElementById('job-' + jobId);
              if (!jobElement) return;

              const statusBadge = jobElement.querySelector('.status-badge');
              if (statusBadge) {
                statusBadge.className = 'status-badge status-' + job.status;
                statusBadge.textContent = job.status;
              }

              // Add progress indicator if available
              if (job.progress !== undefined) {
                let progressBar = jobElement.querySelector('.progress-bar');
                if (!progressBar) {
                  progressBar = document.createElement('div');
                  progressBar.className = 'progress-bar';
                  progressBar.style.cssText = 'background: var(--pico-muted-border-color); height: 4px; border-radius: 2px; margin-top: 0.5rem; overflow: hidden;';
                  progressBar.innerHTML = '<div class="progress-fill" style="background: var(--pico-primary); height: 100%; transition: width 0.3s;"></div>';
                  jobElement.appendChild(progressBar);
                }

                const progressFill = progressBar.querySelector('.progress-fill');
                if (progressFill) {
                  progressFill.style.width = job.progress + '%';
                }
              }
            }

            // Clean up event sources on page unload
            window.addEventListener('beforeunload', () => {
              jobEventSources.forEach(es => es.close());
            });
          `}</script>
        </>
      )}
      </div>
  );
}

/**
 * Full dashboard page with layout (for regular requests)
 */
export function DashboardPage(props: DashboardPageProps) {
  const { setupComplete, page, ...contentProps } = props;

  return (
    <Layout title="Dashboard" page={page} setupComplete={setupComplete}>
      <div>
        {/* Setup Wizard Banner */}
        {!setupComplete && (
          <div class="card-dense rounded-lg mb-4 border-left-primary">
            <h3 class="m-0 mb-3" style="font-size: 1.1rem;">👋 Welcome! Let's get you set up</h3>
            <p class="m-0 mb-4" style="font-size: 0.9rem;">
              Run the setup wizard to configure your playlist generator and learn about all the features.
            </p>
            <a href="/setup" role="button" class="m-0">Start Setup Wizard →</a>
          </div>
        )}

        <DashboardContent {...contentProps} />
      </div>
    </Layout>
  );
}
