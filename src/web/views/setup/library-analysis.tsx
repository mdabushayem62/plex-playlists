/**
 * Setup Wizard - Library Analysis Page
 * Consolidates cache warming, genre discovery, and API key configuration
 */

import Html from '@kitajs/html';
import { SetupLayout } from '../setup-layout.tsx';

interface SetupStep {
  id: string;
  title: string;
  path: string;
}

interface CacheStats {
  total: number;
  bySource: Record<string, number>;
}

interface GenreInfo {
  genre: string;
  count: number;
}

interface ImportResults {
  totalTracks: number;
  matchedTracks: number;
  ratingsSet: number;
  skippedExisting?: number;
  errorCount?: number;
}

interface ApiKeysConfigured {
  lastfm: boolean;
  spotify: boolean;
}

export interface LibraryAnalysisPageProps {
  step: string;
  steps: readonly SetupStep[];
  currentStepIndex: number;
  state: unknown;
  cacheStats: CacheStats;
  topGenres: GenreInfo[];
  totalGenres: number;
  importResults: ImportResults | null;
  apiKeysConfigured: ApiKeysConfigured;
}

export function LibraryAnalysisPage(props: LibraryAnalysisPageProps): JSX.Element {
  const { steps, currentStepIndex, cacheStats, topGenres, totalGenres, importResults, apiKeysConfigured } = props;

  return (
    <SetupLayout title="Library Analysis" steps={steps} currentStepIndex={currentStepIndex}>
      <div class="step-content">
        <h2>Library Analysis &amp; Enhancement</h2>
        <p>
          This step enriches your music library with genre metadata, which dramatically improves playlist quality.
          All steps below are <strong>optional</strong> but highly recommended for the best experience.
        </p>

        <div style="background: var(--pico-primary); padding: 1rem; border-radius: 0.5rem; margin-bottom: 2rem;">
          <p style="margin: 0; font-size: 0.875rem;">
            💡 <strong>Quick Summary:</strong> The system can work with just Plex data, but adding API keys and warming the cache will give you much better genre-based playlists and filtering.
          </p>
        </div>

        {importResults && (
          <details open style="margin-bottom: 2rem;">
            <summary style="cursor: pointer;"><strong>📥 Import Results</strong></summary>
            <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                <div>
                  <div style="font-size: 1.5rem; font-weight: 600;">{importResults.totalTracks || 0}</div>
                  <div style="color: var(--pico-muted-color); font-size: 0.875rem;">Total Tracks</div>
                </div>
                <div>
                  <div style="font-size: 1.5rem; font-weight: 600;">{importResults.matchedTracks || 0}</div>
                  <div style="color: var(--pico-muted-color); font-size: 0.875rem;">Matched</div>
                </div>
                <div>
                  <div style="font-size: 1.5rem; font-weight: 600;">{importResults.ratingsSet || 0}</div>
                  <div style="color: var(--pico-muted-color); font-size: 0.875rem;">Ratings Set</div>
                </div>
              </div>
            </div>
          </details>
        )}

        {/* Cache Status */}
        <details open style="margin-bottom: 2rem;">
          <summary style="cursor: pointer;"><strong>💾 Genre Cache Status</strong></summary>
          <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
              <div>
                <div style="font-size: 1.5rem; font-weight: 600;">{cacheStats.total}</div>
                <div style="color: var(--pico-muted-color); font-size: 0.875rem;">Total Cached</div>
              </div>
              {Object.entries(cacheStats.bySource).map(([source, count]) => (
                <div>
                  <div style="font-size: 1.5rem; font-weight: 600;">{count}</div>
                  <div style="color: var(--pico-muted-color); font-size: 0.875rem;">{source}</div>
                </div>
              ))}
            </div>

            <button
              id="warmCacheBtn"
              class="secondary"
              style="width: 100%;"
              onclick="warmCache()"
            >
              🔥 Warm Cache Now
            </button>
            <div id="cache-status" style="margin-top: 0.5rem;"></div>
            <p style="margin: 1rem 0 0 0; font-size: 0.875rem; color: var(--pico-muted-color);">
              Genre cache improves playlist quality by fetching metadata from Spotify and Last.fm. This is optional but recommended.
            </p>
          </div>
        </details>

        {/* Genre Discovery */}
        {topGenres && topGenres.length > 0 ? (
          <details open style="margin-bottom: 2rem;">
            <summary style="cursor: pointer;"><strong>🎵 Genre Discovery ({totalGenres} genres found)</strong></summary>
            <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                {topGenres.map(g => {
                  const fontSize = 0.75 + (g.count / topGenres[0].count) * 0.5;
                  return (
                    <span style={`font-size: ${fontSize}rem; padding: 0.25rem 0.5rem; background: var(--pico-card-background-color); border-radius: 0.25rem; border: 1px solid var(--pico-muted-border-color);`}>
                      {g.genre} <small style="color: var(--pico-muted-color);">({g.count})</small>
                    </span>
                  );
                })}
              </div>
              {totalGenres > 30 && (
                <p style="margin-top: 1rem; margin-bottom: 0; font-size: 0.875rem; color: var(--pico-muted-color);">
                  Showing top 30 of {totalGenres} genres
                </p>
              )}
            </div>
          </details>
        ) : (
          <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem; margin-bottom: 2rem;">
            <p style="margin: 0; color: var(--pico-muted-color);">
              ⚠️ No genres found yet. Add API keys below and warm the cache to discover genres.
            </p>
          </div>
        )}

        {/* API Keys Configuration */}
        <details {...(!apiKeysConfigured.lastfm && !apiKeysConfigured.spotify ? { open: true } : {})} style="margin-bottom: 2rem;">
          <summary style="cursor: pointer;"><strong>🔑 API Keys (Optional but Recommended)</strong></summary>
          <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
            <p style="margin: 0 0 1rem 0; color: var(--pico-muted-color); font-size: 0.875rem;">
              Add API keys for enhanced genre metadata. This significantly improves playlist quality.
              Setup guides:
              {' '}<a href="https://github.com/aceofaces/plex-playlists/blob/main/LASTFM_SETUP.md" target="_blank">Last.fm</a> •
              {' '}<a href="https://github.com/aceofaces/plex-playlists/blob/main/SPOTIFY_SETUP.md" target="_blank">Spotify</a>
            </p>

            <form id="apiKeysForm" hx-post="/config/environment/save-api-keys" hx-swap="innerHTML" hx-target="#api-save-response">
              <label>
                Last.fm API Key
                <input
                  type="text"
                  name="lastfmApiKey"
                  placeholder={apiKeysConfigured.lastfm ? '(currently set - leave blank to keep)' : 'Enter API key (optional)'}
                />
                <small>
                  {apiKeysConfigured.lastfm
                    ? <span style="color: var(--pico-ins-color);">✓ Currently configured</span>
                    : <span style="color: var(--pico-muted-color);">Not configured</span>}
                </small>
              </label>

              <label>
                Spotify Client ID
                <input
                  type="text"
                  name="spotifyClientId"
                  placeholder={apiKeysConfigured.spotify ? '(currently set - leave blank to keep)' : 'Enter client ID (optional)'}
                />
                <small>
                  {apiKeysConfigured.spotify
                    ? <span style="color: var(--pico-ins-color);">✓ Currently configured</span>
                    : <span style="color: var(--pico-muted-color);">Not configured</span>}
                </small>
              </label>

              <label>
                Spotify Client Secret
                <input
                  type="password"
                  name="spotifyClientSecret"
                  placeholder={apiKeysConfigured.spotify ? '(currently set - leave blank to keep)' : 'Enter client secret (optional)'}
                />
              </label>

              <button type="submit" class="secondary">Save API Keys</button>
            </form>

            <div id="api-save-response" style="margin-top: 1rem;"></div>
          </div>
        </details>
      </div>

      <div class="button-group">
        <form method="POST" action="/setup/library-analysis/back">
          <button type="submit" class="secondary">← Back</button>
        </form>
        <form method="POST" action="/setup/library-analysis/next">
          <button type="submit">Continue →</button>
        </form>
      </div>

      <script>{`
// Cache warming function
async function warmCache() {
  const btn = document.getElementById('warmCacheBtn');
  const status = document.getElementById('cache-status');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Starting...';
  status.innerHTML = '<p style="color: var(--pico-muted-color); margin: 0;">Warming cache for all artists in your library...</p>';

  try {
    const response = await fetch('/actions/cache/warm', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      btn.innerHTML = '✓ Started';
      status.innerHTML = '<p style="color: var(--pico-ins-color); margin: 0;">✓ Cache warming started! This may take several minutes.</p>';

      // Start monitoring via SSE if jobId is available
      if (data.jobId) {
        const eventSource = new EventSource(\`/actions/jobs/\${data.jobId}/stream\`);

        eventSource.onmessage = (event) => {
          const job = JSON.parse(event.data);

          if (job.progress !== undefined) {
            status.innerHTML = \`<p style="color: var(--pico-primary); margin: 0;">⏳ Progress: \${job.progress}%</p>\`;
          }

          if (job.status !== 'running') {
            eventSource.close();
            if (job.status === 'success') {
              status.innerHTML = '<p style="color: var(--pico-ins-color); margin: 0;">✓ Cache warming complete! Reloading...</p>';
              setTimeout(() => window.location.reload(), 2000);
            } else {
              status.innerHTML = '<p style="color: var(--pico-del-color); margin: 0;">✗ Cache warming failed</p>';
              btn.disabled = false;
              btn.innerHTML = originalText;
            }
          }
        };

        eventSource.onerror = () => {
          console.error('SSE connection error');
          eventSource.close();
        };
      }
    } else {
      throw new Error(data.error || 'Failed to start cache warming');
    }
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    btn.disabled = false;
    status.innerHTML = \`<p style="color: var(--pico-del-color); margin: 0;">✗ \${err.message}</p>\`;
    setTimeout(() => {
      btn.innerHTML = originalText;
      status.innerHTML = '';
    }, 3000);
  }
}

// Handle API keys form submission
document.body.addEventListener('htmx:afterSwap', function(event) {
  if (event.detail.target.id === 'api-save-response') {
    try {
      const response = JSON.parse(event.detail.xhr.responseText);
      if (response.success) {
        event.detail.target.innerHTML = '<p style="color: var(--pico-ins-color); margin: 0;">✓ API keys saved! Reloading...</p>';
        setTimeout(() => window.location.reload(), 1500);
      } else if (response.error) {
        event.detail.target.innerHTML = \`<p style="color: var(--pico-del-color); margin: 0;">✗ \${response.error}</p>\`;
      }
    } catch (e) {
      event.detail.target.innerHTML = '<p style="color: var(--pico-del-color); margin: 0;">✗ Error saving API keys</p>';
    }
  }
});
      `}</script>
    </SetupLayout>
  );
}
