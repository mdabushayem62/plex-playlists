/**
 * Shared StatsCard Component
 * Displays cache statistics with source breakdown
 */

import Html from '@kitajs/html';

export interface CacheStats {
  total: number;
  bySource: Record<string, number>;
  expired: number;
  expiringWithin7Days: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

interface StatsCardProps {
  title: string;
  stats: CacheStats;
  showDetails?: boolean;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * StatsCard component for displaying cache statistics
 */
export function StatsCard({ title, stats, showDetails = true }: StatsCardProps): JSX.Element {
  return (
    <div style="margin-bottom: 2rem;">
      <h4 class="m-0" style="margin-bottom: 0.75rem; font-size: 1.125rem;">{title}</h4>

      {/* Main stats grid */}
      <div class="grid-auto-wide gap-4">
        <div class="stat-card">
          <h3>{stats.total}</h3>
          <p>Total Entries</p>
        </div>

        {Object.entries(stats.bySource).map(([source, count]) => (
          <div class="stat-card">
            <h3>{count}</h3>
            <p style="text-transform: capitalize;">{source}</p>
          </div>
        ))}

        {stats.expiringWithin7Days > 0 && (
          <div class="stat-card">
            <h3 style="color: var(--pico-secondary-color);">{stats.expiringWithin7Days}</h3>
            <p>Expiring Soon</p>
          </div>
        )}
      </div>

      {/* Additional details */}
      {showDetails && (stats.oldestEntry || stats.newestEntry) && (
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--pico-muted-border-color); color: var(--pico-muted-color); font-size: 0.875rem;">
          {stats.oldestEntry && (
            <div>Oldest entry: {formatDate(stats.oldestEntry)}</div>
          )}
          {stats.newestEntry && (
            <div>Newest entry: {formatDate(stats.newestEntry)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Simple stat card for coverage percentage
 */
export function CoverageStatsCard({
  title,
  total,
  cached,
  percentage
}: {
  title: string;
  total: number;
  cached: number;
  percentage: number;
}): JSX.Element {
  return (
    <div style="margin-bottom: 2rem;">
      <h4 class="m-0" style="margin-bottom: 0.75rem; font-size: 1.125rem;">{title}</h4>

      <div class="grid-auto-wide gap-4">
        <div class="stat-card">
          <h3>{cached}</h3>
          <p>Cached</p>
        </div>

        <div class="stat-card">
          <h3>{total}</h3>
          <p>Total</p>
        </div>

        <div class="stat-card">
          <h3 style={percentage >= 80 ? "color: var(--pico-ins-color);" : percentage >= 50 ? "color: var(--pico-secondary-color);" : "color: var(--pico-del-color);"}>{percentage.toFixed(1)}%</h3>
          <p>Coverage</p>
        </div>
      </div>
    </div>
  );
}
