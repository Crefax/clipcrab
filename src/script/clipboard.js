import { showToast, waitForI18n } from './utils.js';

const { invoke } = window.__TAURI__.core;

// Global state
let clipboardHistory = [];
let filteredHistory = [];
let searchQuery = '';

// Clipboard Functions
export async function copyToClipboard(text, contentType, imageData) {
  try {
    if (contentType === 'image' && imageData) {
      // Resmi clipboard'a kopyala
      const response = await fetch(`data:image/png;base64,${imageData}`);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      showToast(await window.i18n.t('clipboard.image_copied'), 'success');
    } else {
      // Metni clipboard'a kopyala
      await navigator.clipboard.writeText(text);
      showToast(await window.i18n.t('clipboard.text_copied'), 'success');
    }
  } catch (error) {
    console.error('Copy error:', error);
    showToast(await window.i18n.t('errors.copy_failed'), 'error');
  }
}

export async function loadClipboardHistory() {
  const elements = getElements();
  try {
    elements.loading.style.display = 'flex';
    elements.historyList.innerHTML = '';
    
    const history = await invoke("get_clipboard_history");
    clipboardHistory = history;
    
    elements.loading.style.display = 'none';
    filterHistory();
    
    console.log(`${history.length} items loaded`);
  } catch (error) {
    console.error("Failed to get clipboard history:", error);
    elements.loading.style.display = 'none';
    showToast('Failed to load history!', 'error');
  }
}

export async function clearAllHistory() {
  await waitForI18n();
  // Tüm metinleri await ile çek
  const title = window.i18n ? await window.i18n.t('header.clear_all') : 'Clear All History';
  const message = window.i18n ? await window.i18n.t('modal.delete_message') : 'Are you sure you want to delete all clipboard history?';
  const warning = window.i18n ? await window.i18n.t('modal.clear_warning') : 'This action cannot be undone!';
  const cancel = window.i18n ? await window.i18n.t('modal.cancel') : 'Cancel';
  const confirm = window.i18n ? await window.i18n.t('clipboard.delete') : 'Delete All';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3><i class="fas fa-exclamation-triangle"></i> ${title}</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
        <p><strong>${warning}</strong></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-clear">${cancel}</button>
        <button class="btn btn-danger" id="confirm-clear">${confirm}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  modal.querySelector('#cancel-clear').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#confirm-clear').addEventListener('click', async () => {
    try {
      await invoke("clear_all_history");
      document.body.removeChild(modal);
      // Event handler will update UI
    } catch (error) {
      console.error('Error clearing history:', error);
      showToast('Failed to clear history!', 'error');
    }
  });
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

export async function deleteHistoryItem(id) {
  try {
    await invoke("delete_clipboard_item", { id });
    // Event handler will update UI
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Delete operation failed!', 'error');
    throw error;
  }
}

export function filterHistory() {
  if (!searchQuery.trim()) {
    filteredHistory = [...clipboardHistory];
  } else {
    filteredHistory = clipboardHistory.filter(item => 
      item.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }
  renderHistory();
  updateStats();
}

export function setSearchQuery(query) {
  searchQuery = query;
  filterHistory();
}

export function getClipboardHistory() {
  return clipboardHistory;
}

export function getFilteredHistory() {
  return filteredHistory;
}

export function getSearchQuery() {
  return searchQuery;
}

// Helper function to get DOM elements
function getElements() {
  return {
    historyList: document.getElementById("history-list"),
    loading: document.getElementById("loading"),
    totalItems: document.getElementById("total-items"),
    lastUpdated: document.getElementById("last-updated")
  };
}

// Import these functions from ui.js
import { renderHistory, updateStats } from './ui.js'; 