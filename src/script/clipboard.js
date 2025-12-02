import { showToast, waitForI18n } from './utils.js';

const { invoke } = window.__TAURI__.core;

// Global state
let clipboardHistory = [];
let filteredHistory = [];
let searchQuery = '';
let activeFilters = new Set(['all']); // Çoklu filtre desteği

// Pagination state
let currentOffset = 0;
let isLoading = false;
let hasMore = true;
let totalCount = 0;
const PAGE_SIZE = 50;

// Filtreli pagination state
let filteredOffset = 0;
let filteredHasMore = true;
let isFilteredLoading = false;
const FILTERED_PAGE_SIZE = 30;

// Arama önbelleği
const searchCache = new Map();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL = 60000; // 1 dakika

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

// İlk yükleme - listeyi sıfırlayıp baştan yükle
export async function loadClipboardHistory() {
  const elements = getElements();
  try {
    elements.loading.style.display = 'flex';
    elements.historyList.innerHTML = '';
    
    // State'i sıfırla
    currentOffset = 0;
    clipboardHistory = [];
    hasMore = true;
    
    // Toplam sayıyı al
    totalCount = await invoke("get_clipboard_count");
    
    // İlk sayfayı yükle
    await loadMoreItems();
    
    elements.loading.style.display = 'none';
    
    console.log(`${clipboardHistory.length}/${totalCount} items loaded`);
  } catch (error) {
    console.error("Failed to get clipboard history:", error);
    elements.loading.style.display = 'none';
    showToast('Failed to load history!', 'error');
  }
}

// Daha fazla öğe yükle (infinite scroll için)
export async function loadMoreItems() {
  if (isLoading || !hasMore) return;
  
  const elements = getElements();
  isLoading = true;
  
  try {
    // Ayarlardan max limit değerini al
    const settings = getStoredSettings();
    const maxHistory = settings.maxHistory;
    let maxLimit = 500;
    
    if (maxHistory === 'unlimited') {
      maxLimit = 100000;
    } else if (maxHistory) {
      maxLimit = parseInt(maxHistory, 10);
    }
    
    // Mevcut offset + PAGE_SIZE, maxLimit'ı geçmesin
    const remainingToMax = maxLimit - currentOffset;
    const actualPageSize = Math.min(PAGE_SIZE, remainingToMax);
    
    if (actualPageSize <= 0) {
      hasMore = false;
      isLoading = false;
      return;
    }
    
    const newItems = await invoke("get_clipboard_history", { 
      limit: actualPageSize, 
      offset: currentOffset 
    });
    
    if (newItems.length === 0) {
      hasMore = false;
    } else {
      clipboardHistory = [...clipboardHistory, ...newItems];
      currentOffset += newItems.length;
      
      // Max limite ulaştık mı kontrol et
      if (currentOffset >= maxLimit || newItems.length < actualPageSize) {
        hasMore = false;
      }
    }
    
    filterHistory();
    
  } catch (error) {
    console.error("Failed to load more items:", error);
  } finally {
    isLoading = false;
  }
}

// Infinite scroll için export
export function canLoadMore() {
  return hasMore && !isLoading;
}

export function getIsLoading() {
  return isLoading;
}

export function getTotalCount() {
  return totalCount;
}

// Ayarları al (ui.js'den bağımsız olarak burada da tanımla)
function getStoredSettings() {
  try {
    const stored = localStorage.getItem('clipcrab_settings');
    const defaultSettings = {
      maxHistory: '500',
      autoClear: 'never',
      showNotifications: true,
      soundEnabled: false,
      theme: 'auto',
      compactMode: false
    };
    
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch (error) {
    console.error('Error loading stored settings:', error);
    return {
      maxHistory: '500',
      autoClear: 'never',
      showNotifications: true,
      soundEnabled: false,
      theme: 'auto',
      compactMode: false
    };
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
      // UI'yi hemen güncelle
      await loadClipboardHistory();
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
    // UI'yi hemen güncelle
    await loadClipboardHistory();
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Delete operation failed!', 'error');
    throw error;
  }
}

export async function togglePin(id) {
  try {
    await invoke("toggle_pin", { id });
    // UI'yi hemen güncelle
    await loadClipboardHistory();
  } catch (error) {
    console.error('Pin toggle error:', error);
    showToast('Pin operation failed!', 'error');
    throw error;
  }
}

export function filterHistory(resetPagination = true) {
  const filtersArray = Array.from(activeFilters);
  const hasOnlyAll = filtersArray.length === 1 && filtersArray[0] === 'all';
  
  if (resetPagination) {
    // Yeni filtre - sıfırla
    filteredOffset = 0;
    filteredHistory = [];
    filteredHasMore = true;
  }
  
  if (!searchQuery.trim() && hasOnlyAll) {
    filteredHistory = [...clipboardHistory];
    renderHistory();
    updateStats();
  } else {
    // Arama veya filtre varsa backend'den ara
    searchInDatabase(searchQuery, filtersArray, resetPagination);
  }
}

// Arama loading durumu
let isSearching = false;
export function getIsSearching() {
  return isSearching;
}

// Filtreli lazy load için export
export function canLoadMoreFiltered() {
  return filteredHasMore && !isFilteredLoading && !isSearching;
}

export async function loadMoreFilteredItems() {
  if (!canLoadMoreFiltered()) return;
  
  const filtersArray = Array.from(activeFilters);
  await searchInDatabase(searchQuery, filtersArray, false);
}

// Backend'de arama yap - önbellekli ve optimize
let searchTimeout = null;
let currentSearchId = 0;

async function searchInDatabase(query, filters = ['all'], isNewSearch = true) {
  const searchId = ++currentSearchId;
  
  // Arama için debounce, filtre için hemen çalış
  const hasQuery = query && query.trim().length > 0;
  const delay = (hasQuery && isNewSearch) ? 300 : 0;
  
  // Önceki timeout'u temizle
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  
  // Yeni aramada loading göster
  if (isNewSearch) {
    isSearching = true;
    showSearchLoading();
  } else {
    isFilteredLoading = true;
  }
  
  const executeSearch = async () => {
    // Eğer yeni bir arama başlatıldıysa bu aramayı iptal et
    if (searchId !== currentSearchId) {
      return;
    }
    
    try {
      const filterString = filters.join(',');
      
      // Image filtresi için daha düşük limit (decrypt yavaş)
      const isImageOnly = filters.length === 1 && filters[0] === 'image';
      const searchLimit = isImageOnly ? 20 : FILTERED_PAGE_SIZE;
      const currentFilteredOffset = isNewSearch ? 0 : filteredOffset;
      
      console.log('[DEBUG] Searching:', filterString, 'offset:', currentFilteredOffset, 'limit:', searchLimit);
      
      const results = await invoke("search_clipboard_history", { 
        query: query,
        limit: searchLimit,
        offset: currentFilteredOffset,
        contentFilter: filterString
      });
      
      console.log('[DEBUG] Got results:', results.length);
      
      // Eski arama ise sonucu görmezden gel
      if (searchId !== currentSearchId) {
        return;
      }
      
      // Pagination: append veya replace
      if (isNewSearch) {
        filteredHistory = results;
        filteredOffset = results.length;
      } else {
        filteredHistory = [...filteredHistory, ...results];
        filteredOffset += results.length;
      }
      
      // Daha fazla var mı?
      if (results.length < searchLimit) {
        filteredHasMore = false;
      }
      
      console.log('[DEBUG] Total filtered:', filteredHistory.length, 'hasMore:', filteredHasMore);
      
      isSearching = false;
      isFilteredLoading = false;
      hideSearchLoading();
      renderHistory(!isNewSearch); // append mode
      updateStats();
    } catch (error) {
      console.error("Search failed:", error);
      isSearching = false;
      isFilteredLoading = false;
      hideSearchLoading();
      // Hata durumunda mevcut verilerden filtrele
      filteredHistory = clipboardHistory.filter(item => 
        item.content.toLowerCase().includes(query.toLowerCase())
      );
      renderHistory();
      updateStats();
    }
  };
  
  if (delay > 0) {
    searchTimeout = setTimeout(executeSearch, delay);
  } else {
    // Filtre için hemen çalıştır ama UI güncellensin diye bir frame bekle
    await new Promise(resolve => requestAnimationFrame(resolve));
    await executeSearch();
  }
}

// Loading göstergesi fonksiyonları
function showSearchLoading() {
  const historyList = document.getElementById('history-list');
  const container = historyList?.parentElement;
  if (!container) return;
  
  // Mevcut loading varsa kaldır
  hideSearchLoading();
  
  // Filter butonlarını disable et
  const filterButtons = document.querySelectorAll('.filter-chip');
  filterButtons.forEach(btn => btn.classList.add('loading-disabled'));
  
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.classList.add('loading-disabled');
  
  const loader = document.createElement('div');
  loader.id = 'search-loading-overlay';
  loader.className = 'search-loading-overlay';
  
  const loadingText = window.i18n?.tSync?.('loading.searching') || 'Searching...';
  loader.innerHTML = `
    <div class="search-loading-spinner">
      <i class="fas fa-spinner fa-spin"></i>
      <span>${loadingText}</span>
    </div>
  `;
  container.appendChild(loader);
}

function hideSearchLoading() {
  const loader = document.getElementById('search-loading-overlay');
  if (loader) loader.remove();
  
  // Filter butonlarını tekrar aktif et
  const filterButtons = document.querySelectorAll('.filter-chip');
  filterButtons.forEach(btn => btn.classList.remove('loading-disabled'));
  
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.classList.remove('loading-disabled');
}

// Kategori filtresi toggle - çoklu seçim
export function toggleContentFilter(filter, multiSelect = false) {
  console.log('[DEBUG] toggleContentFilter:', filter, 'multiSelect:', multiSelect);
  
  if (filter === 'all') {
    // All seçilirse diğerlerini temizle
    activeFilters.clear();
    activeFilters.add('all');
  } else if (!multiSelect) {
    // Tek seçim modu - sadece bu filtreyi aktif yap
    activeFilters.clear();
    activeFilters.add(filter);
  } else {
    // Çoklu seçim modu (Ctrl+tıklama)
    activeFilters.delete('all');
    
    if (activeFilters.has(filter)) {
      activeFilters.delete(filter);
    } else {
      activeFilters.add(filter);
    }
    
    // Hiçbir filtre yoksa 'all' ekle
    if (activeFilters.size === 0) {
      activeFilters.add('all');
    }
  }
  
  console.log('[DEBUG] Active filters now:', Array.from(activeFilters));
  
  // Önbelleği temizle (filtre değişti)
  searchCache.clear();
  
  filterHistory();
}

export function getActiveFilters() {
  return activeFilters;
}

// Aktif filtre var mı kontrol et (all değilse)
export function hasActiveFilter() {
  if (activeFilters.size === 0) return false;
  if (activeFilters.size === 1 && activeFilters.has('all')) return false;
  return true;
}

// Eski API uyumluluğu için
export function setContentFilter(filter) {
  toggleContentFilter(filter);
}

export function getCurrentFilter() {
  return Array.from(activeFilters).join(',');
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