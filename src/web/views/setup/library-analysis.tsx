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

        <div style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 2rem; border-left: 4px solid var(--pico-primary);">
          <p style="margin: 0; font-size: 0.875rem;">
            💡 <strong>Recommended Flow:</strong> Start by analyzing your Plex library to see available genres, then optionally add API keys for enhanced metadata.
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

        {/* Step 1: Analyze Plex Library */}
        <details open style="margin-bottom: 2rem;">
          <summary style="cursor: pointer;"><strong>1️⃣ Analyze Your Plex Library</strong></summary>
          <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
            <p style="margin: 0 0 1rem 0; font-size: 0.875rem; color: var(--pico-muted-color);">
              Start by pulling genre data from your Plex library to see what's available. This uses Plex's built-in genre tags.
            </p>
            <button
              id="analyzeLibraryBtn"
              style="width: 100%;"
              onclick="analyzeLibrary()"
            >
              🔍 Analyze Library & Pull Genres
            </button>
            <div id="analyze-status" style="margin-top: 0.5rem;"></div>

            {/* Show genres if we have them */}
            {topGenres && topGenres.length > 0 && (
              <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--pico-muted-border-color);">
                <h4 style="margin: 0 0 1rem 0; font-size: 0.9375rem;">Genres Found ({totalGenres} total)</h4>
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
            )}
          </div>
        </details>

        {/* Step 2: API Keys (Optional Enhancement) */}
        <details {...(totalGenres === 0 || (!apiKeysConfigured.lastfm && !apiKeysConfigured.spotify) ? { open: true } : {})} style="margin-bottom: 2rem;">
          <summary style="cursor: pointer;"><strong>2️⃣ Add API Keys (Optional Enhancement)</strong></summary>
          <div style="padding: 1rem; background: var(--pico-background-color); border-radius: 0.25rem; margin-top: 0.5rem;">
            <p style="margin: 0 0 1rem 0; color: var(--pico-muted-color); font-size: 0.875rem;">
              Enhance genre metadata by adding Spotify and/or Last.fm API keys.
              Setup guides:
              {' '}<a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/api-setup/lastfm-setup.md" target="_blank">Last.fm</a> •
              {' '}<a href="https://github.com/aceofaces/plex-playlists/tree/main/docs/api-setup/spotify-setup.md" target="_blank">Spotify</a>
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
// Analyze library function - pulls genres from Plex
async function analyzeLibrary() {
  const btn = document.getElementById('analyzeLibraryBtn');
  const status = document.getElementById('analyze-status');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Starting...';
  status.innerHTML = '<p style="color: var(--pico-muted-color); margin: 0;">🔄 Connecting to Plex server...</p>';

  let lastUpdate = Date.now();
  let updateInterval = null;

  try {
    const response = await fetch('/actions/cache/warm', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      btn.innerHTML = '⏳ Analyzing...';
      status.innerHTML = \`
        <div style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; border-left: 4px solid var(--pico-primary);">
          <p style="margin: 0 0 0.5rem 0; font-weight: 600;">✓ Analysis started!</p>
          <p style="margin: 0; color: var(--pico-muted-color); font-size: 0.875rem;">Scanning your Plex library...</p>
          <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--pico-muted-border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span id="progress-text" style="font-size: 0.875rem;">Preparing...</span>
              <span id="progress-percent" style="font-weight: 600;">0%</span>
            </div>
            <progress id="progress-bar" value="0" max="100" style="width: 100%; margin-top: 0.5rem;"></progress>
            <p id="progress-time" style="margin: 0.5rem 0 0 0; font-size: 0.75rem; color: var(--pico-muted-color);">Just started...</p>
          </div>
        </div>
      \`;

      // Start monitoring via SSE if jobId is available
      if (data.jobId) {
        const eventSource = new EventSource(\`/actions/jobs/\${data.jobId}/stream\`);

        // Update "last activity" timer
        updateInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - lastUpdate) / 1000);
          const timeEl = document.getElementById('progress-time');
          if (timeEl && elapsed > 5) {
            timeEl.textContent = \`Last update: \${elapsed}s ago (still running...)\`;
            timeEl.style.color = elapsed > 30 ? 'var(--pico-del-color)' : 'var(--pico-muted-color)';
          }
        }, 1000);

        eventSource.onmessage = (event) => {
          const job = JSON.parse(event.data);
          lastUpdate = Date.now();

          const progressBar = document.getElementById('progress-bar');
          const progressPercent = document.getElementById('progress-percent');
          const progressText = document.getElementById('progress-text');
          const progressTime = document.getElementById('progress-time');

          // Handle progress updates
          if (job.progress) {
            if (progressBar) progressBar.value = job.progress.percent || 0;
            if (progressPercent) progressPercent.textContent = \`\${Math.round(job.progress.percent || 0)}%\`;
            if (progressText) {
              progressText.textContent = job.progress.message || 'Processing...';
            }
            if (progressTime) {
              const eta = job.progress.eta || 'calculating...';
              progressTime.textContent = \`ETA: \${eta}\`;
              progressTime.style.color = 'var(--pico-muted-color)';
            }
          } else if (job.status === 'running') {
            if (progressText) progressText.textContent = 'Scanning library...';
          }

          // Handle completion
          if (job.status !== 'running') {
            clearInterval(updateInterval);
            eventSource.close();

            if (job.status === 'success') {
              status.innerHTML = '<p style="color: var(--pico-ins-color); margin: 0;">✓ Analysis complete! Reloading...</p>';
              setTimeout(() => window.location.reload(), 1500);
            } else if (job.status === 'failed') {
              const errorMsg = job.error || 'Analysis failed';
              status.innerHTML = \`
                <div style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; border-left: 4px solid var(--pico-del-color);">
                  <p style="margin: 0 0 0.5rem 0; color: var(--pico-del-color); font-weight: 600;">✗ Analysis Failed</p>
                  <p style="margin: 0; font-size: 0.875rem; color: var(--pico-muted-color);">\${errorMsg}</p>
                </div>
              \`;
              btn.disabled = false;
              btn.innerHTML = originalText;
            }
          }
        };

        eventSource.onerror = () => {
          console.error('SSE connection error');
          clearInterval(updateInterval);
          eventSource.close();
          status.innerHTML = \`
            <div style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.5rem; border-left: 4px solid var(--pico-del-color);">
              <p style="margin: 0 0 0.5rem 0; color: var(--pico-del-color); font-weight: 600;">✗ Connection Lost</p>
              <p style="margin: 0; font-size: 0.875rem; color: var(--pico-muted-color);">Lost connection to server. The analysis may still be running in the background. Try refreshing the page in a moment.</p>
            </div>
          \`;
          btn.disabled = false;
          btn.innerHTML = originalText;
        };
      }
    } else {
      throw new Error(data.error || 'Failed to start analysis');
    }
  } catch (err) {
    clearInterval(updateInterval);
    btn.innerHTML = '✗ Failed';
    btn.disabled = false;
    status.innerHTML = \`<p style="color: var(--pico-del-color); margin: 0;">✗ \${err.message}</p>\`;
    setTimeout(() => {
      btn.innerHTML = originalText;
      status.innerHTML = '';
    }, 5000);
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
