use crate::database;
use crate::models::ClipboardUpdateEvent;
use tauri::Emitter;

#[tauri::command]
pub fn delete_clipboard_item(id: i64, app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = database::init_db();

    conn.execute("DELETE FROM clipboard_history WHERE id = ?1", [id])
        .map_err(|e| format!("Delete error: {}", e))?;

    // Frontend'e silme eventi gönder
    let event = ClipboardUpdateEvent {
        action: "refresh".to_string(),
        message: "Öğe silindi, listeyi yenileyin".to_string(),
    };

    println!("Silme eventi gönderiliyor: {:?}", event);
    match app_handle.emit("clipboard-update", event) {
        Ok(_) => println!("Silme eventi başarıyla gönderildi"),
        Err(e) => eprintln!("Failed to send delete event: {}", e),
    }

    Ok(())
}
