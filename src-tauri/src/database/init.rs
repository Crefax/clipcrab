use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Once;

// Tablo oluşturma sadece bir kez
static INIT: Once = Once::new();
// Migration kontrolü için
static MIGRATION: Once = Once::new();

pub fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir().expect("User data directory not found");
    path.push("clipcrab");
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
                is_encrypted INTEGER DEFAULT 1,
                content_hash TEXT DEFAULT '',
                content_size INTEGER DEFAULT 0,
                image_size INTEGER,
                image_width INTEGER,
                image_height INTEGER,
                thumbnail_data TEXT,
                preview TEXT,
                source_app TEXT,
                last_seen_at TEXT,
                format_mask TEXT,
                schema_version INTEGER DEFAULT 2
            )",
            [],
        )
        .expect("Failed to create table");

        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .ok();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )
        .ok();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                target TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .ok();

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

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_history(content_hash)",
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
    let _ = init_db();

    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");

    // WAL mode performans için
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )
    .ok();

    super::migrate::migrate_database(&conn);

    conn
}
