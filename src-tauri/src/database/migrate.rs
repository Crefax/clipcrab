use crate::{clipboard::content, security};
use rusqlite::Connection;

pub fn migrate_database(conn: &Connection) {
    create_support_tables(conn);
    ensure_clipboard_columns(conn);
    ensure_indexes(conn);
    mark_migration(conn, 2);
}

fn create_support_tables(conn: &Connection) {
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
}

fn ensure_clipboard_columns(conn: &Connection) {
    let columns = table_columns(conn);
    let additions = [
        (
            "content_type",
            "ALTER TABLE clipboard_history ADD COLUMN content_type TEXT DEFAULT 'text'",
        ),
        (
            "image_data",
            "ALTER TABLE clipboard_history ADD COLUMN image_data TEXT",
        ),
        (
            "pinned",
            "ALTER TABLE clipboard_history ADD COLUMN pinned INTEGER DEFAULT 0",
        ),
        (
            "category",
            "ALTER TABLE clipboard_history ADD COLUMN category TEXT DEFAULT 'text'",
        ),
        (
            "is_encrypted",
            "ALTER TABLE clipboard_history ADD COLUMN is_encrypted INTEGER DEFAULT 1",
        ),
        (
            "content_hash",
            "ALTER TABLE clipboard_history ADD COLUMN content_hash TEXT DEFAULT ''",
        ),
        (
            "content_size",
            "ALTER TABLE clipboard_history ADD COLUMN content_size INTEGER DEFAULT 0",
        ),
        (
            "image_size",
            "ALTER TABLE clipboard_history ADD COLUMN image_size INTEGER",
        ),
        (
            "image_width",
            "ALTER TABLE clipboard_history ADD COLUMN image_width INTEGER",
        ),
        (
            "image_height",
            "ALTER TABLE clipboard_history ADD COLUMN image_height INTEGER",
        ),
        (
            "thumbnail_data",
            "ALTER TABLE clipboard_history ADD COLUMN thumbnail_data TEXT",
        ),
        (
            "preview",
            "ALTER TABLE clipboard_history ADD COLUMN preview TEXT",
        ),
        (
            "source_app",
            "ALTER TABLE clipboard_history ADD COLUMN source_app TEXT",
        ),
        (
            "last_seen_at",
            "ALTER TABLE clipboard_history ADD COLUMN last_seen_at TEXT",
        ),
        (
            "format_mask",
            "ALTER TABLE clipboard_history ADD COLUMN format_mask TEXT",
        ),
        (
            "schema_version",
            "ALTER TABLE clipboard_history ADD COLUMN schema_version INTEGER DEFAULT 2",
        ),
    ];

    for (column, sql) in additions {
        if !columns.iter().any(|existing| existing == column) {
            conn.execute(sql, []).ok();
        }
    }

    conn.execute(
        "UPDATE clipboard_history
         SET category = 'image'
         WHERE content_type = 'image' AND (category IS NULL OR category = '' OR category = 'text')",
        [],
    )
    .ok();
}

fn ensure_indexes(conn: &Connection) {
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_pinned_id ON clipboard_history(pinned DESC, id DESC)",
        [],
    )
    .ok();

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
}

fn table_columns(conn: &Connection) -> Vec<String> {
    let mut stmt = match conn.prepare("PRAGMA table_info(clipboard_history)") {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let columns = match stmt.query_map([], |row| row.get(1)) {
        Ok(mapped) => mapped.filter_map(Result::ok).collect(),
        Err(_) => Vec::new(),
    };

    columns
}

fn mark_migration(conn: &Connection, version: i64) {
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations(version, applied_at)
         VALUES (?1, datetime('now', 'localtime'))",
        [version],
    )
    .ok();
}

/// Recomputes categories and lightweight metadata on demand. This is intentionally
/// not called during startup because large encrypted histories can be expensive.
pub fn update_existing_categories(conn: &Connection) {
    conn.execute(
        "UPDATE clipboard_history SET category = 'image' WHERE content_type = 'image'",
        [],
    )
    .ok();

    let mut stmt = match conn.prepare(
        "SELECT id, content, content_type, is_encrypted
         FROM clipboard_history
         WHERE content_type != 'image'",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return,
    };

    let rows: Vec<(i64, String, String, bool)> = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, bool>(3).unwrap_or(false),
        ))
    }) {
        Ok(mapped) => mapped.filter_map(Result::ok).collect(),
        Err(_) => return,
    };

    for (id, content, content_type, is_encrypted) in rows {
        let decrypted = if is_encrypted {
            security::decrypt(&content).unwrap_or(content)
        } else {
            content
        };
        let category = content::detect_category(&decrypted);
        let preview = content::preview_text(&decrypted);
        let hash = content::content_hash(&content_type, &decrypted);
        let size = decrypted.len() as i64;

        conn.execute(
            "UPDATE clipboard_history
             SET category = ?1, preview = ?2, content_hash = ?3, content_size = ?4, schema_version = 2
             WHERE id = ?5",
            rusqlite::params![category, preview, hash, size, id],
        )
        .ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_adds_v2_columns_without_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        migrate_database(&conn);
        let columns = table_columns(&conn);

        assert!(columns.contains(&"content_hash".to_string()));
        assert!(columns.contains(&"thumbnail_data".to_string()));
        assert!(columns.contains(&"schema_version".to_string()));
    }
}
