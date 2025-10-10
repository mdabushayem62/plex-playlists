/**
 * Cache Management - Client-side functionality
 * Uses shared job-monitor module for SSE progress tracking
 */

/**
 * Warm cache for all artists with progress tracking
 */
async function warmCache() {
  const elements = {
    button: document.getElementById('warmCacheBtn'),
    progressContainer: document.getElementById('artist-cache-progress'),
    progressBar: document.getElementById('artist-cache-progress-bar'),
    progressPercent: document.getElementById('artist-cache-progress-percent'),
    progressMessage: document.getElementById('artist-cache-progress-message'),
    progressEta: document.getElementById('artist-cache-progress-eta')
  };

  await window.jobMonitor.startCacheWarming('artist', elements);
}

/**
 * Warm album cache for all albums with progress tracking
 */
async function warmAlbumCache() {
  const elements = {
    button: document.getElementById('warmAlbumCacheBtn'),
    progressContainer: document.getElementById('album-cache-progress'),
    progressBar: document.getElementById('album-cache-progress-bar'),
    progressPercent: document.getElementById('album-cache-progress-percent'),
    progressMessage: document.getElementById('album-cache-progress-message'),
    progressEta: document.getElementById('album-cache-progress-eta')
  };

  await window.jobMonitor.startCacheWarming('album', elements);
}

/**
 * Clear all cache entries with confirmation
 */
async function confirmClearAll(totalCount) {
  if (!confirm(`Are you sure you want to clear ALL cache entries? This will remove ${totalCount} cached items and may slow down playlist generation until the cache is rebuilt.`)) {
    return;
  }

  const btn = document.getElementById('clearAllBtn');
  const status = document.getElementById('action-status');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Clearing...';

  try {
    const response = await fetch('/actions/cache/clear-all', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      btn.innerHTML = '✓ Cleared';
      status.innerHTML = '<p style="color: var(--pico-ins-color);">✓ Cleared ' + data.deleted + ' cache entries. Reloading...</p>';
      setTimeout(() => window.location.reload(), 1500);
    } else {
      throw new Error(data.error || 'Failed to clear cache');
    }
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    btn.disabled = false;
    status.innerHTML = '<p style="color: var(--pico-del-color);">✗ ' + err.message + '</p>';
    setTimeout(() => {
      btn.innerHTML = originalText;
      status.innerHTML = '';
    }, 3000);
  }
}

// Expose functions globally
window.warmCache = warmCache;
window.warmAlbumCache = warmAlbumCache;
window.confirmClearAll = confirmClearAll;
