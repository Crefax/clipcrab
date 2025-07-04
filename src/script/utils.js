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

export async function formatTimeAgo(timestamp) {
  await waitForI18n();
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);
  if (diffInSeconds < 60) return await window.i18n.t('time.just_now');
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} ${await window.i18n.t('time.minutes_ago')}`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ${await window.i18n.t('time.hours_ago')}`;
  return `${Math.floor(diffInSeconds / 86400)} ${await window.i18n.t('time.days_ago')}`;
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
  await waitForI18n();
  const type = getTextType(text, contentType);
  return await window.i18n.t(`content_types.${type}`);
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