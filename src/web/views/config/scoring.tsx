/**
 * Scoring Parameters Page - TSX version
 * Configure how tracks are scored and selected for playlists
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';
import { EditableField, EditableFieldScript, type FieldMetadata } from '../components/editable-field.tsx';

interface HistoryEntry {
  settingKey: string;
  oldValue: string | null;
  newValue: string;
  changedAt: Date;
}

interface Breadcrumb {
  label: string;
  url: string | null;
}

export interface ScoringPageProps {
  scoringSettings: Record<string, FieldMetadata>;
  history: HistoryEntry[];
  page: string;
  setupComplete: boolean;
  breadcrumbs?: Breadcrumb[];
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

function formatFieldLabel(key: string): JSX.Element {
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function ScoringPage(props: ScoringPageProps): JSX.Element {
  const { scoringSettings, history, page, setupComplete, breadcrumbs } = props;

  return (
    <Layout title="Scoring Parameters" page={page} setupComplete={setupComplete}>
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

        <h2>Scoring Parameters</h2>
        <p style="color: var(--pico-muted-color);">
          Adjust how tracks are scored and selected for playlists. Click ✏️ Edit to change values.
          Changes take effect on the next playlist generation.
        </p>

        {/* Editable Fields */}
        <section style="margin-top: 2rem;">
          {Object.entries(scoringSettings).map(([key, metadata]) => (
            <article style="margin-bottom: 1.5rem;">
              <h4 style="margin-bottom: 0.5rem;">
                {formatFieldLabel(key)}
              </h4>
              <p style="color: var(--pico-muted-color); margin-bottom: 1rem; font-size: 0.875rem;">
                {metadata.description}
              </p>

              <EditableField fieldKey={key} metadata={metadata} />

              {metadata.validation?.min !== undefined && metadata.validation?.max !== undefined && (
                <small style="color: var(--pico-muted-color); display: block; margin-top: 0.5rem;">
                  Valid range: {metadata.validation.min} to {metadata.validation.max}
                </small>
              )}
            </article>
          ))}
        </section>

        {/* Change History */}
        {history && history.length > 0 && (
          <section style="margin-top: 3rem;">
            <h3>Recent Changes</h3>
            <table>
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Old Value</th>
                  <th>New Value</th>
                  <th>Changed</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr>
                    <td><code>{h.settingKey}</code></td>
                    <td><code>{h.oldValue || 'default'}</code></td>
                    <td><code>{h.newValue}</code></td>
                    <td>{timeAgo(h.changedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* How Scoring Works */}
        <section style="margin-top: 2rem;">
          <h3>How Scoring Works</h3>
          <div style="background: var(--pico-background-color); padding: 1rem; border-radius: 0.25rem;">
            <p><strong>Final Score Calculation:</strong></p>
            <pre style="margin: 0.5rem 0;"><code>finalScore = 0.7 × recencyWeight + 0.3 × fallbackScore</code></pre>

            <p style="margin-top: 1rem;"><strong>Recency Weight:</strong></p>
            <pre style="margin: 0.5rem 0;"><code>recencyWeight = exp(-ln(2) × daysSincePlay / halfLifeDays)</code></pre>
            <p style="font-size: 0.875rem; color: var(--pico-muted-color); margin: 0;">
              Exponential decay favoring recently played tracks.
            </p>

            <p style="margin-top: 1rem;"><strong>Fallback Score:</strong></p>
            <pre style="margin: 0.5rem 0;"><code>fallbackScore = 0.6 × normalizedRating + 0.4 × normalizedPlayCount</code></pre>
            <p style="font-size: 0.875rem; color: var(--pico-muted-color); margin: 0;">
              Combines star ratings and play frequency for tracks with no recent plays.
            </p>
          </div>
        </section>
      </div>

      {/* Include editable field JavaScript */}
      <EditableFieldScript />
      <script>{`
        // Register all fields on page load
        ${Object.entries(scoringSettings).map(([key, metadata]) =>
          `registerField('${key}', ${JSON.stringify(metadata)});`
        ).join('\n        ')}
      `}</script>
    </Layout>
  );
}
