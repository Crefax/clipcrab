use crate::database;
use crate::models::ClipboardUpdateEvent;
use tauri::Emitter;

#[tauri::command]
pub fn clear_all_history(app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = database::init_db();

    conn.execute("DELETE FROM clipboard_history", [])
        .map_err(|e| format!("Clear error: {}", e))?;

    // Frontend'e temizleme eventi gönder
    let event = ClipboardUpdateEvent {
        action: "refresh".to_string(),
        message: "Tüm geçmiş temizlendi, listeyi yenileyin".to_string(),
    };

    println!("Clear all eventi gönderiliyor: {:?}", event);
    match app_handle.emit("clipboard-update", event) {
        Ok(_) => println!("Clear all eventi başarıyla gönderildi"),
        Err(e) => eprintln!("Failed to send clear all event: {}", e),
    }

    Ok(())
}
