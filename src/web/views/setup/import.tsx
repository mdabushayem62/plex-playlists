/**
 * Setup Wizard - Import Ratings Page
 */

import Html from '@kitajs/html';
import { SetupLayout } from '../setup-layout.tsx';

interface SetupStep {
  id: string;
  title: string;
  path: string;
}

export interface ImportPageProps {
  step: string;
  steps: readonly SetupStep[];
  currentStepIndex: number;
  state: unknown;
}

export function ImportPage(props: ImportPageProps): JSX.Element {
  const { steps, currentStepIndex } = props;

  return (
    <SetupLayout title="Import Ratings" steps={steps} currentStepIndex={currentStepIndex}>
      <div class="step-content">
        <h2>Import Ratings</h2>
        <p>
          If you have existing music ratings from other sources (iTunes, Navidrome, YouTube Music, etc.),
          you can import them to enhance playlist generation.
        </p>

        <h3>How It Works</h3>
        <p>
          The import tool matches tracks from CSV files to your Plex library and applies star ratings.
          This is completely <strong>optional</strong> - you can skip this step and let the system learn from your listening history instead.
        </p>

        <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem; margin: 1.5rem 0;">
          <h4 style="margin-top: 0;">Supported Formats</h4>
          <p style="margin-bottom: 0.5rem;">
            <strong>CSV Files:</strong> Spotify, iTunes, Navidrome exports with <code>title</code>, <code>artist</code>, <code>album</code>, <code>rating</code> columns
          </p>
          <p style="margin-bottom: 0.5rem;">
            <strong>JSON Files:</strong> YouTube Music / Google Takeout exports (auto-detected)
          </p>
          <p style="margin: 0; font-size: 0.875rem;">
            📖 See <a href="https://github.com/aceofaces/plex-playlists/blob/main/IMPORTING.md" target="_blank">IMPORTING.md</a>
            for detailed format specifications and export instructions.
          </p>
        </div>

        <h3>Import from Directory</h3>
        <p>
          Place your CSV or JSON file(s) in a directory on your server (e.g., <code>/config/ratings</code>).
          The importer will auto-detect and process both formats.
        </p>

        <form id="importForm" hx-post="/setup/import/run" hx-target="#import-results" hx-indicator="#import-spinner">
          <label>
            Import Directory Path
            <input
              type="text"
              name="csvPath"
              value="/config/ratings"
              placeholder="/config/ratings"
              required
            />
            <small>Full path to directory containing your CSV or JSON files</small>
          </label>

          <div style="display: flex; gap: 1rem; align-items: center;">
            <button type="submit">🔄 Start Import</button>
            <div id="import-spinner" class="htmx-indicator" style="color: var(--pico-muted-color);">
              Processing...
            </div>
          </div>
        </form>

        <div id="import-results" style="margin-top: 1.5rem;"></div>

        <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem; margin-top: 1.5rem;">
          <p style="margin: 0;">
            💡 <strong>Tip:</strong> Import can take several minutes for large libraries.
            You can skip this step now and import ratings later from the Actions page.
          </p>
        </div>
      </div>

      <div class="button-group">
        <a href="/setup" role="button" class="secondary">← Back</a>
        <form method="POST" action="/setup/import/skip">
          <button type="submit" class="secondary">Skip This Step →</button>
        </form>
      </div>
    </SetupLayout>
  );
}
