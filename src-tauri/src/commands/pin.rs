use crate::database;

#[tauri::command]
pub fn toggle_pin(id: i64) -> Result<(), String> {
    let conn = database::init_db();

    // Önce mevcut pin durumunu al
    let current_pinned: bool = conn
        .query_row(
            "SELECT pinned FROM clipboard_history WHERE id = ?",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get current pin status: {}", e))?;

    // Pin durumunu tersine çevir
    let new_pinned = !current_pinned;

    conn.execute(
        "UPDATE clipboard_history SET pinned = ? WHERE id = ?",
        [new_pinned as i32, id as i32],
    )
    .map_err(|e| format!("Failed to update pin status: {}", e))?;

    Ok(())
}
