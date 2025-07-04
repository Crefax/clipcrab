import { elements } from './ui.js';
import { loadClipboardHistory, clearAllHistory, setSearchQuery, filterHistory } from './clipboard.js';
import { showToast } from './utils.js';

// Event Handlers
export function handleClipboardUpdate(eventData) {
  console.log('Clipboard update event received:', eventData);
  
  if (eventData.action === 'refresh') {
    console.log('Refreshing list...');
    // Listeyi yenile
    loadClipboardHistory();
    showToast(eventData.message, 'success');
  }
}

// Event Listeners
export function setupEventListeners() {
  // Clipboard update event listener
  console.log('Setting up event listeners...');
  window.__TAURI__.event.listen('clipboard-update', (event) => {
    console.log('Event received:', event);
    handleClipboardUpdate(event.payload);
  }).catch(error => {
    console.error('Event listener error:', error);
  });
  
  // Refresh button
  elements.refreshBtn.addEventListener("click", loadClipboardHistory);
  
  // Clear all button
  elements.clearAllBtn.addEventListener("click", clearAllHistory);
  
  // Search functionality
  elements.searchInput.addEventListener("input", (e) => {
    setSearchQuery(e.target.value);
  });
  
  elements.clearSearchBtn.addEventListener("click", () => {
    elements.searchInput.value = '';
    setSearchQuery('');
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + F for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      elements.searchInput.focus();
    }
    
    // Ctrl/Cmd + R for refresh
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      loadClipboardHistory();
    }
    
    // Escape to clear search
    if (e.key === 'Escape' && document.activeElement === elements.searchInput) {
      elements.searchInput.value = '';
      setSearchQuery('');
      elements.searchInput.blur();
    }
  });
}

// Service Worker for offline support (if needed)
export function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('SW registered: ', registration);
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
} 