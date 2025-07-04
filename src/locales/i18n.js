const SUPPORTED_LANGUAGES = {
  'en': 'English',
  'tr': 'Türkçe'
};
const DEFAULT_LANGUAGE = 'en';
let currentLanguage = localStorage.getItem('language') || DEFAULT_LANGUAGE;
let translations = {};

function updateCurrentLanguageUI() {
  const currentLanguageSpan = document.querySelector('.current-language-label');
  if (currentLanguageSpan) {
    currentLanguageSpan.textContent = SUPPORTED_LANGUAGES[getCurrentLanguage()] || 'Language';
  }
  // Aktif seçeneği vurgula
  const options = document.querySelectorAll('.language-option');
  options.forEach(option => {
    option.classList.remove('active');
    if (option.dataset.lang === getCurrentLanguage()) {
      option.classList.add('active');
    }
  });
}

async function loadLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) lang = DEFAULT_LANGUAGE;
  if (translations[lang]) return translations[lang];
  const resp = await fetch(`./locales/${lang}.json`);
  const data = await resp.json();
  translations[lang] = data;
  return data;
}

async function t(key, lang = currentLanguage) {
  const data = await loadLanguage(lang);
  const keys = key.split('.');
  let result = data;
  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = result[k];
    } else {
      return key;
    }
  }
  return result || key;
}

function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) lang = DEFAULT_LANGUAGE;
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  updateCurrentLanguageUI();
  window.location.reload();
}

function getCurrentLanguage() {
  return currentLanguage;
}

function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

window.i18n = {
  t,
  setLanguage,
  getCurrentLanguage,
  getSupportedLanguages,
  updateCurrentLanguageUI
}; 