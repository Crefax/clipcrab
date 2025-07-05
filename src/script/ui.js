import { waitForI18n, formatTimeAgo, truncateText, getTextIcon, getTextTypeLabel, showToast } from './utils.js';
import { copyToClipboard, deleteHistoryItem, togglePin, getClipboardHistory, getFilteredHistory, getSearchQuery } from './clipboard.js';

// DOM Elements
export const elements = {
  historyList: document.getElementById("history-list"),
  refreshBtn: document.getElementById("refresh"),
  clearAllBtn: document.getElementById("clear-all"),
  searchInput: document.getElementById("search-input"),
  clearSearchBtn: document.getElementById("clear-search"),
  totalItems: document.getElementById("total-items"),
  lastUpdated: document.getElementById("last-updated"),
  loading: document.getElementById("loading"),
  emptyState: document.getElementById("empty-state"),
  noResults: document.getElementById("no-results"),
  toast: document.getElementById("toast")
};

// Dil sistemi
let i18n;

// Dil sistemi başlat
export function initI18n() {
  console.log('initI18n called');
  
  // i18n fonksiyonlarını global olarak erişilebilir yap
  i18n = {
    t: window.i18n.t,
    _: window.i18n._,
    setLanguage: window.i18n.setLanguage,
    getCurrentLanguage: window.i18n.getCurrentLanguage,
    getSupportedLanguages: window.i18n.getSupportedLanguages,
    initLanguageDropdown: window.i18n.initLanguageDropdown,
    updateCurrentLanguage: window.i18n.updateCurrentLanguage
  };
  
  window.i18n = i18n;
  
  console.log('i18n loaded successfully');
  
  // Dil dropdown'ını başlat
  initLanguageDropdown();
  
  // Sayfa metinlerini güncelle
  updatePageTexts();
}

// Sayfa metinlerini güncelle
export async function updatePageTexts() {
  await waitForI18n();
  
  // Header
  document.querySelector('.logo h1').textContent = await window.i18n.t('app.title');
  document.querySelector('#refresh span').textContent = await window.i18n.t('header.refresh');
  document.querySelector('#clear-all span').textContent = await window.i18n.t('header.clear_all');
  
  // Search
  document.querySelector('#search-input').placeholder = await window.i18n.t('search.placeholder');
  
  // Stats
  document.querySelector('.stat-item:nth-child(1) label').textContent = await window.i18n.t('stats.total_items');
  document.querySelector('.stat-item:nth-child(2) label').textContent = await window.i18n.t('stats.last_updated');
  
  // Loading
  document.querySelector('#loading span').textContent = await window.i18n.t('loading.message');
  
  // Empty state
  document.querySelector('#empty-state h3').textContent = await window.i18n.t('empty_state.title');
  document.querySelector('#empty-state p').textContent = await window.i18n.t('empty_state.message');
  
  // No results
  document.querySelector('#no-results h3').textContent = await window.i18n.t('no_results.title');
  document.querySelector('#no-results p').textContent = await window.i18n.t('no_results.message');
  
  // Mevcut clipboard öğelerini yeniden render et
  await renderHistory();
  if (window.i18n && window.i18n.updateCurrentLanguageUI) {
    window.i18n.updateCurrentLanguageUI();
  }
}

// Global olarak erişilebilir yap
window.updatePageTexts = updatePageTexts;

// UI Functions
export async function createHistoryItem(item, index) {
  await waitForI18n();
  const li = document.createElement("li");
  li.className = "history-item fade-in";
  li.style.animationDelay = `${index * 0.1}s`;
  
  const isLongText = item.content.length > 200 && item.content_type !== 'image';
  const textIcon = getTextIcon(item.content, item.content_type);
  const timeAgo = await formatTimeAgo(item.created_at);
  const fullDateTime = new Date(item.created_at).toLocaleString();
  const copyText = await window.i18n.t('clipboard.copy');
  const deleteText = await window.i18n.t('clipboard.delete');
  const expandText = await window.i18n.t('clipboard.expand');
  const collapseText = await window.i18n.t('clipboard.collapse');
  const karakterText = await window.i18n.t('stats.total_items');
  const typeLabel = await getTextTypeLabel(item.content, item.content_type);
  const pinText = await window.i18n.t('clipboard.pin');
  const unpinText = await window.i18n.t('clipboard.unpin');

  // Resim içeriği için özel HTML
  const contentHtml = item.content_type === 'image' && item.image_data 
    ? `<div class="image-content">
         <img src="data:image/png;base64,${item.image_data}" alt="Clipboard image" />
         <div class="image-info">${item.content}</div>
       </div>`
    : `<div class="history-content ${isLongText ? '' : 'expanded'}">${item.content}</div>`;
  
  li.innerHTML = `
    ${contentHtml}
    <div class="history-actions">
      <div class="history-meta">
        <span title="${fullDateTime}"><i class="fas fa-calendar"></i>${timeAgo}</span>
        <span><i class="fas fa-ruler-horizontal"></i>${item.content.length} ${karakterText}</span>
        <span><i class="${textIcon}"></i>${typeLabel}</span>
      </div>
      <div class="history-buttons">
        <button class="btn-pin-icon btn-pin ${item.pinned ? 'pinned' : ''}" title="${item.pinned ? unpinText : pinText}">
          <i class="fas fa-thumbtack"></i>
        </button>
        <button class="btn-small btn-copy" title="${copyText}">
          <i class="fas fa-copy"></i>
          ${copyText}
        </button>
        ${isLongText ? `
          <button class="btn-small btn-expand" title="${expandText}">
            <i class="fas fa-expand-alt"></i>
            ${expandText}
          </button>
        ` : ''}
        <button class="btn-small btn-delete" title="${deleteText}">
          <i class="fas fa-trash"></i>
          ${deleteText}
        </button>
      </div>
    </div>
  `;
  
  // Event listeners
  const pinBtn = li.querySelector('.btn-pin');
  const copyBtn = li.querySelector('.btn-copy');
  const expandBtn = li.querySelector('.btn-expand');
  const deleteBtn = li.querySelector('.btn-delete');
  const content = li.querySelector('.history-content');
  
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(item.id);
  });
  
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(item.content, item.content_type, item.image_data);
  });
  
  if (expandBtn) {
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      content.classList.toggle('expanded');
      const icon = expandBtn.querySelector('i');
      
      if (content.classList.contains('expanded')) {
        expandBtn.innerHTML = `<i class="fas fa-compress-alt"></i> ${collapseText}`;
      } else {
        expandBtn.innerHTML = `<i class="fas fa-expand-alt"></i> ${expandText}`;
      }
    });
  }
  
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showDeleteConfirmation(item);
  });
  
  // Click to copy
  li.addEventListener('click', () => {
    copyToClipboard(item.content, item.content_type, item.image_data);
  });
  
  return li;
}

export async function showDeleteConfirmation(item) {
  await waitForI18n();
  const title = await window.i18n.t('modal.delete_title');
  const message = await window.i18n.t('modal.delete_message');
  const contentLabel = await window.i18n.t('modal.content');
  const cancel = await window.i18n.t('modal.cancel');
  const confirm = await window.i18n.t('modal.confirm');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3><i class="fas fa-exclamation-triangle"></i> ${title}</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
        <div class="preview-content">
          <strong>${contentLabel}</strong>
          <div class="content-preview">${truncateText(item.content, 100)}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-delete">${cancel}</button>
        <button class="btn btn-danger" id="confirm-delete">${confirm}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  modal.querySelector('#cancel-delete').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('#confirm-delete').addEventListener('click', async () => {
    try {
      await deleteHistoryItem(item.id);
      document.body.removeChild(modal);
      // UI zaten deleteHistoryItem içinde güncelleniyor
    } catch (error) {
      showToast('Delete operation failed!', 'error');
    }
  });
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

export async function renderHistory() {
  await waitForI18n();
  const itemsToRender = getSearchQuery() ? getFilteredHistory() : getClipboardHistory();
  
  elements.historyList.innerHTML = '';
  
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
  
  for (let i = 0; i < itemsToRender.length; i++) {
    const li = await createHistoryItem(itemsToRender[i], i);
    elements.historyList.appendChild(li);
  }
}

export function updateStats() {
  const itemsToCount = getSearchQuery() ? getFilteredHistory() : getClipboardHistory();
  elements.totalItems.textContent = itemsToCount.length;
  elements.lastUpdated.textContent = new Date().toLocaleTimeString('tr-TR');
}

// Dil dropdown başlat
export function initLanguageDropdown() {
  if (window.i18n && window.i18n.initLanguageDropdown) {
    window.i18n.initLanguageDropdown();
  }
} 