pub mod models;
pub mod database;
pub mod clipboard;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            clipboard::start_clipboard_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::delete_clipboard_item,
            commands::clear_all_history,
            commands::toggle_pin
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start Tauri application");
}
