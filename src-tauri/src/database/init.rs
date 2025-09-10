use rusqlite::Connection;
use std::path::PathBuf;

pub fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir().expect("User data directory not found");
    path.push("ClipCrab");
    std::fs::create_dir_all(&path).expect("Failed to create data directory");
    path.push("clipboard.db");
    path
}

pub fn init_db() -> Connection {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).expect("Failed to open database");

    // Ana tabloyu oluştur (şifrelenmiş içerik için)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            content_type TEXT DEFAULT 'text',
            image_data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            pinned INTEGER DEFAULT 0,
            is_encrypted INTEGER DEFAULT 1
        )",
        [],
    )
    .expect("Failed to create table");

    // Mevcut tabloyu güncelle (eğer eski sürümse)
    super::migrate::migrate_database(&conn);

    conn
}
