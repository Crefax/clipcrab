import { initI18n, updatePageTexts } from './ui.js';
import { loadClipboardHistory } from './clipboard.js';
import { setupEventListeners, setupServiceWorker } from './events.js';

// Main initialization
window.addEventListener("DOMContentLoaded", async () => {
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
