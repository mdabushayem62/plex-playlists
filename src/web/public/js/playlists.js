/**
 * Client-side JavaScript for playlists page
 * Handles playlist filtering and search functionality
 */

/**
 * Filter playlists by search query
 */
function filterPlaylists(query) {
  const lowerQuery = query.toLowerCase().trim();

  // Find all playlist sections
  const allSections = document.querySelectorAll('section');
  let dailySection = null;
  let genreSection = null;

  allSections.forEach(section => {
    const h3 = section.querySelector('h3');
    if (h3 && h3.textContent.includes('Daily Playlists')) dailySection = section;
    if (h3 && h3.textContent.includes('Custom Playlists')) genreSection = section;
  });

  let visibleCount = 0;
  let totalCount = 0;

  // Filter daily playlist cards
  if (dailySection) {
    const cards = dailySection.querySelectorAll('article');
    cards.forEach(card => {
      totalCount++;
      const text = card.textContent.toLowerCase();
      const isVisible = !query || text.includes(lowerQuery);
      card.style.display = isVisible ? '' : 'none';
      if (isVisible) visibleCount++;
    });

    const visibleCards = Array.from(cards).filter(c => c.style.display !== 'none');
    if (query && visibleCards.length === 0) {
      dailySection.style.display = 'none';
    } else {
      dailySection.style.display = '';
    }
  }

  // Filter genre playlist rows
  if (genreSection) {
    const rows = genreSection.querySelectorAll('tbody tr');
    rows.forEach(row => {
      totalCount++;
      const text = row.textContent.toLowerCase();
      const isVisible = !query || text.includes(lowerQuery);
      row.style.display = isVisible ? '' : 'none';
      if (isVisible) visibleCount++;
    });

    const visibleRows = Array.from(rows).filter(r => r.style.display !== 'none');
    if (query && visibleRows.length === 0) {
      genreSection.style.display = 'none';
    } else {
      genreSection.style.display = '';
    }
  }

  // Update search results text
  const resultsEl = document.getElementById('searchResults');
  if (resultsEl) {
    if (query) {
      resultsEl.textContent = `Showing ${visibleCount} of ${totalCount} playlists`;
    } else {
      resultsEl.textContent = '';
    }
  }
}

/**
 * Delete a custom playlist definition with two-click confirmation
 */
async function deleteCustomPlaylist(id, name) {
  const btn = event.currentTarget;
  const originalText = btn.innerHTML;

  // First click: show confirmation
  if (!btn.hasAttribute('data-confirming')) {
    btn.innerHTML = '⚠️ Confirm?';
    btn.style.background = 'var(--pico-del-color)';
    btn.setAttribute('data-confirming', 'true');

    // Reset after 3 seconds if not confirmed
    setTimeout(() => {
      if (btn.hasAttribute('data-confirming')) {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.removeAttribute('data-confirming');
      }
    }, 3000);
    return;
  }

  // Second click: execute deletion
  btn.disabled = true;
  btn.innerHTML = '⏳';
  btn.style.background = '';
  btn.removeAttribute('data-confirming');

  try {
    const response = await fetch(`/playlists/builder/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      btn.innerHTML = '✓';
      showToast('Playlist deleted successfully! Reloading...', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      throw new Error('Failed to delete playlist');
    }
  } catch (error) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    btn.style.background = '';
    showToast(error.message, 'error');
  }
}

/**
 * Delete a generated playlist with two-click confirmation
 * (for playlists in the playlists table, not custom_playlists definitions)
 */
async function deleteGeneratedPlaylist(id, name) {
  const btn = event.currentTarget;
  const originalText = btn.innerHTML;

  // First click: show confirmation
  if (!btn.hasAttribute('data-confirming')) {
    btn.innerHTML = '⚠️ Confirm?';
    btn.style.background = 'var(--pico-del-color)';
    btn.setAttribute('data-confirming', 'true');

    // Reset after 3 seconds if not confirmed
    setTimeout(() => {
      if (btn.hasAttribute('data-confirming')) {
        btn.innerHTML = originalText;
        btn.style.background = '';
        btn.removeAttribute('data-confirming');
      }
    }, 3000);
    return;
  }

  // Second click: execute deletion
  btn.disabled = true;
  btn.innerHTML = '⏳';
  btn.style.background = '';
  btn.removeAttribute('data-confirming');

  try {
    const response = await fetch(`/playlists/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      btn.innerHTML = '✓';
      showToast('Playlist deleted successfully! Reloading...', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      const text = await response.text();
      throw new Error(text || 'Failed to delete playlist');
    }
  } catch (error) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    btn.style.background = '';
    showToast(error.message, 'error');
  }
}

// Expose functions globally for inline event handlers
window.filterPlaylists = filterPlaylists;
window.deleteCustomPlaylist = deleteCustomPlaylist;
window.deleteGeneratedPlaylist = deleteGeneratedPlaylist;
