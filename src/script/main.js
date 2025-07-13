import { initI18n, updatePageTexts, loadSettings, applyTheme, applyCompactMode, getStoredSettings } from './ui.js';
import { loadClipboardHistory } from './clipboard.js';
import { setupEventListeners, setupServiceWorker } from './events.js';

// Main initialization
window.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings first
  const settings = getStoredSettings();
  
  // Apply theme and compact mode immediately
  applyTheme(settings.theme || 'auto');
  applyCompactMode(settings.compactMode || false);
  
  // Initialize i18n
  initI18n();
  
  // Wait for i18n to be ready and update page texts
  await updatePageTexts();
  
  // Load clipboard history
  loadClipboardHistory();
  
  // Setup event listeners
  setupEventListeners();
  
  // Setup service worker
  setupServiceWorker();
});
