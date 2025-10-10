/**
 * Setup Wizard - Complete Page
 */

import Html from '@kitajs/html';
import { SetupLayout } from '../setup-layout.tsx';

interface SetupStep {
  id: string;
  title: string;
  path: string;
}

export interface CompletePageProps {
  step: string;
  steps: readonly SetupStep[];
  currentStepIndex: number;
  state: unknown;
  morningCron: string;
  afternoonCron: string;
  eveningCron: string;
}

export function CompletePage(props: CompletePageProps): JSX.Element {
  const { steps, currentStepIndex, morningCron, afternoonCron, eveningCron } = props;

  return (
    <SetupLayout title="Complete" steps={steps} currentStepIndex={currentStepIndex}>
      <div class="step-content" style="text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
        <h2 style="margin-top: 0;">Setup Complete!</h2>
        <p style="font-size: 1.125rem; color: var(--pico-muted-color);">
          Your Plex Playlist Enhancer is now configured and ready to create amazing playlists.
        </p>

        {/* Next Scheduled Generation */}
        <div style="background: var(--pico-primary); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem auto; max-width: 600px; text-align: left;">
          <h3 style="margin-top: 0;">📅 Your Playlists Will Be Generated Automatically</h3>
          <div style="display: grid; gap: 0.5rem; margin: 1rem 0; font-size: 0.875rem;">
            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.1); border-radius: 0.25rem;">
              <span><strong>🌅 Morning Mix</strong></span>
              <span style="font-family: monospace;">{morningCron || '6:00 AM daily'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.1); border-radius: 0.25rem;">
              <span><strong>☀️ Afternoon Mix</strong></span>
              <span style="font-family: monospace;">{afternoonCron || '12:00 PM daily'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: rgba(255,255,255,0.1); border-radius: 0.25rem;">
              <span><strong>🌙 Evening Mix</strong></span>
              <span style="font-family: monospace;">{eveningCron || '6:00 PM daily'}</span>
            </div>
          </div>
          <p style="margin: 1rem 0 0 0; font-size: 0.875rem;">
            💡 <strong>Too early?</strong> Generate playlists immediately using the Actions page below.
          </p>
        </div>

        {/* Where to Find Playlists */}
        <div style="background: var(--pico-card-background-color); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem auto; max-width: 600px; text-align: left;">
          <h3 style="margin-top: 0;">📍 Where to Find Your Playlists</h3>
          <ol style="margin: 0.5rem 0; line-height: 1.8;">
            <li>
              <strong>In Plex App:</strong>
              <p style="margin: 0.25rem 0 0 1.5rem; color: var(--pico-muted-color); font-size: 0.875rem;">
                Open Plex → Navigate to <strong>Playlists</strong> → Look for playlists starting with 🌅 🎵 emojis
              </p>
            </li>
            <li>
              <strong>In This Web UI:</strong>
              <p style="margin: 0.25rem 0 0 1.5rem; color: var(--pico-muted-color); font-size: 0.875rem;">
                Visit the <a href="/playlists">Playlists page</a> to see generated playlists, track lists, and scores
              </p>
            </li>
            <li>
              <strong>Check Dashboard:</strong>
              <p style="margin: 0.25rem 0 0 1.5rem; color: var(--pico-muted-color); font-size: 0.875rem;">
                The <a href="/">Dashboard</a> shows recent activity, stats, and quick access
              </p>
            </li>
          </ol>
        </div>

        {/* Quick Actions */}
        <div style="background: var(--pico-background-color); padding: 1.5rem; border-radius: 0.5rem; margin: 2rem auto; max-width: 700px; text-align: left;">
          <h3 style="margin-top: 0;">⚡ Quick Actions</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <a href="/actions" role="button" style="margin: 0;">
              <div style="text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎵</div>
                <div><strong>Generate Now</strong></div>
                <small style="color: var(--pico-muted-color);">Create playlists immediately</small>
              </div>
            </a>
            <a href="/playlists" role="button" class="secondary" style="margin: 0;">
              <div style="text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
                <div><strong>View Playlists</strong></div>
                <small style="color: var(--pico-muted-color);">Browse generated playlists</small>
              </div>
            </a>
            <a href="/config" role="button" class="secondary" style="margin: 0;">
              <div style="text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚙️</div>
                <div><strong>Settings</strong></div>
                <small style="color: var(--pico-muted-color);">Customize parameters</small>
              </div>
            </a>
          </div>
        </div>

        {/* What You Can Customize */}
        <details style="margin: 2rem auto; max-width: 700px; text-align: left;">
          <summary style="cursor: pointer;"><strong>What can I customize?</strong></summary>
          <div style="padding: 1rem 0; font-size: 0.875rem;">
            <ul style="margin: 0;">
              <li><strong>Scheduling:</strong> Change when playlists are generated (Configuration → Scheduling)</li>
              <li><strong>Playlist Size:</strong> Adjust target number of tracks (Configuration → Scoring)</li>
              <li><strong>Genre Limits:</strong> Control max percentage per genre (Configuration → Scoring)</li>
              <li><strong>Artist Variety:</strong> Change max tracks per artist (Configuration → Scoring)</li>
              <li><strong>Recency Bias:</strong> Adjust half-life for recency weighting (Configuration → Scoring)</li>
              <li><strong>API Keys:</strong> Add or update Last.fm/Spotify keys (Configuration → Environment)</li>
              <li><strong>Genre Playlists:</strong> Configure which genres get playlists (Configuration → Playlists)</li>
            </ul>
          </div>
        </details>

        {/* CLI Reference (Collapsible) */}
        <details style="margin: 2rem auto; max-width: 700px; text-align: left;">
          <summary style="cursor: pointer;">Advanced: CLI Commands</summary>
          <div style="padding: 1rem 0; font-size: 0.875rem; color: var(--pico-muted-color);">
            <p>If you prefer command-line access, these commands are available:</p>
            <pre style="background: var(--pico-card-background-color); padding: 1rem; border-radius: 0.25rem; margin-top: 0.5rem;"><code>{`# Generate a specific playlist
plex-playlists run morning

# Generate all daily playlists
plex-playlists run-all

# Warm the genre cache
plex-playlists cache warm

# Import ratings from CSV
plex-playlists import /path/to/csv`}</code></pre>
          </div>
        </details>

        {/* CTA Buttons */}
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 3rem;">
          <a href="/" role="button" style="min-width: 200px;">Go to Dashboard</a>
          <a href="/actions" role="button" class="secondary" style="min-width: 200px;">Generate Playlists Now</a>
        </div>

        <p style="margin-top: 2rem; color: var(--pico-muted-color); font-size: 0.875rem;">
          Need help? Check the <a href="https://github.com/aceofaces/plex-playlists/blob/main/README.md" target="_blank">documentation</a> or
          <a href="https://github.com/aceofaces/plex-playlists/blob/main/TROUBLESHOOTING.md" target="_blank">troubleshooting guide</a>.
        </p>
      </div>
    </SetupLayout>
  );
}
