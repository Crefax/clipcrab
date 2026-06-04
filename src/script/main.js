import { initI18n, updatePageTexts, loadSettings, applyTheme } from './ui.js';
import { requestHistoryRefresh } from './clipboard.js';
import { setupEventListeners, setupServiceWorker } from './events.js';
import { initUpdater } from './updater.js';
import { getPlatform } from './utils.js';

const { invoke } = window.__TAURI__.core || {};

window.__clipcrabHealth = {
  startedAt: Date.now(),
  lastHeartbeatAt: null,
  lastError: null
};

function reportFrontendError(level, message) {
  window.__clipcrabHealth.lastError = {
    level,
    message,
    at: Date.now()
  };

  if (!invoke) return;
  invoke('log_frontend_error', { level, message: String(message) }).catch(() => {});
}

window.addEventListener('error', (event) => {
  reportFrontendError('error', `${event.message || 'error'} ${event.filename || ''}:${event.lineno || 0}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : event.reason;
  reportFrontendError('error', `Unhandled rejection: ${reason}`);
});

window.__clipcrabOnWindowShown = () => requestHistoryRefresh({ force: true, delay: 0 });

function reportFrontendStatus() {
  window.__clipcrabHealth.lastHeartbeatAt = Date.now();
  if (!invoke) return;
  invoke('report_frontend_status').catch(() => {});
}

// Load app version dynamically
async function loadAppVersion() {
  try {
    const version = await window.__TAURI__.app.getVersion();
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
      versionEl.textContent = `ClipCrab v${version}`;
    }
  } catch (e) {
    console.error('Failed to load app version:', e);
  }
}

// Main initialization
window.addEventListener("DOMContentLoaded", async () => {
  // Apply theme immediately
  const savedTheme = localStorage.getItem('theme') || 'auto';
  applyTheme(savedTheme);
  
  // Initialize i18n
  initI18n();
  
  // Setup event listeners early
  setupEventListeners();
  
  // Initialize updater
  initUpdater();
  
  // Load app version
  loadAppVersion();
  reportFrontendStatus();
  setInterval(reportFrontendStatus, 15000);
  
  // Paralel async işlemler
  const clipboardPromise = requestHistoryRefresh({ force: true, delay: 0 });
  const firstRunPromise = checkFirstRun();
  
  // i18n metinlerini güncelle
  await updatePageTexts();
  
  // Paralel işlemlerin bitmesini bekle
  await Promise.all([clipboardPromise, firstRunPromise]);
  
  // Setup service worker
  setupServiceWorker();
});

// İlk çalıştırma kontrolü
async function checkFirstRun() {
  try {
    const { invoke } = window.__TAURI__.core || {};
    if (!invoke) return;
    
    const isFirstRun = await invoke('is_first_run');
    if (isFirstRun) {
      showWelcomeModal();
    }
  } catch (error) {
    console.error('First run kontrolü başarısız:', error);
  }
}

// Hoş geldin modalı
async function showWelcomeModal() {
  // Platform tespiti
  const os = await getPlatform();
  const isWindows = os === 'windows' || os === 'win32';
  const isLinux = os === 'linux';
  const isMac = os === 'darwin' || os === 'macos';
  
  const platformName = isWindows ? 'Windows' : isLinux ? 'Linux' : isMac ? 'macOS' : 'sistem';
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal welcome-modal">
      <div class="modal-header">
        <h2><i class="fas fa-clipboard"></i> ClipCrab'a Hoş Geldiniz!</h2>
      </div>
      <div class="modal-body">
        <p>ClipCrab clipboard yöneticinize hoş geldiniz! Daha iyi bir deneyim için:</p>
        <ul>
          <li><strong>✨ Otomatik Başlatma:</strong> ${platformName} ile birlikte otomatik başlat</li>
          <li><strong>🔒 Güvenli:</strong> Clipboard geçmişiniz güvenle saklanır</li>
          <li><strong>⚡ Hızlı:</strong> System tray'de arka planda çalışır</li>
        </ul>
        <div class="welcome-autostart">
          <label>
            <input type="checkbox" id="welcome-autostart" checked />
            <span>${platformName} başlangıcında otomatik başlat (Önerilir)</span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="welcome-continue">Devam Et</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Continue button
  modal.querySelector('#welcome-continue').addEventListener('click', async () => {
    const enableAutostart = modal.querySelector('#welcome-autostart').checked;
    
    try {
      const { invoke } = window.__TAURI__.core || {};
      
      if (enableAutostart) {
        // Autostart'ı etkinleştir
        try {
          // Plugin API'sini kullan
          if (window.__TAURI__.plugins && window.__TAURI__.plugins.autostart) {
            await window.__TAURI__.plugins.autostart.enable();
          } else {
            // Fallback: invoke ile dene
            try {
              await invoke('plugin:autostart|enable');
            } catch (e) {
              await invoke('enable');
            }
          }
        } catch (error) {
          console.error('Welcome: Autostart etkinleştirilemedi:', error);
        }
      }
      
      // İlk çalıştırmayı tamamla
      await invoke('complete_first_run');
      
    } catch (error) {
      console.error('Welcome modal işlemi başarısız:', error);
    }
    
    document.body.removeChild(modal);
  });
}
