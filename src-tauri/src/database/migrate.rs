use rusqlite::Connection;

pub fn migrate_database(conn: &Connection) {
    // content_type ve image_data sütunları var mı kontrol et
    let mut stmt = conn
        .prepare("PRAGMA table_info(clipboard_history)")
        .unwrap();
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    let has_content_type = columns.iter().any(|col| col == "content_type");
    let has_image_data = columns.iter().any(|col| col == "image_data");
    let has_pinned = columns.iter().any(|col| col == "pinned");

    if !has_content_type {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN content_type TEXT DEFAULT 'text'",
            [],
        )
        .expect("Failed to add content_type column");
    }
    if !has_image_data {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN image_data TEXT",
            [],
        )
        .expect("Failed to add image_data column");
    }
    if !has_pinned {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN pinned INTEGER DEFAULT 0",
            [],
        )
        .expect("Failed to add pinned column");
    }
}
