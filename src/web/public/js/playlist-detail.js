/**
 * Playlist detail page JavaScript
 * Handles regeneration confirmation and keyboard navigation
 */

/**
 * Regenerate playlist with confirmation dialog
 */
function confirmRegenerate() {
  const btn = document.getElementById('regenerateBtn');
  const originalText = btn.innerHTML;

  // First click: show confirmation
  if (btn.innerHTML === originalText) {
    btn.innerHTML = '⚠️ Confirm Regenerate?';
    btn.style.background = 'var(--pico-del-color)';
    btn.setAttribute('data-confirming', 'true');

    // Reset after 3 seconds if not confirmed
    setTimeout(() => {
      if (btn.getAttribute('data-confirming') === 'true') {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.removeAttribute('data-confirming');
      }
    }, 3000);
  }
  // Second click: execute regeneration
  else if (btn.getAttribute('data-confirming') === 'true') {
    btn.disabled = true;
    btn.innerHTML = '⏳ Regenerating...';
    btn.style.background = '';
    btn.removeAttribute('data-confirming');

    // Get window from button data attribute
    const window = btn.getAttribute('data-window');

    // Call the regenerate endpoint
    fetch(`/actions/generate/${window}`, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        btn.innerHTML = '✓ Started';
        showToast('Playlist regeneration started! This page will refresh when complete.', 'success');

        // Monitor job progress via SSE
        if (data.jobId) {
          const eventSource = new EventSource(`/actions/jobs/${data.jobId}/stream`);

          eventSource.onmessage = (event) => {
            const job = JSON.parse(event.data);

            if (job.status !== 'running') {
              eventSource.close();

              if (job.status === 'success') {
                showToast('Playlist regenerated successfully! Reloading...', 'success');
                setTimeout(() => window.location.reload(), 2000);
              } else {
                btn.innerHTML = '✗ Failed';
                btn.disabled = false;
                showToast('Playlist regeneration failed. Check job history for details.', 'error');
                setTimeout(() => { btn.innerHTML = originalText; }, 3000);
              }
            }
          };

          eventSource.onerror = () => {
            console.error('SSE connection error');
            eventSource.close();
          };
        }
      })
      .catch(error => {
        btn.innerHTML = '✗ Failed';
        btn.disabled = false;
        showToast('Failed to start regeneration: ' + error.message, 'error');
        setTimeout(() => { btn.innerHTML = originalText; }, 3000);
      });
  }
}

/**
 * Delete playlist with confirmation dialog
 */
function confirmDelete() {
  const btn = document.getElementById('deleteBtn');
  const originalText = btn.innerHTML;

  // First click: show confirmation
  if (btn.innerHTML === originalText) {
    btn.innerHTML = '⚠️ Confirm Delete?';
    btn.style.background = 'var(--pico-del-color)';
    btn.setAttribute('data-confirming', 'true');

    // Reset after 3 seconds if not confirmed
    setTimeout(() => {
      if (btn.getAttribute('data-confirming') === 'true') {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.removeAttribute('data-confirming');
      }
    }, 3000);
  }
  // Second click: execute deletion
  else if (btn.getAttribute('data-confirming') === 'true') {
    btn.disabled = true;
    btn.innerHTML = '⏳ Deleting...';
    btn.style.background = '';
    btn.removeAttribute('data-confirming');

    // Get playlist ID from button data attribute
    const playlistId = btn.getAttribute('data-playlist-id');

    // Call the delete endpoint
    fetch(`/playlists/${playlistId}`, { method: 'DELETE' })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          btn.innerHTML = '✓ Deleted';
          showToast('Playlist deleted successfully! Redirecting...', 'success');
          setTimeout(() => {
            window.location.href = '/playlists';
          }, 1500);
        } else {
          throw new Error(data.error || 'Deletion failed');
        }
      })
      .catch(error => {
        btn.innerHTML = '✗ Failed';
        btn.disabled = false;
        showToast('Failed to delete playlist: ' + error.message, 'error');
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '';
        }, 3000);
      });
  }
}

/**
 * Keyboard navigation for previous/next playlists
 */
document.addEventListener('keydown', (e) => {
  // Left arrow = previous
  if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
    const prevBtn = document.querySelector('a[href*="/playlists/"]');
    if (prevBtn && prevBtn.textContent.includes('Previous')) {
      window.location.href = prevBtn.href;
    }
  }
  // Right arrow = next
  if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
    const nextBtns = Array.from(document.querySelectorAll('a[href*="/playlists/"]'));
    const nextBtn = nextBtns.find(btn => btn.textContent.includes('Next'));
    if (nextBtn) {
      window.location.href = nextBtn.href;
    }
  }
});

// Expose functions globally
window.confirmRegenerate = confirmRegenerate;
window.confirmDelete = confirmDelete;
