import { waitForI18n, formatTimeAgo, truncateText, getTextIcon, getTextTypeLabel, showToast } from './utils.js';
import { copyToClipboard, deleteHistoryItem, togglePin, getClipboardHistory, getFilteredHistory, getSearchQuery, loadClipboardHistory, loadMoreItems, canLoadMore, getIsLoading, getTotalCount, hasActiveFilter, canLoadMoreFiltered, loadMoreFilteredItems } from './clipboard.js';

const { invoke } = window.__TAURI__.core || {};

// Autostart plugin API
let autostartAPI = null;
if (window.__TAURI__.plugins && window.__TAURI__.plugins.autostart) {
  autostartAPI = window.__TAURI__.plugins.autostart;
}

// DOM Elements
export const elements = {
  historyList: document.getElementById("history-list"),
  refreshBtn: document.getElementById("refresh"),
  clearAllBtn: document.getElementById("clear-all"),
  searchInput: document.getElementById("search-input"),
  clearSearchBtn: document.getElementById("clear-search"),
  totalItems: document.getElementById("total-items"),
  loading: document.getElementById("loading"),
  emptyState: document.getElementById("empty-state"),
  noResults: document.getElementById("no-results"),
  toast: document.getElementById("toast"),
  // Navigation
  historyTab: document.getElementById("history-tab"),
  importexportTab: document.getElementById("importexport-tab"),
  settingsTab: document.getElementById("settings-tab"),
  historyPage: document.getElementById("history-page"),
  settingsPage: document.getElementById("settings-page"),
  // Settings
  autostartCheckbox: document.getElementById("autostart-enabled"),
  themeSelector: document.getElementById("theme-selector")
};

// i18n
let i18n;

export function initI18n() {
  const originalI18n = window.i18n;
  i18n = {
    t: originalI18n.t,
    tSync: originalI18n.tSync,
    setLanguage: originalI18n.setLanguage,
    getCurrentLanguage: originalI18n.getCurrentLanguage,
    getSupportedLanguages: originalI18n.getSupportedLanguages,
    updateCurrentLanguageUI: originalI18n.updateCurrentLanguageUI
  };
  window.i18n = i18n;
  
  initNavigation();
  initSettings();
  initImportExport();
  updatePageTexts();
}

// Navigation
export function initNavigation() {
  if (elements.historyTab) elements.historyTab.addEventListener('click', () => switchPage('history'));
  if (elements.importexportTab) elements.importexportTab.addEventListener('click', () => switchPage('importexport'));
  if (elements.settingsTab) elements.settingsTab.addEventListener('click', () => switchPage('settings'));
}

export function switchPage(pageName) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(tab => tab.classList.remove('active'));
  
  const targetPage = document.getElementById(`${pageName}-page`);
  const targetTab = document.getElementById(`${pageName}-tab`);
  
  if (targetPage) targetPage.classList.add('active');
  if (targetTab) targetTab.classList.add('active');
  
  if (pageName === 'history') {
    loadClipboardHistory();
  } else if (pageName === 'settings') {
    loadSettings();
  }
}

// Settings
export function initSettings() {
  // Theme buttons
  if (elements.themeSelector) {
    const themeButtons = elements.themeSelector.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const theme = this.dataset.theme;
        themeButtons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        applyTheme(theme);
        localStorage.setItem('theme', theme);
      });
    });
  }
  
  // Autostart toggle
  if (elements.autostartCheckbox) {
    elements.autostartCheckbox.addEventListener('change', async function() {
      try {
        if (this.checked) {
          if (autostartAPI && autostartAPI.enable) {
            await autostartAPI.enable();
          } else {
            await invoke('plugin:autostart|enable');
          }
          showToast('Autostart enabled', 'success');
        } else {
          if (autostartAPI && autostartAPI.disable) {
            await autostartAPI.disable();
          } else {
            await invoke('plugin:autostart|disable');
          }
          showToast('Autostart disabled', 'success');
        }
      } catch (error) {
        console.error('Autostart error:', error);
        this.checked = !this.checked;
      }
    });
  }
}

export async function loadSettings() {
  // Load current theme
  const currentTheme = localStorage.getItem('theme') || 'auto';
  if (elements.themeSelector) {
    elements.themeSelector.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
  }
  
  // Load autostart status
  if (elements.autostartCheckbox) {
    try {
      let enabled = false;
      if (autostartAPI && autostartAPI.isEnabled) {
        enabled = await autostartAPI.isEnabled();
      } else {
        try {
          enabled = await invoke('plugin:autostart|is_enabled');
        } catch (e) {
          enabled = false;
        }
      }
      elements.autostartCheckbox.checked = enabled;
    } catch (error) {
      elements.autostartCheckbox.checked = false;
    }
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  
  if (theme === 'light') {
    root.classList.add('theme-light');
  } else if (theme === 'dark') {
    root.classList.add('theme-dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('theme-dark');
    }
  }
}

// Initialize theme on load
const savedTheme = localStorage.getItem('theme') || 'auto';
applyTheme(savedTheme);

// Update texts
export async function updatePageTexts() {
  await waitForI18n();
  
  // data-i18n attribute'larını otomatik çevir
  const i18nElements = document.querySelectorAll('[data-i18n]');
  for (const el of i18nElements) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const translated = await window.i18n.t(key);
      if (translated && translated !== key) {
        el.textContent = translated;
      }
    }
  }
  
  // data-i18n-placeholder için
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholderElements) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      const translated = await window.i18n.t(key);
      if (translated && translated !== key) {
        el.placeholder = translated;
      }
    }
  }
  
  // Navigation
  const historyTab = document.querySelector('#history-tab span');
  const importexportTab = document.querySelector('#importexport-tab span');
  const settingsTab = document.querySelector('#settings-tab span');
  
  if (historyTab) historyTab.textContent = await window.i18n.t('navigation.history');
  if (importexportTab) importexportTab.textContent = await window.i18n.t('navigation.importexport');
  if (settingsTab) settingsTab.textContent = await window.i18n.t('navigation.settings');
  
  // Search
  if (elements.searchInput) {
    elements.searchInput.placeholder = await window.i18n.t('search.placeholder');
  }
  
  // Loading states
  const loadingText = document.querySelector('#loading p');
  const emptyTitle = document.querySelector('#empty-state h3');
  const emptyText = document.querySelector('#empty-state p');
  const noResultsTitle = document.querySelector('#no-results h3');
  const noResultsText = document.querySelector('#no-results p');
  
  if (loadingText) loadingText.textContent = await window.i18n.t('loading.message');
  if (emptyTitle) emptyTitle.textContent = await window.i18n.t('empty_state.title');
  if (emptyText) emptyText.textContent = await window.i18n.t('empty_state.message');
  if (noResultsTitle) noResultsTitle.textContent = await window.i18n.t('no_results.title');
  if (noResultsText) noResultsText.textContent = await window.i18n.t('no_results.message');
  
  // Re-render history
  await renderHistory();
}

// Create history item
export async function createHistoryItem(item, index) {
  await waitForI18n();
  const div = document.createElement("div");
  div.className = "history-item fade-in";
  div.style.animationDelay = `${index * 0.05}s`;
  
  const timeAgo = await formatTimeAgo(item.created_at);
  const typeLabel = await getTextTypeLabel(item.content, item.content_type);
  const textIcon = getTextIcon(item.content, item.content_type);
  
  const copyText = await window.i18n.t('clipboard.copy');
  const deleteText = await window.i18n.t('clipboard.delete');
  const pinText = item.pinned ? await window.i18n.t('clipboard.unpin') : await window.i18n.t('clipboard.pin');
  
  // Content
  let contentHtml = '';
  if (item.content_type === 'image' && item.image_data) {
    contentHtml = `<img src="data:image/png;base64,${item.image_data}" alt="Image" class="image-preview" />`;
  } else {
    contentHtml = `<div class="content line-clamp-3">${escapeHtml(item.content)}</div>`;
  }
  
  div.innerHTML = `
    ${item.pinned ? '<i class="fas fa-thumbtack pin-badge"></i>' : ''}
    ${contentHtml}
    <div class="meta">
      <span class="meta-item"><i class="fas fa-clock"></i>${timeAgo}</span>
      <span class="meta-item"><i class="${textIcon}"></i>${typeLabel}</span>
      <span class="meta-item"><i class="fas fa-text-width"></i>${item.content.length}</span>
      <div class="actions">
        <button class="action-btn pin ${item.pinned ? 'pinned' : ''}" title="${pinText}">
          <i class="fas fa-thumbtack"></i>
        </button>
        <button class="action-btn copy" title="${copyText}">
          <i class="fas fa-copy"></i>
        </button>
        <button class="action-btn delete" title="${deleteText}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
  
  // Events
  const pinBtn = div.querySelector('.action-btn.pin');
  const copyBtn = div.querySelector('.action-btn.copy');
  const deleteBtn = div.querySelector('.action-btn.delete');
  
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(item.id);
  });
  
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(item.content, item.content_type, item.image_data);
  });
  
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showDeleteConfirmation(item);
  });
  
  div.addEventListener('click', () => {
    showMessageModal(item);
  });
  
  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Delete confirmation
export async function showDeleteConfirmation(item) {
  await waitForI18n();
  const title = await window.i18n.t('modal.delete_title');
  const message = await window.i18n.t('modal.delete_message');
  const cancel = await window.i18n.t('modal.cancel');
  const confirm = await window.i18n.t('modal.confirm');
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3><i class="fas fa-triangle-exclamation" style="color: var(--danger)"></i> ${title}</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
        <div class="content-preview">${escapeHtml(truncateText(item.content, 150))}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-delete">${cancel}</button>
        <button class="btn btn-danger" id="confirm-delete">${confirm}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#cancel-delete').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#confirm-delete').addEventListener('click', async () => {
    await deleteHistoryItem(item.id);
    document.body.removeChild(modal);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) document.body.removeChild(modal);
  });
}

// Message modal
export async function showMessageModal(item) {
  await waitForI18n();
  const copyText = await window.i18n.t('clipboard.copy');
  const deleteText = await window.i18n.t('clipboard.delete');
  const pinText = item.pinned ? await window.i18n.t('clipboard.unpin') : await window.i18n.t('clipboard.pin');
  
  const timeAgo = await formatTimeAgo(item.created_at);
  const typeLabel = await getTextTypeLabel(item.content, item.content_type);
  const textIcon = getTextIcon(item.content, item.content_type);
  
  // Resim için farklı modal class'ı kullan
  const isImage = item.content_type === 'image' && item.image_data;
  const modalClass = isImage ? 'modal message-modal image-modal' : 'modal message-modal';
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="${modalClass}">
      <div class="modal-header">
        <h3><i class="${textIcon}" style="color: var(--accent)"></i> ${typeLabel}</h3>
        <button class="btn-icon" id="close-modal"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="${isImage ? 'content-preview' : 'message-content'}">
          ${isImage
            ? `<img src="data:image/png;base64,${item.image_data}" alt="Image" />`
            : `<pre>${escapeHtml(item.content)}</pre>`}
        </div>
        ${!isImage ? `
        <div class="message-meta">
          <span class="meta-item"><i class="fas fa-clock"></i>${timeAgo}</span>
          <span class="meta-item"><i class="fas fa-text-width"></i>${item.content.length} chars</span>
        </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="modal-pin">
          <i class="fas fa-thumbtack"></i> ${pinText}
        </button>
        <button class="btn btn-primary" id="modal-copy">
          <i class="fas fa-copy"></i> ${copyText}
        </button>
        <button class="btn btn-danger" id="modal-delete">
          <i class="fas fa-trash"></i> ${deleteText}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#close-modal').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#modal-pin').addEventListener('click', async () => {
    await togglePin(item.id);
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#modal-copy').addEventListener('click', () => {
    copyToClipboard(item.content, item.content_type, item.image_data);
  });
  
  modal.querySelector('#modal-delete').addEventListener('click', async () => {
    document.body.removeChild(modal);
    await showDeleteConfirmation(item);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) document.body.removeChild(modal);
  });
}

// Render history
let renderedCount = 0;

export async function renderHistory(appendMode = false) {
  await waitForI18n();
  
  const hasFilterOrSearch = hasActiveFilter() || getSearchQuery();
  const itemsToRender = hasFilterOrSearch ? getFilteredHistory() : getClipboardHistory();
  
  if (!appendMode) {
    elements.historyList.innerHTML = '';
    renderedCount = 0;
    removeLoadingIndicator();
  }
  
  if (itemsToRender.length === 0) {
    if (getSearchQuery()) {
      elements.noResults.style.display = 'flex';
      elements.emptyState.style.display = 'none';
    } else {
      elements.emptyState.style.display = 'flex';
      elements.noResults.style.display = 'none';
    }
    return;
  }
  
  elements.emptyState.style.display = 'none';
  elements.noResults.style.display = 'none';
  
  const startIndex = appendMode ? renderedCount : 0;
  for (let i = startIndex; i < itemsToRender.length; i++) {
    const div = await createHistoryItem(itemsToRender[i], i);
    elements.historyList.appendChild(div);
  }
  renderedCount = itemsToRender.length;
  
  // Loading indicator kontrolü (hasFilterOrSearch zaten yukarıda tanımlı)
  if (hasFilterOrSearch) {
    // Filtreli modda - canLoadMoreFiltered kontrolü
    if (canLoadMoreFiltered()) {
      addLoadingIndicator();
    } else {
      removeLoadingIndicator();
    }
  } else {
    // Normal modda
    if (canLoadMore()) {
      addLoadingIndicator();
    } else {
      removeLoadingIndicator();
    }
  }
}

function addLoadingIndicator() {
  removeLoadingIndicator();
  const indicator = document.createElement('div');
  indicator.id = 'scroll-loading';
  indicator.className = 'scroll-loading';
  indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading more...';
  elements.historyList.parentElement.appendChild(indicator);
}

function removeLoadingIndicator() {
  const existing = document.getElementById('scroll-loading');
  if (existing) existing.remove();
}

// Infinite scroll - hem normal hem filtreli mod için
export function setupInfiniteScroll() {
  const container = document.querySelector('.content-area');
  if (!container) return;
  
  container.addEventListener('scroll', async () => {
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isFilterOrSearch = hasActiveFilter() || getSearchQuery();
    
    if (scrollBottom < 200) {
      if (isFilterOrSearch && canLoadMoreFiltered()) {
        // Filtreli lazy load
        await loadMoreFilteredItems();
      } else if (!isFilterOrSearch && canLoadMore()) {
        // Normal lazy load
        await loadMoreItems();
        await renderHistory(true);
        updateStats();
      }
    }
  });
}

export function updateStats() {
  const hasFilterOrSearch = hasActiveFilter() || getSearchQuery();
  const itemsToCount = hasFilterOrSearch ? getFilteredHistory() : getClipboardHistory();
  const total = getTotalCount();
  
  if (total > 0 && itemsToCount.length < total && !getSearchQuery()) {
    elements.totalItems.textContent = `${itemsToCount.length}/${total}`;
  } else {
    elements.totalItems.textContent = itemsToCount.length;
  }
}

// Import/Export
export function initImportExport() {
  const exportBtn = document.getElementById('export-json');
  const importBtn = document.getElementById('import-json');
  const importFile = document.getElementById('import-file');
  
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const json = await invoke('export_clipboard_history');
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clipboard_history.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        showToast('Export successful!', 'success');
      } catch (e) {
        showToast('Export failed', 'error');
        console.error('Export error:', e);
      }
    });
  }
  
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => {
      importFile.value = '';
      importFile.click();
    });
    
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const json = ev.target.result;
          const count = await invoke('import_clipboard_history', { jsonData: json });
          showToast(`Imported ${count} items!`, 'success');
          await loadClipboardHistory();
        } catch (err) {
          showToast('Import failed', 'error');
        }
      };
      reader.readAsText(file);
    });
  }
}

// Global exports
window.updatePageTexts = updatePageTexts;
window.switchPage = switchPage;
