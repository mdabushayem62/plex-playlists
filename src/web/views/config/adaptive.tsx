/**
 * Adaptive PlayQueue Settings Page
 * Configure real-time queue adaptation based on skip patterns
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';
import type { AdaptiveStats } from '../../adaptive/adaptive-repository.ts';

interface AdaptiveSettingsPageProps {
  enabled: boolean;
  sensitivity: number;
  minSkips: number;
  windowMinutes: number;
  cooldownSeconds: number;
  stats: AdaptiveStats;
  setupComplete: boolean;
  page: string;
}

export function AdaptiveSettingsPage(props: AdaptiveSettingsPageProps): JSX.Element {
  const { enabled, sensitivity, minSkips, windowMinutes, cooldownSeconds, stats, setupComplete, page } = props;

  return (
    <Layout title="Adaptive PlayQueue Settings (Beta)" page={page} setupComplete={setupComplete}>
      <style>{`
        .config-card {
          background: var(--pico-card-background-color);
          border: 1px solid var(--pico-muted-border-color);
          border-radius: 0.5rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .config-card-header {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--pico-muted-border-color);
        }
        .config-card h3 {
          margin: 0 0 0.5rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .beta-badge {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 0.125rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 1rem;
          margin: 1.5rem 0;
        }
        .stat-card {
          text-align: center;
          padding: 1.25rem;
          background: var(--pico-background-color);
          border-radius: 0.5rem;
          border: 1px solid var(--pico-muted-border-color);
        }
        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: var(--pico-primary);
          margin-bottom: 0.25rem;
        }
        .stat-label {
          font-size: 0.875rem;
          color: var(--pico-muted-color);
        }
        .settings-form label {
          display: block;
          margin-bottom: 1.5rem;
        }
        .settings-form label > span {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }
        .settings-form small {
          display: block;
          margin-top: 0.25rem;
          color: var(--pico-muted-color);
        }
        .webhook-instructions {
          background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.05) 0%, rgba(var(--pico-primary-rgb), 0.02) 100%);
          border: 1px solid var(--pico-primary);
          border-radius: 0.5rem;
          padding: 1.5rem;
        }
        .webhook-instructions h4 {
          margin: 0 0 1rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .webhook-instructions ol {
          margin: 0;
          padding-left: 1.5rem;
        }
        .webhook-instructions li {
          margin-bottom: 0.75rem;
        }
        .webhook-url {
          display: inline-block;
          background: var(--pico-background-color);
          padding: 0.5rem 0.75rem;
          border-radius: 0.25rem;
          font-family: monospace;
          border: 1px solid var(--pico-muted-border-color);
          margin: 0.25rem 0;
        }
        .warning-box {
          background: rgba(255, 152, 0, 0.1);
          border: 1px solid #ff9800;
          border-radius: 0.5rem;
          padding: 1rem;
          margin: 1.5rem 0;
        }
        .info-box {
          background: rgba(33, 150, 243, 0.1);
          border: 1px solid #2196F3;
          border-radius: 0.5rem;
          padding: 1rem;
          margin: 1.5rem 0;
        }
        .slider-container {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .slider-value {
          min-width: 3rem;
          text-align: center;
          font-weight: bold;
          color: var(--pico-primary);
        }
      `}</style>

      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><a href="/config">Configuration</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Adaptive PlayQueue</span></li>
          </ol>
        </nav>

        {/* Page Header */}
        <div style="margin-bottom: 2rem;">
          <h2 style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.75rem;">
            🎵 Adaptive PlayQueue
            <span class="beta-badge">Beta</span>
          </h2>
          <p style="color: var(--pico-muted-color); margin: 0;">
            Automatically adjust your PlayQueue during playback based on skip patterns.
            Requires Plex Pass subscription (webhooks are a premium feature).
          </p>
        </div>

        {/* Statistics Card */}
        <article class="config-card">
          <div class="config-card-header">
            <h3>📊 Statistics</h3>
            <p style="color: var(--pico-muted-color); margin: 0; font-size: 0.875rem;">
              {stats.totalSessions > 0
                ? `Tracking data from ${stats.totalSessions} session${stats.totalSessions !== 1 ? 's' : ''}`
                : 'No data yet - enable the feature and start listening!'}
            </p>
          </div>

          <div class="stat-grid">
            <div class="stat-card">
              <div class="stat-value">{stats.totalSkips}</div>
              <div class="stat-label">Total Skips</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.totalAdaptations}</div>
              <div class="stat-label">Adaptations</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.activeSessions}</div>
              <div class="stat-label">Active Sessions</div>
              <small style="color: var(--pico-muted-color); display: block; margin-top: 0.25rem; font-size: 0.75rem;">
                (last 24h)
              </small>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.avgSkipsPerSession}</div>
              <div class="stat-label">Avg Skips/Session</div>
            </div>
          </div>
        </article>

        {/* Settings Form */}
        <article class="config-card">
          <div class="config-card-header">
            <h3>⚙️ Configuration</h3>
          </div>

          <form class="settings-form" method="POST" action="/api/settings/batch" id="adaptive-settings-form">
            {/* Enable Toggle */}
            <label>
              <input
                type="checkbox"
                name="adaptive_queue_enabled"
                id="adaptive_queue_enabled"
                checked={enabled}
                value="true"
              />
              <span style="display: inline; margin-left: 0.5rem;">Enable Adaptive PlayQueue</span>
              <small>
                When enabled, the system will automatically detect skip patterns and adjust your PlayQueue in real-time.
                Only works for playlists created by plex-playlists.
              </small>
            </label>

            <hr />

            {/* Sensitivity Slider */}
            <label>
              <span>Sensitivity Level</span>
              <div class="slider-container">
                <input
                  type="range"
                  name="adaptive_sensitivity"
                  id="adaptive_sensitivity"
                  min="1"
                  max="10"
                  value={sensitivity.toString()}
                  oninput="document.getElementById('sensitivity-value').textContent = this.value"
                  style="flex: 1;"
                />
                <div class="slider-value" id="sensitivity-value">{sensitivity}</div>
              </div>
              <small>
                Higher values make the system more aggressive. Level 1 = very conservative, Level 10 = very aggressive.
              </small>
            </label>

            {/* Minimum Skips */}
            <label>
              <span>Minimum Skips to Trigger</span>
              <input
                type="number"
                name="adaptive_min_skip_count"
                id="adaptive_min_skip_count"
                min="1"
                max="5"
                value={minSkips.toString()}
                required
              />
              <small>
                Number of skips of the same genre/artist within the time window before triggering an adaptation.
              </small>
            </label>

            {/* Time Window */}
            <label>
              <span>Time Window (minutes)</span>
              <input
                type="number"
                name="adaptive_window_minutes"
                id="adaptive_window_minutes"
                min="1"
                max="15"
                value={windowMinutes.toString()}
                required
              />
              <small>
                How far back to look for skip patterns. Shorter windows react faster but may be less accurate.
              </small>
            </label>

            {/* Cooldown */}
            <label>
              <span>Cooldown Between Adaptations (seconds)</span>
              <input
                type="number"
                name="adaptive_cooldown_seconds"
                id="adaptive_cooldown_seconds"
                min="5"
                max="60"
                value={cooldownSeconds.toString()}
                required
              />
              <small>
                Minimum time between successive adaptations to prevent rapid queue changes.
              </small>
            </label>

            <button type="submit" id="save-btn">💾 Save Settings</button>
          </form>
        </article>

        {/* Webhook Setup Instructions */}
        <article class="webhook-instructions">
          <h4>🔗 Webhook Setup</h4>
          <p style="margin: 0 0 1rem 0; color: var(--pico-muted-color);">
            Follow these steps to configure Plex webhooks:
          </p>
          <ol>
            <li>
              Open <strong>Plex Settings</strong> → <strong>Webhooks</strong>
            </li>
            <li>
              Click <strong>"Add Webhook"</strong>
            </li>
            <li>
              Enter this URL:
              <div class="webhook-url">http://plex-playlists:8687/webhooks/plex</div>
              <small style="display: block; margin-top: 0.5rem; color: var(--pico-muted-color);">
                ℹ️ Use <code>http://localhost:8687/webhooks/plex</code> if not using Docker
              </small>
            </li>
            <li>
              Save the webhook
            </li>
            <li>
              Test the connection: <a href="/webhooks/health" target="_blank">Webhook Health Check ↗</a>
            </li>
          </ol>
        </article>

        {/* Requirements Warning */}
        <div class="warning-box">
          <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <span>⚠️</span>
            <span>Requirements</span>
          </h4>
          <ul style="margin: 0; padding-left: 1.5rem;">
            <li>
              <strong>Plex Pass subscription</strong> required (webhooks are a premium feature)
            </li>
            <li>
              <strong>Plexamp client</strong> recommended (other clients may not support PlayQueue API well)
            </li>
            <li>
              Only adapts <strong>playlists created by plex-playlists</strong> (not manually created Plex playlists)
            </li>
          </ul>
        </div>

        {/* How It Works */}
        <div class="info-box">
          <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <span>💡</span>
            <span>How It Works</span>
          </h4>
          <p style="margin: 0 0 0.75rem 0;">
            The adaptive system monitors your listening behavior via Plex webhooks and detects patterns:
          </p>
          <ul style="margin: 0; padding-left: 1.5rem;">
            <li>
              <strong>Genre Fatigue:</strong> Skip 2+ tracks from the same genre → removes similar tracks from queue
            </li>
            <li>
              <strong>Artist Aversion:</strong> Skip 2+ tracks from the same artist → removes artist from queue
            </li>
            <li>
              <strong>Auto-Refill:</strong> Adds similar tracks to maintain queue length
            </li>
          </ul>
        </div>
      </div>

      <script>{`
        // Form submission handler
        document.getElementById('adaptive-settings-form').addEventListener('submit', async (e) => {
          e.preventDefault();

          const formData = new FormData(e.target);
          const settings = {};

          // Convert checkbox to proper boolean string
          const enabledCheckbox = document.getElementById('adaptive_queue_enabled');
          settings.adaptive_queue_enabled = enabledCheckbox.checked ? 'true' : 'false';

          // Add other settings
          settings.adaptive_sensitivity = formData.get('adaptive_sensitivity');
          settings.adaptive_min_skip_count = formData.get('adaptive_min_skip_count');
          settings.adaptive_window_minutes = formData.get('adaptive_window_minutes');
          settings.adaptive_cooldown_seconds = formData.get('adaptive_cooldown_seconds');

          const saveBtn = document.getElementById('save-btn');
          const originalText = saveBtn.textContent;
          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ Saving...';

          try {
            const response = await fetch('/api/settings/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings })
            });

            const result = await response.json();

            if (result.success) {
              saveBtn.textContent = '✅ Saved!';
              setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
              }, 2000);
            } else {
              throw new Error(result.error || 'Failed to save');
            }
          } catch (error) {
            alert('Failed to save settings: ' + error.message);
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
          }
        });
      `}</script>
    </Layout>
  );
}
