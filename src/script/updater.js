// Auto-updater module for ClipCrab
import { showToast } from './utils.js';

let updateAvailable = null;

// i18n helper
async function t(key) {
  if (window.i18n && window.i18n.t) {
    return await window.i18n.t(key);
  }
  return key;
}

// Tauri updater API (global)
const getUpdaterAPI = () => {
  if (window.__TAURI__?.updater) {
    return window.__TAURI__.updater;
  }
  return null;
};

export async function initUpdater() {
  const checkBtn = document.getElementById('check-update');
  const installBtn = document.getElementById('install-update');
  const updateMessage = document.getElementById('update-message');
  
  if (!checkBtn) return;
  
  // Check for updates button
  checkBtn.addEventListener('click', async () => {
    await checkForUpdates();
  });
  
  // Install update button
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      await installUpdate();
    });
  }
  
  // Auto-check on startup (silent)
  setTimeout(() => {
    checkForUpdates(true);
  }, 5000);
}

export async function checkForUpdates(silent = false) {
  const checkBtn = document.getElementById('check-update');
  const installBtn = document.getElementById('install-update');
  const updateMessage = document.getElementById('update-message');
  
  if (!checkBtn || !updateMessage) return;
  
  const updater = getUpdaterAPI();
  if (!updater) {
    console.log('Updater API not available');
    if (!silent) {
      updateMessage.textContent = 'Updater not available in dev mode';
    }
    return;
  }
  
  try {
    checkBtn.disabled = true;
    const checkingText = await t('settings.updates.checking');
    const checkButtonText = await t('settings.updates.check_button');
    checkBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${checkingText}`;
    updateMessage.textContent = checkingText;
    
    const update = await updater.check();
    
    if (update) {
      updateAvailable = update;
      const availableText = await t('settings.updates.available');
      updateMessage.innerHTML = `<strong>${availableText.replace('{version}', update.version)}</strong>`;
      checkBtn.style.display = 'none';
      installBtn.style.display = 'inline-flex';
      
      if (!silent) {
        showToast(`Update available: v${update.version}`, 'info');
      }
    } else {
      const upToDateText = await t('settings.updates.up_to_date');
      updateMessage.textContent = upToDateText;
      checkBtn.innerHTML = `<i class="fas fa-sync-alt"></i> <span>${checkButtonText}</span>`;
      checkBtn.disabled = false;
      
      if (!silent) {
        showToast(upToDateText, 'success');
      }
    }
  } catch (error) {
    console.error('Update check failed:', error);
    
    const errorText = await t('settings.updates.error');
    const checkButtonText = await t('settings.updates.check_button');
    
    // Daha kullanıcı dostu hata mesajları
    let errorMessage = errorText;
    if (error.toString().includes('Could not fetch') || error.toString().includes('fetch')) {
      const upToDateText = await t('settings.updates.up_to_date');
      errorMessage = upToDateText;
    } else if (error.toString().includes('network') || error.toString().includes('Network')) {
      errorMessage = 'Network error';
    }
    
    updateMessage.textContent = errorMessage;
    checkBtn.innerHTML = `<i class="fas fa-sync-alt"></i> <span>${checkButtonText}</span>`;
    checkBtn.disabled = false;
    
    if (!silent) {
      // Sadece gerçek hatalarda toast göster, "no release" durumunda gösterme
      if (!error.toString().includes('Could not fetch')) {
        showToast(errorText, 'error');
      }
    }
  }
}

export async function installUpdate() {
  const installBtn = document.getElementById('install-update');
  const updateMessage = document.getElementById('update-message');
  
  if (!updateAvailable || !installBtn) return;
  
  try {
    installBtn.disabled = true;
    const downloadingText = await t('settings.updates.downloading');
    const installingText = await t('settings.updates.installing');
    
    installBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${downloadingText}`;
    updateMessage.textContent = downloadingText;
    
    // Download and install
    let downloaded = 0;
    let contentLength = 0;
    
    await updateAvailable.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          updateMessage.textContent = downloadingText;
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const percent = Math.round((downloaded / contentLength) * 100);
            updateMessage.textContent = `${downloadingText} ${percent}%`;
            installBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${percent}%`;
          }
          break;
        case 'Finished':
          updateMessage.textContent = installingText;
          installBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${installingText}`;
          break;
      }
    });
    
    // App will restart automatically after install
    
  } catch (error) {
    console.error('Update install failed:', error);
    const installFailedText = await t('settings.updates.install_failed');
    const installButtonText = await t('settings.updates.install_button');
    updateMessage.textContent = installFailedText;
    installBtn.innerHTML = `<i class="fas fa-download"></i> ${installButtonText}`;
    installBtn.disabled = false;
    showToast(installFailedText, 'error');
  }
}
