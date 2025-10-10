/**
 * Cache Management - Client-side functionality
 */

/**
 * Warm cache for all artists
 */
async function warmCache() {
  const btn = document.getElementById('warmCacheBtn');
  const status = document.getElementById('action-status');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Starting...';
  status.innerHTML = '<p style="color: var(--pico-muted-color);">Warming cache for all artists in your library...</p>';

  try {
    const response = await fetch('/actions/cache/warm', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      btn.innerHTML = '✓ Started';
      status.innerHTML = '<p style="color: var(--pico-ins-color);">✓ Cache warming started! This may take several minutes. The page will refresh when complete.</p>';
      setTimeout(() => window.location.reload(), 3000);
    } else {
      throw new Error(data.error || 'Failed to start cache warming');
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

/**
 * Warm album cache for all albums
 */
async function warmAlbumCache() {
  const btn = document.getElementById('warmAlbumCacheBtn');
  const status = document.getElementById('action-status');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Starting...';
  status.innerHTML = '<p style="color: var(--pico-muted-color);">Warming album cache for all albums in your library... This will take 20-30 minutes.</p>';

  try {
    const response = await fetch('/actions/cache/warm-albums', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      btn.innerHTML = '✓ Started';
      status.innerHTML = '<p style="color: var(--pico-ins-color);">✓ Album cache warming started! This will take 20-30 minutes. You can close this page and check back later.</p>';
      setTimeout(() => window.location.reload(), 5000);
    } else {
      throw new Error(data.error || 'Failed to start album cache warming');
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
