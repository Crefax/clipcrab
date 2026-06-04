import { elements, setupInfiniteScroll, moveHistorySelection, openSelectedHistoryItem, copySelectedHistoryItem, deleteSelectedHistoryItem, toggleSelectedPin, quickPickHistoryItem } from './ui.js';
import { clearAllHistory, setSearchQuery, toggleContentFilter, getActiveFilters, requestHistoryRefresh, markHistoryDirty, refreshAfterShow } from './clipboard.js';
import { showToast } from './utils.js';

const { invoke } = window.__TAURI__.core;

// Event Handlers
export function handleClipboardUpdate(eventData) {
  if (eventData.action === 'refresh') {
    if (document.hidden) {
      markHistoryDirty();
      return;
    }

    requestHistoryRefresh();
    if (eventData.message && notificationsEnabled()) {
      showToast(eventData.message, 'success');
    }
  }
}

function notificationsEnabled() {
  try {
    const stored = localStorage.getItem('clipcrab_settings');
    if (!stored) return true;
    return JSON.parse(stored).showNotifications !== false;
  } catch {
    return true;
  }
}

// Event Listeners
export function setupEventListeners() {
  // Clipboard update event listener
  window.__TAURI__.event.listen('clipboard-update', (event) => {
    handleClipboardUpdate(event.payload);
  }).catch(error => {
    console.error('Event listener error:', error);
  });
  
  // Refresh button
  elements.refreshBtn.addEventListener("click", () => requestHistoryRefresh({ force: true, delay: 0 }));
  
  // Clear all button
  elements.clearAllBtn.addEventListener("click", clearAllHistory);
  
  // Search functionality
  elements.searchInput.addEventListener("input", (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    // Clear butonunu göster/gizle
    if (elements.clearSearchBtn) {
      elements.clearSearchBtn.style.display = value.length > 0 ? 'flex' : 'none';
    }
  });
  
  elements.clearSearchBtn.addEventListener("click", () => {
    elements.searchInput.value = '';
    setSearchQuery('');
    if (elements.clearSearchBtn) {
      elements.clearSearchBtn.style.display = 'none';
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.querySelector('.modal-overlay');
      if (modal) {
        modal.remove();
        return;
      }
    }

    // Ctrl/Cmd + F for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      elements.searchInput.focus();
    }
    
    // Ctrl/Cmd + R for refresh
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      requestHistoryRefresh({ force: true, delay: 0 });
    }
    
    // Escape to clear search
    if (e.key === 'Escape' && document.activeElement === elements.searchInput) {
      elements.searchInput.value = '';
      setSearchQuery('');
      elements.searchInput.blur();
      return;
    }

    const isTypingTarget = ['INPUT', 'TEXTAREA'].includes(e.target?.tagName);
    if (isTypingTarget) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHistorySelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHistorySelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        copySelectedHistoryItem();
      } else {
        copySelectedHistoryItem().then(() => invoke('hide_frontend').catch(() => {}));
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteSelectedHistoryItem();
    } else if (e.key.toLowerCase() === 'p') {
      e.preventDefault();
      toggleSelectedPin();
    } else if (e.key === ' ') {
      e.preventDefault();
      openSelectedHistoryItem();
    } else if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      quickPickHistoryItem(Number(e.key)).then(() => invoke('hide_frontend').catch(() => {}));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      invoke('hide_frontend').catch(() => {});
    }
  });
  
  // Infinite scroll kurulumu
  setupInfiniteScroll();
  
  // Kategori filtre butonları
  setupFilterButtons();

  window.__TAURI__.event.listen('app-window-shown', () => {
    refreshAfterShow();
  }).catch(error => {
    console.error('Window show listener error:', error);
  });

  window.__TAURI__.event.listen('app-window-hidden', () => {
    markHistoryDirty();
  }).catch(error => {
    console.error('Window hide listener error:', error);
  });

  window.__TAURI__.event.listen('quick-open-search', () => {
    window.switchPage?.('history');
    refreshAfterShow();
    requestAnimationFrame(() => {
      elements.searchInput?.focus();
      elements.searchInput?.select();
    });
  }).catch(error => {
    console.error('Quick open listener error:', error);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      markHistoryDirty();
    } else {
      refreshAfterShow();
    }
  });

  window.addEventListener('focus', () => {
    refreshAfterShow();
  });
}

// Filtre butonlarını ayarla - çoklu seçim destekli
function setupFilterButtons() {
  const filterButtons = document.querySelectorAll('.filter-chip');
  
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = btn.dataset.filter;
      const isCtrlClick = e.ctrlKey || e.metaKey;
      
      if (filter === 'all' || !isCtrlClick) {
        // Normal tıklama veya "all" - tek seçim
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        toggleContentFilter(filter, false);
      } else {
        // Ctrl+tıklama - çoklu seçim
        btn.classList.toggle('active');
        toggleContentFilter(filter, true);
        updateFilterButtonStates();
      }
    });
  });
}

// Filtre buton durumlarını güncelle
function updateFilterButtonStates() {
  const filterButtons = document.querySelectorAll('.filter-chip');
  const activeFilters = getActiveFilters();
  
  filterButtons.forEach(btn => {
    const filter = btn.dataset.filter;
    if (activeFilters.has(filter)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Service Worker for offline support (if needed)
export function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then(registrations => registrations.forEach(registration => registration.unregister()))
      .catch(error => console.error('SW cleanup failed: ', error));
  }
} 
