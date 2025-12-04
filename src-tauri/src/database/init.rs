use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Once;

// Tablo oluşturma sadece bir kez
static INIT: Once = Once::new();
// Migration kontrolü için
static MIGRATION: Once = Once::new();

pub fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir().expect("User data directory not found");
    path.push("ClipCrab");
    std::fs::create_dir_all(&path).expect("Failed to create data directory");
    path.push("clipboard.db");
    path
}

pub fn init_db() -> Connection {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");

    // SQLite performans optimizasyonları
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = 10000;
         PRAGMA temp_store = MEMORY;",
    )
    .ok();

    // Tablo oluşturma sadece bir kere çalışsın
    INIT.call_once(|| {
        // Ana tabloyu oluştur (şifrelenmiş içerik için)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                content_type TEXT DEFAULT 'text',
                category TEXT DEFAULT 'text',
                image_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                pinned INTEGER DEFAULT 0,
                is_encrypted INTEGER DEFAULT 1
            )",
            [],
        )
        .expect("Failed to create table");

        // Index oluştur (sorgu performansı için)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_pinned_id ON clipboard_history(pinned DESC, id DESC)",
            [],
        )
        .ok();

        // Kategori için index (filtreleme hızı için)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_category ON clipboard_history(category)",
            [],
        )
        .ok();
    });

    // Migration her başlatmada bir kez çalışsın
    MIGRATION.call_once(|| {
        super::migrate::migrate_database(&conn);
    });

    conn
}

// Watcher için ayrı bağlantı (uzun süreli kullanım için)
pub fn init_db_for_watcher() -> Connection {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");

    // WAL mode performans için
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )
    .ok();

    conn
}
