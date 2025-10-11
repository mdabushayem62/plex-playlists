/**
 * Format duration from milliseconds to human-readable format
 * Examples:
 *   - 125000 (2m 5s) → "2m"
 *   - 3665000 (1h 1m 5s) → "1h 1m"
 *   - 12345000 (3h 25m 45s) → "3h 26m"
 */
export function formatDuration(milliseconds: number): string {
  if (!milliseconds || milliseconds <= 0) {
    return '0m';
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  if (hours > 0) {
    // Show hours and minutes (round up minutes for cleaner display)
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  // Less than an hour, just show minutes
  return `${minutes}m`;
}

/**
 * Calculate total duration from an array of items with duration property
 */
export function calculateTotalDuration<T extends { duration?: number }>(
  items: T[]
): number {
  return items.reduce((sum, item) => sum + (item.duration || 0), 0);
}
