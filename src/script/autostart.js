// Autostart yönetimi için JavaScript fonksiyonları
const { invoke } = window.__TAURI__.tauri;

// Autostart'ı etkinleştir
async function enableAutostart() {
    try {
        await invoke('plugin:autostart|enable');
        console.log('Autostart enabled successfully');
        return true;
    } catch (error) {
        console.error('Failed to enable autostart:', error);
        return false;
    }
}

// Autostart'ı devre dışı bırak
async function disableAutostart() {
    try {
        await invoke('plugin:autostart|disable');
        console.log('Autostart disabled successfully');
        return true;
    } catch (error) {
        console.error('Failed to disable autostart:', error);
        return false;
    }
}

// Autostart durumunu kontrol et
async function isAutostartEnabled() {
    try {
        const isEnabled = await invoke('plugin:autostart|is_enabled');
        console.log('Autostart enabled:', isEnabled);
        return isEnabled;
    } catch (error) {
        console.error('Failed to check autostart status:', error);
        return false;
    }
}

// Sayfa yüklendiğinde otomatik olarak autostart'ı etkinleştir
document.addEventListener('DOMContentLoaded', async () => {
    const isEnabled = await isAutostartEnabled();
    if (!isEnabled) {
        console.log('Autostart not enabled, enabling...');
        await enableAutostart();
    } else {
        console.log('Autostart already enabled');
    }
});

// Global olarak erişilebilir hale getir
window.autostartManager = {
    enable: enableAutostart,
    disable: disableAutostart,
    isEnabled: isAutostartEnabled
}; 