/**
 * Setup Wizard - Welcome Page
 */

import Html from '@kitajs/html';
import { SetupLayout } from '../setup-layout.tsx';

interface PlexServerInfo {
  name: string;
  version: string;
  platform: string;
}

interface SetupStep {
  id: string;
  title: string;
  path: string;
}

export interface WelcomePageProps {
  step: string;
  steps: readonly SetupStep[];
  currentStepIndex: number;
  plexConnected: boolean;
  plexServerInfo: PlexServerInfo | null;
  connectionError: string | null;
  plexUrl: string;
  plexToken: string;
}

export function WelcomePage(props: WelcomePageProps): JSX.Element {
  const { steps, currentStepIndex, plexConnected, plexServerInfo, connectionError, plexUrl, plexToken } = props;

  return (
    <SetupLayout title="Welcome" steps={steps} currentStepIndex={currentStepIndex}>
      <div class="step-content">
        <h2>Welcome to Plex Playlist Enhancer</h2>
        <p>
          This wizard will guide you through the initial setup process. We'll help you:
        </p>
        <ul>
          <li>Verify your Plex server connection</li>
          <li>Optionally import existing ratings</li>
          <li>Build initial genre data from your music library</li>
          <li>Configure optional API keys for enhanced genre metadata</li>
          <li>Generate your first intelligent playlists</li>
        </ul>

        <h3>Plex Server Connection</h3>
        {plexConnected ? (
          <>
            <p class="status-success">
              ✓ Successfully connected to Plex server
            </p>
            <ul style="color: var(--pico-muted-color);">
              <li><strong>Server:</strong> {plexServerInfo?.name}</li>
              <li><strong>Version:</strong> {plexServerInfo?.version}</li>
              <li><strong>Platform:</strong> {plexServerInfo?.platform}</li>
              <li><strong>URL:</strong> {plexUrl}</li>
            </ul>
          </>
        ) : (
          <>
            <div id="plex-config-form">
              <p class="status-warning">
                ⚠ Unable to connect to Plex server
              </p>
              {connectionError && (
                <p style="color: var(--pico-del-color); font-size: 0.875rem; margin-bottom: 1rem;">
                  <strong>Error:</strong> {connectionError}
                </p>
              )}

              <p>Please enter your Plex server details below:</p>

              <form id="plexForm" hx-post="/setup/plex-config" hx-swap="innerHTML" hx-target="#plex-response">
                <label>
                  Plex Server URL
                  <input
                    type="text"
                    name="plexUrl"
                    value={plexUrl}
                    placeholder="http://localhost:32400"
                    required
                  />
                  <small>Usually http://localhost:32400 or http://your-server-ip:32400</small>
                </label>

                <label>
                  Plex Auth Token
                  <input
                    type="password"
                    name="plexToken"
                    value={plexToken && plexToken.startsWith('***') ? '' : plexToken}
                    placeholder="Your X-Plex-Token"
                    required
                  />
                  <small>
                    <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank">
                      How to find your Plex token →
                    </a>
                  </small>
                </label>

                <button type="submit">Test Connection</button>
              </form>

              <div id="plex-response"></div>
            </div>

            <script>{`
              // Handle successful connection
              document.body.addEventListener('htmx:afterSwap', function(event) {
                if (event.detail.target.id === 'plex-response') {
                  try {
                    const response = JSON.parse(event.detail.xhr.responseText);
                    if (response.success) {
                      // Show success message and reload page
                      event.detail.target.innerHTML = '<p class="status-success">✓ Connection successful! Reloading...</p>';
                      setTimeout(() => window.location.reload(), 1000);
                    } else if (response.error) {
                      event.detail.target.innerHTML = '<p class="status-warning">✗ ' + response.error + '</p>';
                    }
                  } catch (e) {
                    event.detail.target.innerHTML = '<p class="status-warning">✗ Error saving configuration</p>';
                  }
                }
              });
            `}</script>
          </>
        )}
      </div>

      <div class="button-group">
        <div></div>
        <form method="POST" action="/setup/start">
          <button type="submit" disabled={!plexConnected}>
            Get Started →
          </button>
        </form>
      </div>
    </SetupLayout>
  );
}
