import { waitForI18n, formatTimeAgo, truncateText, getTextIcon, getTextTypeLabel, showToast } from './utils.js';
import { copyToClipboard, deleteHistoryItem, togglePin, getClipboardHistory, getFilteredHistory, getSearchQuery } from './clipboard.js';
// ESM importlar kaldırıldı, Tauri API globalden alınacak
// import { invoke } from '@tauri-apps/api/tauri';
// import { save } from '@tauri-apps/api/dialog';
// import { writeTextFile } from '@tauri-apps/api/fs';

// Tauri API'yi globalden al
const { invoke } = window.__TAURI__.core || {};
const { save, writeTextFile } = window.__TAURI__.fs ? window.__TAURI__ : {};
// Eğer dialog ve fs API'leri window.__TAURI__ altında farklıysa, aşağıda kontrol edilecek

const { core } = window.__TAURI__;

// Autostart plugin API'lerini al
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
  lastUpdated: document.getElementById("last-updated"),
  loading: document.getElementById("loading"),
  emptyState: document.getElementById("empty-state"),
  noResults: document.getElementById("no-results"),
  toast: document.getElementById("toast"),
  // Navigation elements
  historyTab: document.getElementById("history-tab"),
  importexportTab: document.getElementById("importexport-tab"),
  settingsTab: document.getElementById("settings-tab"),
  historyPage: document.getElementById("history-page"),
  settingsPage: document.getElementById("settings-page"),
  settingsBtn: document.getElementById("settings-btn"),
  // Settings elements
  languageToggle: document.getElementById("language-toggle"),
  languageMenu: document.getElementById("language-menu"),
  saveSettingsBtn: document.getElementById("save-settings"),
  resetSettingsBtn: document.getElementById("reset-settings"),
  // Settings form elements
  maxHistorySelect: document.getElementById("max-history"),
  autoClearSelect: document.getElementById("auto-clear"),
  showNotificationsCheckbox: document.getElementById("show-notifications"),
  soundEnabledCheckbox: document.getElementById("sound-enabled"),
  themeSelect: document.getElementById("theme-select"),
  compactModeCheckbox: document.getElementById("compact-mode"),
  autostartCheckbox: document.getElementById("autostart-enabled")
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
  
  // Navigasyon sistemini başlat
  initNavigation();
  
  // Ayarlar sistemini başlat
  initSettings();

  // Import/Export sayfası fonksiyonları
  initImportExport();
}

// Navigasyon sistemi
export function initNavigation() {
  // Tab click handlers
  if (elements.historyTab) elements.historyTab.addEventListener('click', () => switchPage('history'));
  if (elements.importexportTab) elements.importexportTab.addEventListener('click', () => switchPage('importexport'));
  if (elements.settingsTab) elements.settingsTab.addEventListener('click', () => switchPage('settings'));
  if (elements.settingsBtn) elements.settingsBtn.addEventListener('click', () => switchPage('settings'));
}

// Sayfa değiştirme
export function switchPage(pageName) {
  // Tüm sayfaları gizle
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Tüm tabları pasif yap
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // İlgili sayfayı ve tabı aktif yap
  const targetPage = document.getElementById(`${pageName}-page`);
  const targetTab = document.getElementById(`${pageName}-tab`);
  
  if (targetPage) targetPage.classList.add('active');
  if (targetTab) targetTab.classList.add('active');
  
  // Sayfa değiştiğinde gerekli işlemleri yap
  if (pageName === 'history') {
    // History sayfasına geçerken clipboard geçmişini yenile
    loadClipboardHistory();
  } else if (pageName === 'importexport') {
    // Import/Export sayfasına geçerken metinleri güncelle
    updateImportExportTexts();
  } else if (pageName === 'settings') {
    // Settings sayfasına geçerken ayarları yükle
    loadSettings();
  }
}

// Ayarlar sistemi
export function initSettings() {
  // Dil dropdown
  if (elements.languageToggle && elements.languageMenu) {
    elements.languageToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = elements.languageToggle.closest('.language-dropdown');
      dropdown.classList.toggle('open');
    });
    
    // Dil seçenekleri
    const options = elements.languageMenu.querySelectorAll('.language-option');
    options.forEach(option => {
      option.addEventListener('click', async function() {
        const lang = this.dataset.lang;
        console.log('Language selected:', lang);
        
        // Dil değiştir
        if (window.i18n && window.i18n.setLanguage) {
          await window.i18n.setLanguage(lang);
        } else {
          // Fallback: sayfayı yenile
          localStorage.setItem('language', lang);
          window.location.reload();
        }
        
        // Dropdown'ı kapat
        const dropdown = elements.languageToggle.closest('.language-dropdown');
        dropdown.classList.remove('open');
      });
    });
    
    // Dışarı tıklayınca kapat
    document.addEventListener('click', function(e) {
      const dropdown = elements.languageToggle.closest('.language-dropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
    
    // ESC ile kapat
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const dropdown = elements.languageToggle.closest('.language-dropdown');
        if (dropdown) dropdown.classList.remove('open');
      }
    });
  }
  
  // Ayarları kaydet
  if (elements.saveSettingsBtn) {
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
  }
  
  // Ayarları sıfırla
  if (elements.resetSettingsBtn) {
    elements.resetSettingsBtn.addEventListener('click', resetSettings);
  }
  
}

// Ayarları yükle
export async function loadSettings() {
  const settings = getStoredSettings();
  // Form elemanlarını doldur
  if (elements.maxHistorySelect) {
    elements.maxHistorySelect.value = settings.maxHistory || '500';
  }
  if (elements.autoClearSelect) {
    elements.autoClearSelect.value = settings.autoClear || 'never';
  }
  if (elements.showNotificationsCheckbox) {
    elements.showNotificationsCheckbox.checked = settings.showNotifications !== false;
  }
  if (elements.soundEnabledCheckbox) {
    elements.soundEnabledCheckbox.checked = settings.soundEnabled || false;
  }
  if (elements.themeSelect) {
    elements.themeSelect.value = settings.theme || 'auto';
  }
  if (elements.compactModeCheckbox) {
    elements.compactModeCheckbox.checked = settings.compactMode || false;
  }
  
  // Autostart durumunu kontrol et
  if (elements.autostartCheckbox) {
    try {
      // Farklı API çağırma yöntemlerini dene
      let enabled = false;
      
      // Yöntem 1: Plugin API
      if (autostartAPI && autostartAPI.isEnabled) {
        enabled = await autostartAPI.isEnabled();
      } 
      // Yöntem 2: Invoke ile
      else {
        try {
          enabled = await invoke('plugin:autostart|is_enabled');
        } catch (e1) {
          // Yöntem 3: Direkt komut
          try {
            enabled = await invoke('is_enabled');
          } catch (e2) {
            console.log('Autostart API bulunamadı, varsayılan olarak false');
            enabled = false;
          }
        }
      }
      
      elements.autostartCheckbox.checked = enabled;
      console.log('Autostart durumu:', enabled);
    } catch (error) {
      console.error('Autostart durumu kontrol edilemedi:', error);
      elements.autostartCheckbox.checked = false;
    }
  }
}

// Ayarları kaydet
export async function saveSettings() {
  try {
    const settings = {
      maxHistory: elements.maxHistorySelect?.value || '500',
      autoClear: elements.autoClearSelect?.value || 'never',
      showNotifications: elements.showNotificationsCheckbox?.checked !== false,
      soundEnabled: elements.soundEnabledCheckbox?.checked || false,
      theme: elements.themeSelect?.value || 'auto',
      compactMode: elements.compactModeCheckbox?.checked || false
    };
    
    // Autostart ayarını uygula
    if (elements.autostartCheckbox) {
      try {
        // Mevcut durumu kontrol et
        let currentAutostart = false;
        if (autostartAPI && autostartAPI.isEnabled) {
          currentAutostart = await autostartAPI.isEnabled();
        } else {
          try {
            currentAutostart = await invoke('plugin:autostart|is_enabled');
          } catch (e) {
            try {
              currentAutostart = await invoke('is_enabled');
            } catch (e2) {
              console.log('Autostart durumu okunamadı');
            }
          }
        }
        
        const newAutostart = elements.autostartCheckbox.checked;
        console.log('Autostart değişikliği:', currentAutostart, '->', newAutostart);
        
        if (currentAutostart !== newAutostart) {
          if (newAutostart) {
            // Etkinleştir
            if (autostartAPI && autostartAPI.enable) {
              await autostartAPI.enable();
            } else {
              try {
                await invoke('plugin:autostart|enable');
              } catch (e) {
                await invoke('enable');
              }
            }
            console.log('Autostart etkinleştirildi');
            showToast('Windows ile otomatik başlatma etkinleştirildi', 'success');
          } else {
            // Devre dışı bırak
            if (autostartAPI && autostartAPI.disable) {
              await autostartAPI.disable();
            } else {
              try {
                await invoke('plugin:autostart|disable');
              } catch (e) {
                await invoke('disable');
              }
            }
            console.log('Autostart devre dışı bırakıldı');
            showToast('Windows ile otomatik başlatma devre dışı bırakıldı', 'success');
          }
        }
      } catch (error) {
        console.error('Autostart ayarı uygulanamadı:', error);
        showToast('Autostart ayarı uygulanamadı: ' + error, 'error');
      }
    }
    
    // LocalStorage'a kaydet
    localStorage.setItem('clipcrab_settings', JSON.stringify(settings));
    // Tema değişikliğini uygula
    applyTheme(settings.theme);
    // Kompakt mod değişikliğini uygula
    applyCompactMode(settings.compactMode);
    // Başarı mesajı göster
    const savedText = await window.i18n.t('settings.actions.saved');
    showToast(savedText, 'success');
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    const errorText = await window.i18n.t('errors.save_settings_failed');
    showToast(errorText, 'error');
  }
}

// Ayarları sıfırla
export async function resetSettings() {
  try {
    const resetConfirmText = await window.i18n.t('settings.actions.reset_confirm');
    if (!confirm(resetConfirmText)) {
      return;
    }
    // Varsayılan ayarları yükle
    const defaultSettings = {
      maxHistory: '500',
      autoClear: 'never',
      showNotifications: true,
      soundEnabled: false,
      theme: 'auto',
      compactMode: false
    };
    
    // Autostart'ı devre dışı bırak
    try {
      if (autostartAPI && autostartAPI.disable) {
        await autostartAPI.disable();
      } else {
        try {
          await invoke('plugin:autostart|disable');
        } catch (e) {
          await invoke('disable');
        }
      }
      console.log('Reset: Autostart devre dışı bırakıldı');
    } catch (error) {
      console.error('Autostart devre dışı bırakılamadı:', error);
    }
    
    // LocalStorage'dan sil
    localStorage.removeItem('clipcrab_settings');
    // Form elemanlarını sıfırla
    loadSettings();
    // Tema ve kompakt modu sıfırla
    applyTheme('auto');
    applyCompactMode(false);
    // Başarı mesajı göster
    const resetSuccessText = await window.i18n.t('settings.actions.reset_success');
    showToast(resetSuccessText, 'success');
    console.log('Settings reset to default');
  } catch (error) {
    console.error('Error resetting settings:', error);
  }
}

// Kaydedilmiş ayarları al
export function getStoredSettings() {
  try {
    const stored = localStorage.getItem('clipcrab_settings');
    const defaultSettings = {
      maxHistory: '500',
      autoClear: 'never',
      showNotifications: true,
      soundEnabled: false,
      theme: 'auto',
      compactMode: false,
      autostartEnabled: true // Varsayılan olarak autostart aktif
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
      compactMode: false,
      autostartEnabled: true
    };
  }
}

// Tema uygula
export function applyTheme(theme) {
  const root = document.documentElement;
  
  // Mevcut tema sınıflarını kaldır
  root.classList.remove('theme-light', 'theme-dark');
  
  if (theme === 'light') {
    root.classList.add('theme-light');
  } else if (theme === 'dark') {
    root.classList.add('theme-dark');
  } else {
    // Auto tema - sistem temasını kullan
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('theme-dark');
    } else {
      root.classList.add('theme-light');
    }
  }
}

// Kompakt mod uygula
export function applyCompactMode(compact) {
  const appContainer = document.querySelector('.app-container');
  if (compact) {
    appContainer.classList.add('compact-mode');
  } else {
    appContainer.classList.remove('compact-mode');
  }
}

// Sayfa metinlerini güncelle
export async function updatePageTexts() {
  await waitForI18n();
  
  // Header
  if (document.querySelector('.logo h1')) document.querySelector('.logo h1').textContent = await window.i18n.t('app.title');
  if (document.querySelector('#refresh span')) document.querySelector('#refresh span').textContent = await window.i18n.t('header.refresh');
  if (document.querySelector('#clear-all span')) document.querySelector('#clear-all span').textContent = await window.i18n.t('header.clear_all');
  if (document.querySelector('#settings-btn span')) document.querySelector('#settings-btn span').textContent = await window.i18n.t('header.settings');
  
  // Navigation
  if (document.querySelector('#history-tab span')) document.querySelector('#history-tab span').textContent = await window.i18n.t('navigation.history');
  if (document.querySelector('#importexport-tab span')) document.querySelector('#importexport-tab span').textContent = await window.i18n.t('navigation.importexport');
  if (document.querySelector('#settings-tab span')) document.querySelector('#settings-tab span').textContent = await window.i18n.t('navigation.settings');
  
  // Search
  if (document.querySelector('#search-input')) document.querySelector('#search-input').placeholder = await window.i18n.t('search.placeholder');
  
  // Stats
  if (document.querySelector('.stat-item:nth-child(1) label')) document.querySelector('.stat-item:nth-child(1) label').textContent = await window.i18n.t('stats.total_items');
  if (document.querySelector('.stat-item:nth-child(2) label')) document.querySelector('.stat-item:nth-child(2) label').textContent = await window.i18n.t('stats.last_updated');
  
  // Loading
  if (document.querySelector('#loading span')) document.querySelector('#loading span').textContent = await window.i18n.t('loading.message');
  
  // Empty state
  if (document.querySelector('#empty-state h3')) document.querySelector('#empty-state h3').textContent = await window.i18n.t('empty_state.title');
  if (document.querySelector('#empty-state p')) document.querySelector('#empty-state p').textContent = await window.i18n.t('empty_state.message');
  
  // No results
  if (document.querySelector('#no-results h3')) document.querySelector('#no-results h3').textContent = await window.i18n.t('no_results.title');
  if (document.querySelector('#no-results p')) document.querySelector('#no-results p').textContent = await window.i18n.t('no_results.message');
  
  // Import/Export page texts
  updateImportExportTexts();
  
  // Settings page texts
  updateSettingsTexts();
  
  // Select options
  updateSelectOptions();
  
  // Mevcut clipboard öğelerini yeniden render et
  await renderHistory();
  if (window.i18n && window.i18n.updateCurrentLanguageUI) {
    window.i18n.updateCurrentLanguageUI();
  }
}

// Import/Export sayfası metinlerini güncelle
export async function updateImportExportTexts() {
  await waitForI18n();
  
  // Import/Export title
  if (document.querySelector('.importexport-title')) {
    document.querySelector('.importexport-title').textContent = await window.i18n.t('importexport.title');
  }
  
  // Import/Export description
  if (document.querySelector('.importexport-desc span')) {
    document.querySelector('.importexport-desc span').textContent = await window.i18n.t('importexport.desc');
  }
  
  // Export button
  if (document.querySelector('.export-label')) {
    document.querySelector('.export-label').textContent = await window.i18n.t('importexport.export');
  }
  if (document.querySelector('#export-json small')) {
    document.querySelector('#export-json small').textContent = await window.i18n.t('importexport.export_desc');
  }
  
  // Import button
  if (document.querySelector('.import-label')) {
    document.querySelector('.import-label').textContent = await window.i18n.t('importexport.import');
  }
  if (document.querySelector('#import-json small')) {
    document.querySelector('#import-json small').textContent = await window.i18n.t('importexport.import_desc');
  }
}

// Ayarlar sayfası metinlerini güncelle
export async function updateSettingsTexts() {
  await waitForI18n();
  
  // Settings sections
  const sections = document.querySelectorAll('.settings-section h2');
  if (sections.length >= 5) {
    sections[0].innerHTML = `<i class="fas fa-globe"></i> ${await window.i18n.t('settings.language.title')}`;
    sections[1].innerHTML = `<i class="fas fa-shield-alt"></i> ${await window.i18n.t('settings.privacy.title')}`;
    sections[2].innerHTML = `<i class="fas fa-sliders-h"></i> ${await window.i18n.t('settings.general.title')}`;
    sections[3].innerHTML = `<i class="fas fa-bell"></i> ${await window.i18n.t('settings.notifications.title')}`;
    sections[4].innerHTML = `<i class="fas fa-palette"></i> ${await window.i18n.t('settings.appearance.title')}`;
  }
  
  // Settings labels
  const labels = document.querySelectorAll('.setting-item label span');
  if (labels.length >= 8) {
    labels[0].textContent = await window.i18n.t('settings.privacy.auto_start');
    labels[1].textContent = await window.i18n.t('settings.privacy.encrypt_data');
    labels[2].textContent = await window.i18n.t('settings.general.max_history');
    labels[3].textContent = await window.i18n.t('settings.general.auto_clear');
    labels[4].textContent = await window.i18n.t('settings.notifications.show_notifications');
    labels[5].textContent = await window.i18n.t('settings.notifications.sound_enabled');
    labels[6].textContent = await window.i18n.t('settings.appearance.theme');
    labels[7].textContent = await window.i18n.t('settings.appearance.compact_mode');
  }
  
  // Action buttons
  if (document.querySelector('#save-settings span')) document.querySelector('#save-settings span').textContent = await window.i18n.t('settings.actions.save');
  if (document.querySelector('#reset-settings span')) document.querySelector('#reset-settings span').textContent = await window.i18n.t('settings.actions.reset');
  
  // Select options
  updateSelectOptions();
}

// Select option'larını güncelle
export async function updateSelectOptions() {
  await waitForI18n();
  
  // Max history options
  const maxHistoryOptions = document.querySelectorAll('#max-history option');
  maxHistoryOptions.forEach(option => {
    const key = option.getAttribute('data-i18n');
    if (key) {
      option.textContent = window.i18n.tSync(key);
    }
  });
  
  // Auto clear options
  const autoClearOptions = document.querySelectorAll('#auto-clear option');
  autoClearOptions.forEach(option => {
    const key = option.getAttribute('data-i18n');
    if (key) {
      option.textContent = window.i18n.tSync(key);
    }
  });
}

// Global olarak erişilebilir yap
window.updatePageTexts = updatePageTexts;
window.switchPage = switchPage;

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
  li.addEventListener('click', (e) => {
    // Sadece ana öğeye tıklanırsa modal aç
    if (
      !e.target.closest('.btn-copy') &&
      !e.target.closest('.btn-delete') &&
      !e.target.closest('.btn-pin') &&
      !e.target.closest('.btn-expand')
    ) {
      showMessageModal(item);
    }
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

// Mesaj detay modalı
export async function showMessageModal(item) {
  await waitForI18n();
  const copyText = await window.i18n.t('clipboard.copy');
  const deleteText = await window.i18n.t('clipboard.delete');
  const pinText = await window.i18n.t('clipboard.pin');
  const unpinText = await window.i18n.t('clipboard.unpin');
  const closeText = await window.i18n.t('modal.close');
  const createdAtText = await window.i18n.t('modal.created_at');
  const characterCountText = await window.i18n.t('modal.character_count');
  const contentTypeText = await window.i18n.t('modal.content_type');
  
  const timeAgo = await formatTimeAgo(item.created_at);
  const fullDateTime = new Date(item.created_at).toLocaleString();
  const typeLabel = await getTextTypeLabel(item.content, item.content_type);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal message-modal">
      <div class="modal-header modal-header-message-modal">
        <button class="modal-pin-button ${item.pinned ? 'modal-pin-active' : 'modal-pin-inactive'}" title="${item.pinned ? unpinText : pinText}">
          <i class="fas fa-thumbtack"></i>
        </button>
        <button class="modal-close" title="${closeText}">×</button>
      </div>
      <div class="modal-body">
        <div class="message-content${item.content.length > 300 ? ' scrollable' : ''}">
          ${item.content_type === 'image' && item.image_data
            ? `<img src="data:image/png;base64,${item.image_data}" alt="Clipboard image" />`
            : `<pre>${item.content}</pre>`}
        </div>
      </div>
      <div class="modal-footer modal-footer-row">
        <div class="modal-info-group">
          <span class="info-item"><i class="fas fa-calendar"></i><span class="info-value" title="${fullDateTime}">${timeAgo}</span></span>
          <span class="info-item"><i class="fas fa-ruler-horizontal"></i><span class="info-value">${item.content.length}</span></span>
          <span class="info-item"><i class="${getTextIcon(item.content, item.content_type)}"></i><span class="info-value">${typeLabel}</span></span>
        </div>
        <div class="modal-btn-group">
          <button class="btn-small btn-copy" title="${copyText}">
            <i class="fas fa-copy"></i> ${copyText}
          </button>
          <button class="btn-small btn-delete" title="${deleteText}">
            <i class="fas fa-trash"></i> ${deleteText}
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Kapatma
  modal.querySelector('.modal-close').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) document.body.removeChild(modal);
  });

  // Butonlar
  const pinBtn = modal.querySelector('.modal-pin-button');
  const copyBtn = modal.querySelector('.btn-copy');
  const deleteBtn = modal.querySelector('.btn-delete');

  pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await togglePin(item.id);
    document.body.removeChild(modal);
  });
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(item.content, item.content_type, item.image_data);
  });
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await showDeleteConfirmation(item);
    document.body.removeChild(modal);
  });
} 

// Import/Export sayfası fonksiyonları
export function initImportExport() {
  const exportBtn = document.getElementById('export-json');
  const importBtn = document.getElementById('import-json');
  const importFile = document.getElementById('import-file');

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        // Clipboard geçmişini Rust tarafından al
        const json = await invoke('export_clipboard_history');
        // Klasik web indirme yöntemiyle dosya olarak kaydet
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
        
        // Dil desteği ile başarı mesajı
        const successMessage = await window.i18n.t('importexport.export_success');
        showToast(successMessage, 'success');
      } catch (e) {
        // Dil desteği ile hata mesajı
        const errorMessage = await window.i18n.t('importexport.export_error');
        showToast(e && e.toString ? e.toString() : errorMessage, 'error');
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
          
          // Dil desteği ile başarı mesajı
          const successMessage = await window.i18n.t('importexport.import_success', { count: count });
          showToast(successMessage, 'success');
        } catch (err) {
          // Dil desteği ile hata mesajı
          const errorMessage = await window.i18n.t('importexport.import_error');
          showToast(errorMessage, 'error');
        }
      };
      reader.readAsText(file);
    });
  }
}
// initI18n içinde veya sayfa geçişlerinde importexport sayfası için de başlatıcı fonksiyonu çağırmayı unutma. 