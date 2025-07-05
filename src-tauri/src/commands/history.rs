use crate::database;
use crate::models::ClipboardItem;

#[tauri::command]
pub fn get_clipboard_history() -> Vec<ClipboardItem> {
    let conn = database::init_db();
    database::migrate_database(&conn);

    let mut stmt = conn
        .prepare("SELECT id, content, content_type, image_data, created_at, pinned FROM clipboard_history ORDER BY pinned DESC, id DESC LIMIT 50")
        .expect("Failed to prepare query");

    stmt.query_map([], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            content: row.get(1)?,
            content_type: row.get(2)?,
            image_data: row.get(3)?,
            created_at: row.get(4)?,
            pinned: row.get(5)?,
        })
    })
    .expect("Failed to execute query")
    .filter_map(Result::ok)
    .collect()
} 