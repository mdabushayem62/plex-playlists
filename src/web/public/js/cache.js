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

/**
 * Sync AudioMuse features with progress tracking
 */
async function syncAudioMuse() {
  const elements = {
    button: document.getElementById('syncAudioMuseBtn'),
    progressContainer: document.getElementById('audiomuse-sync-progress'),
    progressBar: document.getElementById('audiomuse-sync-progress-bar'),
    progressPercent: document.getElementById('audiomuse-sync-progress-percent'),
    progressMessage: document.getElementById('audiomuse-sync-progress-message'),
    progressEta: document.getElementById('audiomuse-sync-progress-eta')
  };

  const btn = elements.button;
  const status = document.getElementById('action-status');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '⏳ Starting...';
  elements.progressContainer.style.display = 'block';

  try {
    // Start the sync
    const response = await fetch('/actions/audiomuse/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, forceResync: false })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start sync');
    }

    // Monitor progress via SSE
    const jobId = data.jobId;
    let progressPercent = 0;

    const eventSource = new EventSource(`/actions/jobs/${jobId}/stream`);

    eventSource.onmessage = (event) => {
      const job = JSON.parse(event.data);

      if (job.progress) {
        progressPercent = job.progress.percent || 0;
        elements.progressBar.value = progressPercent;
        elements.progressPercent.textContent = Math.round(progressPercent) + '%';
        elements.progressMessage.textContent = job.progress.message || 'Syncing...';
        if (job.progress.eta) {
          elements.progressEta.textContent = 'ETA: ' + job.progress.eta;
        }
      }

      if (job.status === 'success') {
        btn.innerHTML = '✓ Synced';
        status.innerHTML = '<p style="color: var(--pico-ins-color);">✓ AudioMuse sync complete! Reloading...</p>';
        eventSource.close();
        setTimeout(() => window.location.reload(), 1500);
      } else if (job.status === 'failed') {
        btn.innerHTML = '✗ Failed';
        btn.disabled = false;
        status.innerHTML = `<p style="color: var(--pico-del-color);">✗ Sync failed: ${job.error || 'Unknown error'}</p>`;
        elements.progressContainer.style.display = 'none';
        eventSource.close();
        setTimeout(() => {
          btn.innerHTML = originalText;
          status.innerHTML = '';
        }, 5000);
      }
    };

    eventSource.onerror = () => {
      // Connection lost - check final status
      fetch(`/actions/jobs/${jobId}`)
        .then(res => res.json())
        .then(job => {
          if (job.status === 'success') {
            btn.innerHTML = '✓ Synced';
            status.innerHTML = '<p style="color: var(--pico-ins-color);">✓ AudioMuse sync complete! Reloading...</p>';
            setTimeout(() => window.location.reload(), 1500);
          } else if (job.status === 'failed') {
            btn.innerHTML = '✗ Failed';
            btn.disabled = false;
            status.innerHTML = `<p style="color: var(--pico-del-color);">✗ Sync failed: ${job.error || 'Unknown error'}</p>`;
            elements.progressContainer.style.display = 'none';
          }
        });
      eventSource.close();
    };
  } catch (err) {
    btn.innerHTML = '✗ Failed';
    btn.disabled = false;
    status.innerHTML = '<p style="color: var(--pico-del-color);">✗ ' + err.message + '</p>';
    elements.progressContainer.style.display = 'none';
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
window.syncAudioMuse = syncAudioMuse;
