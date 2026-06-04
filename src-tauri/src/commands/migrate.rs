use crate::database;

#[tauri::command]
pub fn force_update_categories() -> String {
    let conn = database::init_db();
    let total = conn
        .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap_or(0);

    database::migrate::update_existing_categories(&conn);

    format!("Metadata refreshed for {} records", total)
}
