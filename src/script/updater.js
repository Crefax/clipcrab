// Auto-updater module for ClipCrab
import { showToast } from './utils.js';

let updateAvailable = null;

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
    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    updateMessage.textContent = 'Checking for updates...';
    
    const update = await updater.check();
    
    if (update) {
      updateAvailable = update;
      updateMessage.innerHTML = `<strong>New version available:</strong> v${update.version}`;
      checkBtn.style.display = 'none';
      installBtn.style.display = 'inline-flex';
      
      if (!silent) {
        showToast(`Update available: v${update.version}`, 'info');
      }
    } else {
      updateMessage.textContent = 'You are using the latest version!';
      checkBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Check for Updates';
      checkBtn.disabled = false;
      
      if (!silent) {
        showToast('You are up to date!', 'success');
      }
    }
  } catch (error) {
    console.error('Update check failed:', error);
    
    // Daha kullanıcı dostu hata mesajları
    let errorMessage = 'Could not check for updates';
    if (error.toString().includes('Could not fetch') || error.toString().includes('fetch')) {
      errorMessage = 'No updates available yet';
    } else if (error.toString().includes('network') || error.toString().includes('Network')) {
      errorMessage = 'Network error. Check your connection.';
    }
    
    updateMessage.textContent = errorMessage;
    checkBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Check for Updates';
    checkBtn.disabled = false;
    
    if (!silent) {
      // Sadece gerçek hatalarda toast göster, "no release" durumunda gösterme
      if (!error.toString().includes('Could not fetch')) {
        showToast('Update check failed', 'error');
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
    installBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
    updateMessage.textContent = 'Downloading update...';
    
    // Download and install
    let downloaded = 0;
    let contentLength = 0;
    
    await updateAvailable.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          updateMessage.textContent = 'Starting download...';
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const percent = Math.round((downloaded / contentLength) * 100);
            updateMessage.textContent = `Downloading... ${percent}%`;
            installBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${percent}%`;
          }
          break;
        case 'Finished':
          updateMessage.textContent = 'Installing update... App will restart.';
          installBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing...';
          break;
      }
    });
    
    // App will restart automatically after install
    
  } catch (error) {
    console.error('Update install failed:', error);
    updateMessage.textContent = 'Update installation failed';
    installBtn.innerHTML = '<i class="fas fa-download"></i> Retry Install';
    installBtn.disabled = false;
    showToast('Update installation failed', 'error');
  }
}
