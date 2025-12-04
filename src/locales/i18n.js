const SUPPORTED_LANGUAGES = {
  'en': { name: 'English', flag: '🇺🇸' },
  'tr': { name: 'Türkçe', flag: '🇹🇷' }
};
const DEFAULT_LANGUAGE = 'en';
let currentLanguage = localStorage.getItem('language') || DEFAULT_LANGUAGE;
let translations = {};

function updateCurrentLanguageUI() {
  const currentLang = getCurrentLanguage();
  const langData = SUPPORTED_LANGUAGES[currentLang];
  
  // Dropdown butonundaki metni güncelle
  const currentLanguageLabel = document.querySelector('.current-language-label');
  if (currentLanguageLabel && langData) {
    currentLanguageLabel.innerHTML = `<span class="flag">${langData.flag}</span> ${langData.name}`;
  }
  
  // Aktif seçeneği vurgula
  const options = document.querySelectorAll('.language-option');
  options.forEach(option => {
    option.classList.remove('active');
    if (option.dataset.lang === currentLang) {
      option.classList.add('active');
    }
  });
}

// Dropdown menüsünü doldur
function populateLanguageDropdown() {
  const menu = document.getElementById('language-dropdown-menu');
  if (!menu) return;
  
  menu.innerHTML = '';
  const currentLang = getCurrentLanguage();
  
  Object.entries(SUPPORTED_LANGUAGES).forEach(([code, data]) => {
    const option = document.createElement('button');
    option.className = `language-option${code === currentLang ? ' active' : ''}`;
    option.dataset.lang = code;
    option.innerHTML = `<span class="flag">${data.flag}</span> ${data.name}`;
    option.addEventListener('click', () => {
      setLanguage(code);
      closeLanguageDropdown();
    });
    menu.appendChild(option);
  });
}

// Dropdown aç/kapa
function toggleLanguageDropdown() {
  const dropdown = document.getElementById('language-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('open');
  }
}

function closeLanguageDropdown() {
  const dropdown = document.getElementById('language-dropdown');
  if (dropdown) {
    dropdown.classList.remove('open');
  }
}

// Dropdown dışına tıklanınca kapat
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('language-dropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    closeLanguageDropdown();
  }
});

// Dropdown butonuna tıklama
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('language-dropdown-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLanguageDropdown();
    });
  }
  populateLanguageDropdown();
  updateCurrentLanguageUI();
});

async function loadLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) lang = DEFAULT_LANGUAGE;
  if (translations[lang]) return translations[lang];
  const resp = await fetch(`./locales/${lang}.json`);
  const data = await resp.json();
  translations[lang] = data;
  return data;
}

async function t(key, params = {}, lang = currentLanguage) {
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
  
  if (typeof result === 'string' && Object.keys(params).length > 0) {
    // Parametreleri değiştir
    return result.replace(/\{(\w+)\}/g, (match, paramName) => {
      return params[paramName] !== undefined ? params[paramName] : match;
    });
  }
  
  return result || key;
}

async function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) lang = DEFAULT_LANGUAGE;
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  updateCurrentLanguageUI();
  
  // Sayfayı yenilemek yerine dinamik güncelleme yap
  if (window.updatePageTexts) {
    await window.updatePageTexts();
  }
}

function getCurrentLanguage() {
  return currentLanguage;
}

function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

// Sync versiyon için
function tSync(key, params = {}) {
  const data = translations[currentLanguage] || {};
  const keys = key.split('.');
  let result = data;
  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = result[k];
    } else {
      return key;
    }
  }
  
  if (typeof result === 'string' && Object.keys(params).length > 0) {
    // Parametreleri değiştir
    return result.replace(/\{(\w+)\}/g, (match, paramName) => {
      return params[paramName] !== undefined ? params[paramName] : match;
    });
  }
  
  return result || key;
}

window.i18n = {
  t,
  tSync,
  setLanguage,
  getCurrentLanguage,
  getSupportedLanguages,
  updateCurrentLanguageUI
}; 