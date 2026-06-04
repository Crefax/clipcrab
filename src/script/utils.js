// Utility Functions
export function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

export async function waitForI18n() {
  while (!window.i18n) {
    await new Promise(r => setTimeout(r, 10));
  }
}

export async function translate(key, fallback = key, params = {}) {
  try {
    await waitForI18n();
    const value = await window.i18n.t(key, params);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function formatTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);
  if (diffInSeconds < 60) return await translate('time.just_now', 'Just now');
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} ${await translate('time.minutes_ago', 'minutes ago')}`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ${await translate('time.hours_ago', 'hours ago')}`;
  return `${Math.floor(diffInSeconds / 86400)} ${await translate('time.days_ago', 'days ago')}`;
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function truncateText(text, maxLength = 200) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function getTextType(text, contentType) {
  if (contentType === 'image') return 'image';
  if (text.match(/^https?:\/\//)) return 'url';
  if (text.match(/^[\w\.-]+@[\w\.-]+\.\w+$/)) return 'email';
  if (text.match(/^\d+$/)) return 'number';
  if (text.length > 100) return 'long-text';
  return 'text';
}

export async function getTextTypeLabel(text, contentType) {
  const type = getTextType(text, contentType);
  return await translate(`content_types.${type}`, type);
}

export function getTextIcon(text, contentType) {
  const type = getTextType(text, contentType);
  switch (type) {
    case 'image': return 'fas fa-image';
    case 'url': return 'fas fa-link';
    case 'email': return 'fas fa-envelope';
    case 'number': return 'fas fa-hashtag';
    case 'long-text': return 'fas fa-file-alt';
    default: return 'fas fa-text-width';
  }
} 

export async function getPlatform() {
  try {
    if (window.__TAURI__?.os?.platform) {
      return await window.__TAURI__.os.platform();
    }
  } catch (error) {
    console.error('Tauri platform detection failed:', error);
  }

  const platform = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('linux')) return 'linux';
  return 'unknown';
}
