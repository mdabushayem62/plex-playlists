/**
 * Configuration Index Page - TSX version
 * Shows all configuration settings with test buttons and edit links
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

interface ConfigIndexPageProps {
  config: {
    server: {
      plexUrl: string;
      databasePath: string;
      webUiEnabled: boolean;
      webUiPort: number;
    };
    apis: {
      lastfmConfigured: boolean;
      spotifyConfigured: boolean;
    };
    scheduling: {
      dailyPlaylists: string; // cron expression
    };
    scoring: {
      halfLifeDays: number;
      maxGenreShare: number;
      playlistTargetSize: number;
      maxPerArtist: number;
      historyDays: number;
      playCountSaturation: number;
    };
  };
  setupComplete: boolean;
  page: string;
}

/**
 * Parse cron expression for display
 */
function parseCronTime(cron: string): JSX.Element {
  const parts = cron.split(' ');
  if (parts.length >= 2) {
    const hour = parseInt(parts[1]);
    const minute = parseInt(parts[0]);
    return `(${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} daily)`;
  }
  return '';
}

export function ConfigIndexPage(props: ConfigIndexPageProps): JSX.Element {
  const { config, setupComplete, page } = props;

  return (
    <Layout title="Configuration" page={page} setupComplete={setupComplete}>
      <style>{`
        .config-card {
          background: var(--pico-card-background-color);
          border: 1px solid var(--pico-muted-border-color);
          border-radius: 0.5rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          transition: border-color 0.2s;
        }
        .config-card:hover {
          border-color: var(--pico-primary);
        }
        .config-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          border-bottom: 1px solid var(--pico-muted-border-color);
          padding-bottom: 0.75rem;
        }
        .config-card-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0;
          font-size: 1.25rem;
        }
        .config-card-icon {
          font-size: 1.5rem;
        }
        .config-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--pico-card-background-color);
        }
        .config-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .config-label {
          font-weight: 500;
          color: var(--pico-muted-color);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .config-value {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 0.25rem;
        }
        .status-success { background: var(--pico-ins-color); }
        .status-warning { background: #ff9800; }
        .status-error { background: var(--pico-del-color); }
        .status-muted { background: var(--pico-muted-color); }
        .action-btn {
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
          margin: 0;
        }
        .tooltip {
          position: relative;
          cursor: help;
          border-bottom: 1px dotted var(--pico-muted-color);
        }
        @media (max-width: 768px) {
          .config-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
          .config-card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
        }
      `}</style>

      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            <li><a href="/">Dashboard</a></li>
            <li>›</li>
            <li><span style="color: var(--pico-contrast);">Configuration</span></li>
          </ol>
        </nav>

        <div style="margin-bottom: 2rem;">
          <h2 style="margin-bottom: 0.5rem;">⚙️ Configuration</h2>
          <p style="color: var(--pico-muted-color); margin: 0;">
            Manage your Plex playlist generator settings. Most settings can be edited directly from the web UI.
          </p>
        </div>

        {/* Plex Server Configuration */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">🖥️</span>
              Plex Server
            </h3>
            <button id="testPlexBtn" class="action-btn secondary" onclick="testPlexConnection()">
              🔌 Test Connection
            </button>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Server URL</span>
            </div>
            <div class="config-value">
              <code>{config.server.plexUrl}</code>
            </div>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Authentication</span>
            </div>
            <div class="config-value">
              <span class="status-dot status-success"></span>
              <span style="color: var(--pico-ins-color);">Token configured</span>
            </div>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Database</span>
            </div>
            <div class="config-value">
              <code style="font-size: 0.875rem;">{config.server.databasePath}</code>
            </div>
          </div>
        </article>

        {/* Web UI Configuration */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">🌐</span>
              Web Interface
            </h3>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Status</span>
            </div>
            <div class="config-value">
              {config.server.webUiEnabled ? (
                <>
                  <span class="status-dot status-success"></span>
                  <span style="color: var(--pico-ins-color);">Running</span>
                </>
              ) : (
                <>
                  <span class="status-dot status-error"></span>
                  <span style="color: var(--pico-del-color);">Disabled</span>
                </>
              )}
            </div>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Port</span>
            </div>
            <div class="config-value">
              <code>{config.server.webUiPort}</code>
              <a href={`http://localhost:${config.server.webUiPort}`} target="_blank" style="font-size: 0.875rem;" title="Open in new tab">↗</a>
            </div>
          </div>
        </article>

        {/* API Integrations */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">🔗</span>
              API Integrations
            </h3>
            <a href="/config/environment" class="action-btn outline" style="text-decoration: none;">
              ✏️ Edit Keys
            </a>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Last.fm</span>
              <small style="color: var(--pico-muted-color); font-weight: normal;">(Genre metadata)</small>
            </div>
            <div class="config-value">
              {config.apis.lastfmConfigured ? (
                <>
                  <span class="status-dot status-success"></span>
                  <span style="color: var(--pico-ins-color);">Configured</span>
                  <button onclick="testLastfm()" class="action-btn secondary">Test</button>
                </>
              ) : (
                <>
                  <span class="status-dot status-warning"></span>
                  <span style="color: #ff9800;">Not configured</span>
                  <small style="color: var(--pico-muted-color); margin-left: 0.5rem;">Optional</small>
                </>
              )}
            </div>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Spotify</span>
              <small style="color: var(--pico-muted-color); font-weight: normal;">(Primary genre source)</small>
            </div>
            <div class="config-value">
              {config.apis.spotifyConfigured ? (
                <>
                  <span class="status-dot status-success"></span>
                  <span style="color: var(--pico-ins-color);">Configured</span>
                  <button onclick="testSpotify()" class="action-btn secondary">Test</button>
                </>
              ) : (
                <>
                  <span class="status-dot status-warning"></span>
                  <span style="color: #ff9800;">Not configured</span>
                  <small style="color: var(--pico-muted-color); margin-left: 0.5rem;">Optional</small>
                </>
              )}
            </div>
          </div>

          <small style="display: block; margin-top: 1rem; color: var(--pico-muted-color);">
            💡 API keys enable genre enrichment for better playlist curation
          </small>
        </article>

        {/* Scheduling */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">⏰</span>
              Scheduling
            </h3>
            <a href="/config/scheduling" class="action-btn outline" style="text-decoration: none;">
              ✏️ Edit Schedule
            </a>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Daily Playlists</span>
              <small style="color: var(--pico-muted-color); font-weight: normal;">(Morning, Afternoon, Evening)</small>
            </div>
            <div class="config-value">
              <code>{config.scheduling.dailyPlaylists}</code>
              <small style="color: var(--pico-muted-color);" title="Cron expression format">
                {parseCronTime(config.scheduling.dailyPlaylists)}
              </small>
            </div>
          </div>

          <small style="display: block; margin-top: 1rem; color: var(--pico-muted-color);">
            ℹ️ All three daily playlists run sequentially at the scheduled time
          </small>
        </article>

        {/* Scoring Parameters */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">🎯</span>
              Scoring Parameters
            </h3>
            <a href="/config/scoring" class="action-btn outline" style="text-decoration: none;">
              ✏️ Edit Parameters
            </a>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.5rem;">
              <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary);">{config.scoring.halfLifeDays}</div>
              <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Half-Life Days</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.5rem;">
              <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary);">{(config.scoring.maxGenreShare * 100).toFixed(0)}%</div>
              <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Max Genre Share</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.5rem;">
              <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary);">{config.scoring.playlistTargetSize}</div>
              <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Target Size</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.5rem;">
              <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary);">{config.scoring.maxPerArtist}</div>
              <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Max Per Artist</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.5rem;">
              <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary);">{config.scoring.historyDays}</div>
              <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">History Days</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--pico-background-color); border-radius: 0.5rem;">
              <div style="font-size: 2rem; font-weight: bold; color: var(--pico-primary);">{config.scoring.playCountSaturation}</div>
              <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Play Count Saturation</div>
            </div>
          </div>

          <small style="display: block; color: var(--pico-muted-color);">
            📊 These parameters control how tracks are scored and selected for playlists
          </small>
        </article>

        {/* Quick Actions */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">⚡</span>
              Quick Actions
            </h3>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <a href="/config/environment" style="text-decoration: none;">
              <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--pico-muted-border-color); transition: border-color 0.2s;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔐</div>
                <div style="font-weight: 500;">Environment</div>
                <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">API keys & variables</div>
              </div>
            </a>

            <a href="/config/scheduling" style="text-decoration: none;">
              <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--pico-muted-border-color); transition: border-color 0.2s;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⏰</div>
                <div style="font-weight: 500;">Scheduling</div>
                <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Cron schedules</div>
              </div>
            </a>

            <a href="/config/playlists" style="text-decoration: none;">
              <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--pico-muted-border-color); transition: border-color 0.2s;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🎵</div>
                <div style="font-weight: 500;">Playlists</div>
                <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Genre playlists config</div>
              </div>
            </a>

            <a href="/actions/cache" style="text-decoration: none;">
              <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--pico-muted-border-color); transition: border-color 0.2s;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">💾</div>
                <div style="font-weight: 500;">Cache</div>
                <div style="font-size: 0.875rem; color: var(--pico-muted-color); margin-top: 0.25rem;">Genre cache management</div>
              </div>
            </a>
          </div>
        </article>

        {/* Setup Wizard & Advanced */}
        <article class="config-card">
          <div class="config-card-header">
            <h3 class="config-card-title">
              <span class="config-card-icon">🔧</span>
              Advanced
            </h3>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Setup Wizard</span>
              <small style="color: var(--pico-muted-color); font-weight: normal;">Re-configure from scratch</small>
            </div>
            <div class="config-value">
              <button id="resetSetupBtn" class="action-btn outline" onclick="resetSetupWizard()">
                🔄 Re-run Setup
              </button>
            </div>
          </div>

          <div class="config-row">
            <div class="config-label">
              <span>Documentation</span>
              <small style="color: var(--pico-muted-color); font-weight: normal;">Full configuration guide</small>
            </div>
            <div class="config-value">
              <a href="https://github.com/aceofaces/plex-playlists#readme" target="_blank" class="action-btn secondary" style="text-decoration: none;">
                📖 View Docs
              </a>
            </div>
          </div>
        </article>

        {/* Help Panel */}
        <div style="background: linear-gradient(135deg, rgba(var(--pico-primary-rgb), 0.1) 0%, rgba(var(--pico-primary-rgb), 0.05) 100%); border: 1px solid var(--pico-primary); border-radius: 0.5rem; padding: 1.5rem; margin-top: 2rem;">
          <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.25rem;">💡</span>
            <span>Configuration Tips</span>
          </h4>
          <ul style="margin: 0; padding-left: 1.5rem;">
            <li style="margin-bottom: 0.5rem;">
              <strong>Test connections</strong> after updating API keys to verify they work
            </li>
            <li style="margin-bottom: 0.5rem;">
              <strong>Most settings</strong> take effect immediately without restart
            </li>
            <li style="margin-bottom: 0.5rem;">
              <strong>Web UI settings</strong> (database) take precedence over <code>.env</code> file
            </li>
            <li>
              <strong>Scoring parameters</strong> apply to next playlist generation
            </li>
          </ul>
        </div>
      </div>

      <script src="/js/config.js"></script>
    </Layout>
  );
}
