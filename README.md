# ClipCrab - Modern Clipboard Manager

ClipCrab, kopyalanan metinleri SQLite veritabanında saklayarak sonsuz bir geçmişe sahip olmanızı sağlayan modern bir clipboard manager uygulamasıdır.

## 🚀 Özellikler

- **Sonsuz Geçmiş**: Kopyaladığınız tüm metinler SQLite veritabanında güvenle saklanır
- **Modern Arayüz**: Gelişmiş ve kullanıcı dostu tasarım
- **Gerçek Zamanlı İzleme**: Clipboard değişikliklerini otomatik olarak algılar
- **Arama Fonksiyonu**: Geçmişinizde hızlıca arama yapın
- **Akıllı Kategorizasyon**: URL, e-posta, sayı ve metin türlerini otomatik algılar
- **Tek Tıkla Kopyalama**: Geçmiş öğelerini tek tıkla clipboard'a kopyalayın
- **Responsive Tasarım**: Tüm cihazlarda mükemmel görünüm
- **Klavye Kısayolları**: Hızlı erişim için kısayol tuşları

## 🎨 Arayüz Özellikleri

- **Gradient Tasarım**: Modern gradient arka planlar
- **Animasyonlar**: Yumuşak geçişler ve hover efektleri
- **Toast Bildirimleri**: Kullanıcı dostu geri bildirimler
- **İkonlar**: Font Awesome ikonları ile görsel zenginlik
- **Dark Mode Hazır**: Gelecekte dark mode desteği

## 🛠️ Teknolojiler

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Rust (Tauri)
- **Veritabanı**: SQLite
- **İkonlar**: Font Awesome 6.4.0
- **Stil**: Modern CSS Grid ve Flexbox

## 📦 Kurulum

### Gereksinimler

- Node.js (v16 veya üzeri)
- Rust (v1.70 veya üzeri)
- Tauri CLI

### Adımlar

1. **Projeyi klonlayın:**
   ```bash
   git clone https://github.com/yourusername/clipcrab.git
   cd clipcrab
   ```

2. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

3. **Uygulamayı çalıştırın:**
   ```bash
   npm run tauri dev
   ```

4. **Production build:**
   ```bash
   npm run tauri build
   ```

## ⌨️ Klavye Kısayolları

- `Ctrl/Cmd + F`: Arama kutusuna odaklan
- `Ctrl/Cmd + R`: Geçmişi yenile
- `Escape`: Arama kutusunu temizle ve odaktan çık

## 🔧 Yapılandırma

Uygulama otomatik olarak kullanıcının yerel veri dizininde SQLite veritabanı oluşturur:

- **Windows**: `%APPDATA%\Local\ClipCrab\clipboard.db`
- **macOS**: `~/Library/Application Support/ClipCrab/clipboard.db`
- **Linux**: `~/.local/share/ClipCrab/clipboard.db`

## 📱 Kullanım

1. **Otomatik İzleme**: Uygulama başlatıldığında clipboard değişikliklerini otomatik olarak izlemeye başlar
2. **Geçmiş Görüntüleme**: Kopyaladığınız tüm metinler ana ekranda listelenir
3. **Arama**: Üst kısımdaki arama kutusunu kullanarak geçmişinizde arama yapın
4. **Kopyalama**: Herhangi bir öğeye tıklayarak clipboard'a kopyalayın
5. **Silme**: Öğeleri tek tek veya toplu olarak silebilirsiniz

## 🎯 Özellik Detayları

### Akıllı Kategorizasyon
- **URL**: Web adresleri otomatik olarak algılanır
- **E-posta**: E-posta adresleri özel olarak işaretlenir
- **Sayı**: Sadece rakamlardan oluşan metinler
- **Uzun Metin**: 100 karakterden uzun metinler

### Arama Özellikleri
- Gerçek zamanlı arama
- Büyük/küçük harf duyarsız
- Kısmi eşleştirme
- Anında sonuçlar

### Performans
- Otomatik yenileme (30 saniyede bir)
- Lazy loading
- Optimized rendering
- Minimal memory usage

## 🔒 Gizlilik

- Tüm veriler yerel olarak saklanır
- Hiçbir veri internet üzerinden gönderilmez
- Veritabanı şifrelenmemiş olarak saklanır (geliştirilebilir)

## 🚧 Gelecek Özellikler

- [ ] Dark mode desteği
- [ ] Veritabanı şifreleme
- [ ] Cloud sync (opsiyonel)
- [ ] Kategoriler ve etiketler
- [ ] Favori öğeler
- [ ] Export/Import özellikleri
- [ ] Kısayol tuşları özelleştirme
- [ ] Sistem tray entegrasyonu

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakın.

## 🙏 Teşekkürler

- [Tauri](https://tauri.app/) - Modern desktop uygulama framework'ü
- [Font Awesome](https://fontawesome.com/) - İkonlar
- [SQLite](https://www.sqlite.org/) - Veritabanı motoru

---

**ClipCrab** - Clipboard geçmişinizi güvenle saklayın! 🦀
