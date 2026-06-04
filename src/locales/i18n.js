const SUPPORTED_LANGUAGES = {
  'en': { name: 'English', flag: '🇺🇸' },
  'tr': { name: 'Türkçe', flag: '🇹🇷' }
};
const DEFAULT_LANGUAGE = 'en';
let currentLanguage = localStorage.getItem('language') || DEFAULT_LANGUAGE;
let translations = {};
const BUILTIN_TRANSLATIONS = {
  "en": {
    "app": {
      "title": "ClipCrab",
      "subtitle": "Clipboard Manager",
      "version": "Version"
    },
    "header": {
      "refresh": "Refresh",
      "clear_all": "Clear All",
      "settings": "Settings"
    },
    "search": {
      "placeholder": "Search clipboard history...",
      "clear": "Clear"
    },
    "stats": {
      "total_items": "Total Items",
      "last_updated": "Last Updated"
    },
    "clipboard": {
      "copy": "Copy",
      "delete": "Delete",
      "expand": "Expand",
      "collapse": "Collapse",
      "pin": "Pin",
      "unpin": "Unpin",
      "copied": "Copied!",
      "deleted": "Deleted!",
      "clear_all": "All history cleared!",
      "image_copied": "Image copied!",
      "text_copied": "Text copied!"
    },
    "content_types": {
      "text": "Text",
      "image": "Image",
      "url": "URL",
      "email": "Email",
      "number": "Number",
      "long_text": "Long Text"
    },
    "time": {
      "just_now": "Just now",
      "minutes_ago": "minutes ago",
      "hours_ago": "hours ago",
      "days_ago": "days ago"
    },
    "modal": {
      "delete_title": "Delete Confirmation",
      "delete_message": "Are you sure you want to delete this clipboard item?",
      "clear_warning": "This action cannot be undone!",
      "content": "Content:",
      "cancel": "Cancel",
      "confirm": "Confirm",
      "created_at": "Created:",
      "character_count": "Character Count:",
      "content_type": "Content Type:",
      "close": "Close"
    },
    "empty_state": {
      "title": "No clipboard history yet",
      "message": "When you copy something, it will appear here"
    },
    "no_results": {
      "title": "No results found",
      "message": "No items match your search criteria"
    },
    "loading": {
      "message": "Loading...",
      "searching": "Searching..."
    },
    "errors": {
      "copy_failed": "Copy failed!",
      "delete_failed": "Delete failed!",
      "clear_failed": "Clear failed!"
    },
    "navigation": {
      "history": "History",
      "importexport": "Import / Export",
      "settings": "Settings"
    },
    "importexport": {
      "title": "Import / Export",
      "desc": "You can safely export your clipboard history or import from a backup. This feature allows you to backup your data and synchronize between different devices.",
      "export": "Export Data",
      "export_desc": "Save your clipboard history as a JSON file",
      "export_button": "Export JSON",
      "import": "Import Data",
      "import_desc": "Restore from a previously exported file",
      "import_button": "Import JSON",
      "import_success": "Import successful! {count} items added.",
      "import_error": "Import failed! Invalid or corrupt file.",
      "export_success": "Export successful!",
      "export_error": "Export failed!",
      "choose_file": "Choose JSON File",
      "file_selected": "File selected: {filename}",
      "no_file_selected": "No file selected"
    },
    "settings": {
      "language": {
        "title": "Language Settings",
        "label": "Language"
      },
      "startup": {
        "title": "Startup",
        "start_with_windows": "Start with Windows",
        "start_with_linux": "Start with Linux",
        "start_with_macos": "Start with macOS",
        "start_with_system": "Start with system"
      },
      "privacy": {
        "title": "Privacy & Security",
        "auto_start": "Start with Windows",
        "encrypt_data": "Encrypt clipboard data"
      },
      "general": {
        "title": "General Settings",
        "max_history": "Maximum history items",
        "auto_clear": "Auto-clear old items (days)"
      },
      "notifications": {
        "title": "Notifications",
        "show_notifications": "Show notifications",
        "sound_enabled": "Enable sound effects"
      },
      "appearance": {
        "title": "Appearance",
        "theme": "Theme",
        "compact_mode": "Compact mode"
      },
      "updates": {
        "title": "Updates",
        "check_message": "Click to check for updates",
        "check_button": "Check for Updates",
        "install_button": "Install Update",
        "checking": "Checking...",
        "available": "Update available: v{version}",
        "up_to_date": "You're up to date!",
        "error": "Failed to check for updates",
        "downloading": "Downloading...",
        "installing": "Installing...",
        "install_failed": "Installation failed"
      },
      "about": {
        "title": "About",
        "description": "A modern clipboard manager"
      },
      "actions": {
        "save": "Save Settings",
        "reset": "Reset to Default",
        "saved": "Settings saved successfully!",
        "reset_confirm": "Are you sure you want to reset all settings to default?",
        "reset_success": "Settings have been reset to default"
      },
      "theme_options": {
        "auto": "Auto",
        "light": "Light",
        "dark": "Dark"
      },
      "clear_options": {
        "7": "7 days",
        "30": "30 days",
        "90": "90 days",
        "365": "1 year",
        "never": "Never"
      },
      "history_options": {
        "100": "100 items",
        "250": "250 items",
        "500": "500 items",
        "1000": "1000 items",
        "unlimited": "Unlimited"
      }
    }
  },
  "tr": {
    "app": {
      "title": "ClipCrab",
      "subtitle": "Clipboard Yöneticisi",
      "version": "Sürüm"
    },
    "header": {
      "refresh": "Yenile",
      "clear_all": "Tümünü Temizle",
      "settings": "Ayarlar"
    },
    "navigation": {
      "history": "Geçmiş",
      "importexport": "İçe/Dışa Aktar",
      "settings": "Ayarlar"
    },
    "search": {
      "placeholder": "Clipboard geçmişinde ara...",
      "clear": "Temizle"
    },
    "stats": {
      "total_items": "Toplam Öğe",
      "last_updated": "Son Güncelleme"
    },
    "clipboard": {
      "copy": "Kopyala",
      "delete": "Sil",
      "expand": "Genişlet",
      "collapse": "Daralt",
      "pin": "Sabitle",
      "unpin": "Sabitlemeyi Kaldır",
      "copied": "Kopyalandı!",
      "deleted": "Silindi!",
      "clear_all": "Tüm geçmiş temizlendi!",
      "image_copied": "Resim kopyalandı!",
      "text_copied": "Metin kopyalandı!"
    },
    "content_types": {
      "text": "Metin",
      "image": "Resim",
      "url": "Bağlantı",
      "email": "E-posta",
      "number": "Sayı",
      "long_text": "Uzun Metin"
    },
    "time": {
      "just_now": "Az önce",
      "minutes_ago": "dakika önce",
      "hours_ago": "saat önce",
      "days_ago": "gün önce"
    },
    "modal": {
      "delete_title": "Silme Onayı",
      "delete_message": "Bu clipboard öğesini silmek istediğinizden emin misiniz?",
      "clear_warning": "Bu işlem geri alınamaz!",
      "content": "İçerik:",
      "cancel": "İptal",
      "confirm": "Onayla",
      "created_at": "Oluşturulma:",
      "character_count": "Karakter Sayısı:",
      "content_type": "İçerik Türü:",
      "close": "Kapat"
    },
    "empty_state": {
      "title": "Henüz clipboard geçmişi yok",
      "message": "Bir şeyler kopyaladığınızda burada görünecek"
    },
    "no_results": {
      "title": "Sonuç bulunamadı",
      "message": "Arama kriterlerinize uygun öğe bulunamadı"
    },
    "loading": {
      "message": "Yükleniyor...",
      "searching": "Aranıyor..."
    },
    "settings": {
      "language": {
        "title": "Dil Ayarları",
        "label": "Dil"
      },
      "startup": {
        "title": "Başlangıç",
        "start_with_windows": "Windows ile başlat",
        "start_with_linux": "Linux ile başlat",
        "start_with_macos": "macOS ile başlat",
        "start_with_system": "Sistem ile başlat"
      },
      "privacy": {
        "title": "Gizlilik ve Güvenlik",
        "auto_start": "Windows ile otomatik başlat",
        "encrypt_data": "Clipboard verilerini şifrele"
      },
      "general": {
        "title": "Genel Ayarlar",
        "max_history": "Maksimum geçmiş öğesi",
        "auto_clear": "Eski öğeleri otomatik temizle (gün)"
      },
      "notifications": {
        "title": "Bildirimler",
        "show_notifications": "Bildirimleri göster",
        "sound_enabled": "Ses efektlerini etkinleştir"
      },
      "appearance": {
        "title": "Görünüm",
        "theme": "Tema",
        "compact_mode": "Kompakt mod"
      },
      "updates": {
        "title": "Güncellemeler",
        "check_message": "Güncellemeleri kontrol etmek için tıklayın",
        "check_button": "Güncellemeleri Kontrol Et",
        "install_button": "Güncellemeyi Yükle",
        "checking": "Kontrol ediliyor...",
        "available": "Güncelleme mevcut: v{version}",
        "up_to_date": "Güncelsiniz!",
        "error": "Güncelleme kontrolü başarısız",
        "downloading": "İndiriliyor...",
        "installing": "Yükleniyor...",
        "install_failed": "Yükleme başarısız"
      },
      "about": {
        "title": "Hakkında",
        "description": "Modern bir pano yöneticisi"
      },
      "actions": {
        "save": "Ayarları Kaydet",
        "reset": "Varsayılana Sıfırla",
        "saved": "Ayarlar başarıyla kaydedildi!",
        "reset_confirm": "Tüm ayarları varsayılana sıfırlamak istediğinizden emin misiniz?",
        "reset_success": "Ayarlar varsayılana sıfırlandı"
      },
      "theme_options": {
        "auto": "Otomatik",
        "light": "Açık",
        "dark": "Koyu"
      },
      "clear_options": {
        "7": "7 gün",
        "30": "30 gün",
        "90": "90 gün",
        "365": "1 yıl",
        "never": "Asla"
      },
      "history_options": {
        "100": "100 öğe",
        "250": "250 öğe",
        "500": "500 öğe",
        "1000": "1000 öğe",
        "unlimited": "Sınırsız"
      }
    },
    "importexport": {
      "title": "İçe/Dışa Aktar",
      "desc": "Clipboard geçmişinizi güvenli bir şekilde dışa aktarabilir veya yedekten içe aktarabilirsiniz. Bu özellik verilerinizi yedeklemenize ve farklı cihazlar arasında senkronize etmenize olanak tanır.",
      "export": "Veriyi Dışa Aktar",
      "export_desc": "Pano geçmişinizi JSON dosyası olarak kaydedin",
      "export_button": "JSON Dışa Aktar",
      "import": "Veri İçe Aktar",
      "import_desc": "Önceden dışa aktarılmış dosyadan geri yükleyin",
      "import_button": "JSON İçe Aktar",
      "import_success": "İçe aktarma başarılı! {count} öğe eklendi.",
      "import_error": "İçe aktarma başarısız! Geçersiz veya bozuk dosya.",
      "export_success": "Dışa aktarma başarılı!",
      "export_error": "Dışa aktarma başarısız!",
      "choose_file": "JSON Dosyası Seç",
      "file_selected": "Dosya seçildi: {filename}",
      "no_file_selected": "Dosya seçilmedi"
    },
    "errors": {
      "copy_failed": "Kopyalama başarısız!",
      "delete_failed": "Silme başarısız!",
      "clear_failed": "Temizleme başarısız!",
      "save_settings_failed": "Ayarlar kaydedilemedi!"
    }
  }
};

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
  const data = BUILTIN_TRANSLATIONS[lang] || BUILTIN_TRANSLATIONS[DEFAULT_LANGUAGE] || {};
  translations[lang] = data;
  return data;
}
async function t(key, params = {}, lang = currentLanguage) {
  try {
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
      return result.replace(/\{(\w+)\}/g, (match, paramName) => {
        return params[paramName] !== undefined ? params[paramName] : match;
      });
    }

    return result || key;
  } catch {
    return key;
  }
}

async function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) lang = DEFAULT_LANGUAGE;
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  updateCurrentLanguageUI();

  if (window.updatePageTexts) {
    await window.updatePageTexts().catch(error => {
      console.error('Page text update failed:', error);
    });
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
