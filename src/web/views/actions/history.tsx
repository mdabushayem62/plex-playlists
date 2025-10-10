/**
 * Job History Page - TSX version
 * Shows complete history of all playlist generation and maintenance jobs
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface JobRun {
  id: number;
  window: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

interface Playlist {
  id: number;
  window: string;
}

interface Stats {
  total: number;
  success: number;
  failed: number;
  running: number;
}

interface Filters {
  window?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface Breadcrumb {
  label: string;
  url: string | null;
}

export interface HistoryPageProps {
  jobs: JobRun[];
  playlistsByWindow: Map<string, Playlist>;
  stats: Stats;
  filters: Filters;
  uniqueWindows: string[];
  uniqueStatuses: string[];
  pagination: Pagination;
  setupComplete: boolean;
  page: string;
  breadcrumbs?: Breadcrumb[];
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString();
}

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return '-';
  const duration = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (duration < 60) return duration + 's';
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}m ${seconds}s`;
}

function buildFilterUrl(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  if (filters.window) params.set('window', filters.window);
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  params.set('page', page.toString());
  return '?' + params.toString();
}

export function HistoryPage(props: HistoryPageProps): JSX.Element {
  const {
    jobs,
    playlistsByWindow,
    stats,
    filters,
    uniqueWindows,
    uniqueStatuses,
    pagination,
    setupComplete,
    page,
    breadcrumbs
  } = props;

  return (
    <Layout title="Job History" page={page} setupComplete={setupComplete}>
      <div>
        {/* Breadcrumbs */}
        {breadcrumbs && (
          <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
            <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
              {breadcrumbs.map((crumb, idx) => (
                <>
                  {idx > 0 && <li>›</li>}
                  <li>
                    {crumb.url ? (
                      <a href={crumb.url}>{crumb.label}</a>
                    ) : (
                      <span style="color: var(--pico-contrast);">{crumb.label}</span>
                    )}
                  </li>
                </>
              ))}
            </ol>
          </nav>
        )}

        <h2>Job History</h2>
        <p style="color: var(--pico-muted-color);">
          Complete history of all playlist generation and maintenance jobs.
        </p>

        {/* Stats */}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin: 2rem 0;">
          <div class="stat-card">
            <h3>{stats.total}</h3>
            <p>Total Jobs</p>
          </div>
          <div class="stat-card">
            <h3>{stats.success}</h3>
            <p>Successful</p>
            <small style="color: var(--pico-ins-color);">
              {stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}%
            </small>
          </div>
          <div class="stat-card">
            <h3>{stats.failed}</h3>
            <p>Failed</p>
            <small style="color: var(--pico-del-color);">
              {stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0}%
            </small>
          </div>
          <div class="stat-card">
            <h3>{stats.running}</h3>
            <p>Running</p>
          </div>
        </div>

        {/* Job Management */}
        <section style="margin-bottom: 2rem; background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem;">
          <h3 style="margin: 0 0 1rem 0;">Job Management</h3>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
            {/* Cancel Running Jobs Button */}
            {stats.running > 0 && (
              <button
                onclick="confirmCancelRunning()"
                class="secondary"
                style="margin: 0;"
              >
                ⏹️ Cancel Running Jobs ({stats.running})
              </button>
            )}

            {/* Clear History Dropdown */}
            <details class="dropdown" style="margin: 0;">
              <summary role="button" class="secondary" style="margin: 0;">
                🗑️ Clear History
              </summary>
              <ul>
                <li><a href="#" onclick="confirmClearHistory('old'); return false;">Clear Old (30+ days)</a></li>
                <li><a href="#" onclick="confirmClearHistory('failed'); return false;">Clear Failed Jobs</a></li>
                <li><a href="#" onclick="confirmClearHistory('all'); return false;" style="color: var(--pico-del-color);">Clear All History</a></li>
              </ul>
            </details>

            <div id="management-result" style="flex: 1; min-width: 200px;"></div>
          </div>
        </section>

        {/* Filters */}
        <form method="GET" action="/actions/history" style="margin-bottom: 2rem;">
          <details open>
            <summary>Filters</summary>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
              <label>
                Window
                <select name="window">
                  <option value="">All Windows</option>
                  {uniqueWindows.map(w => (
                    <option value={w} selected={filters.window === w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select name="status">
                  <option value="">All Statuses</option>
                  {uniqueStatuses.map(s => (
                    <option value={s} selected={filters.status === s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                From Date
                <input
                  type="date"
                  name="dateFrom"
                  value={filters.dateFrom || ''}
                />
              </label>

              <label>
                To Date
                <input
                  type="date"
                  name="dateTo"
                  value={filters.dateTo || ''}
                />
              </label>
            </div>

            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
              <button type="submit">Apply Filters</button>
              <a href="/actions/history" role="button" class="secondary">Clear Filters</a>
            </div>
          </details>
        </form>

        {/* Results Table */}
        {jobs.length === 0 ? (
          <p style="color: var(--pico-muted-color); text-align: center; padding: 2rem;">
            No jobs found matching the selected filters.
          </p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Error</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const playlist = playlistsByWindow.get(job.window);
                  return (
                    <tr>
                      <td>
                        {playlist ? (
                          <a href={`/playlists/${playlist.id}`}>{job.window}</a>
                        ) : job.window}
                      </td>
                      <td>
                        <span class={`status-badge status-${job.status}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>
                        <span title={formatDate(job.startedAt)}>{timeAgo(job.startedAt)}</span>
                      </td>
                      <td>{formatDuration(job.startedAt, job.finishedAt)}</td>
                      <td style="max-width: 300px;">
                        {job.error ? (
                          <details>
                            <summary style="color: var(--pico-del-color); cursor: pointer; font-size: 0.875rem;">
                              View error
                            </summary>
                            <pre style="margin-top: 0.5rem; padding: 0.5rem; background: var(--pico-background-color); border-radius: 0.25rem; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap;">{job.error}</pre>
                          </details>
                        ) : '-'}
                      </td>
                      <td style="text-align: right;">
                        {job.status === 'failed' ? (
                          <form method="POST" action={`/actions/generate/${job.window}`} style="display: inline; margin: 0;">
                            <button type="submit" class="secondary" style="margin: 0; font-size: 0.875rem; padding: 0.25rem 0.75rem;" title="Retry playlist generation">
                              🔄 Retry
                            </button>
                          </form>
                        ) : playlist && job.status === 'success' ? (
                          <a href={`/playlists/${playlist.id}`} style="font-size: 0.875rem;">View Playlist →</a>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {(pagination.hasPrevPage || pagination.hasNextPage) && (
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem;">
                <div>
                  {pagination.hasPrevPage && (
                    <a href={buildFilterUrl(filters, pagination.page - 1)} role="button" class="secondary">
                      ← Previous
                    </a>
                  )}
                </div>
                <div style="color: var(--pico-muted-color);">
                  Page {pagination.page}
                </div>
                <div>
                  {pagination.hasNextPage && (
                    <a href={buildFilterUrl(filters, pagination.page + 1)} role="button" class="secondary">
                      Next →
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Client-side JavaScript for job management */}
        <script>{`
          function confirmClearHistory(clearType) {
            const messages = {
              'old': 'Clear all job history older than 30 days?',
              'failed': 'Clear all failed jobs from history?',
              'all': 'Clear ALL job history? This cannot be undone!'
            };

            if (confirm(messages[clearType])) {
              clearHistory(clearType);
            }
          }

          async function clearHistory(clearType) {
            const resultDiv = document.getElementById('management-result');
            resultDiv.innerHTML = '<small style="color: var(--pico-muted-color);">Clearing history...</small>';

            try {
              const response = await fetch('/actions/history/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clearType })
              });

              const result = await response.json();

              if (result.success) {
                resultDiv.innerHTML = '<small style="color: var(--pico-ins-color);">✓ Cleared ' + result.deleted + ' job(s)</small>';
                setTimeout(() => window.location.reload(), 1500);
              } else {
                resultDiv.innerHTML = '<small style="color: var(--pico-del-color);">✗ Error: ' + (result.error || 'Unknown error') + '</small>';
              }
            } catch (error) {
              resultDiv.innerHTML = '<small style="color: var(--pico-del-color);">✗ Network error</small>';
            }
          }

          function confirmCancelRunning() {
            if (confirm('Cancel all running jobs? They will be marked as cancelled.')) {
              cancelRunningJobs();
            }
          }

          async function cancelRunningJobs() {
            const resultDiv = document.getElementById('management-result');
            resultDiv.innerHTML = '<small style="color: var(--pico-muted-color);">Cancelling jobs...</small>';

            try {
              const response = await fetch('/actions/history/cancel-running', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });

              const result = await response.json();

              if (result.success) {
                resultDiv.innerHTML = '<small style="color: var(--pico-ins-color);">✓ Cancelled ' + result.cancelled + ' job(s)</small>';
                setTimeout(() => window.location.reload(), 1500);
              } else {
                resultDiv.innerHTML = '<small style="color: var(--pico-del-color);">✗ Error: ' + (result.error || 'Unknown error') + '</small>';
              }
            } catch (error) {
              resultDiv.innerHTML = '<small style="color: var(--pico-del-color);">✗ Network error</small>';
            }
          }
        `}</script>
      </div>
    </Layout>
  );
}
