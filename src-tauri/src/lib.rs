pub mod clipboard;
pub mod commands;
pub mod database;
pub mod models;
pub mod security;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

fn enable_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Create menu items
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    // Build menu
    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&hide_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // Create tray icon
    let _tray = TrayIconBuilder::with_id("tray")
        .icon(Image::from_bytes(include_bytes!("../icons/icon.png"))?)
        .menu(&menu)
        .tooltip("ClipCrab - Clipboard Manager")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    ..
                } => {
                    if let Some(app) = tray.app_handle().get_webview_window("main") {
                        if app.is_visible().unwrap_or(false) {
                            let _ = app.set_focus(); // Gizleme yerine sadece focus yap
                        } else {
                            let _ = app.show();
                            let _ = app.set_focus();
                        }
                    }
                }
                tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Right,
                    ..
                } => {
                    // Sağ tıklamada menü otomatik olarak gösterilir, hiçbir şey yapmamız gerekmez
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            if let Err(e) = enable_tray(app) {
                eprintln!("Tray icon setup failed: {}", e);
            }

            // DevTools'u aç (debug için)
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }

            // Veritabanı migration'ını çalıştır
            let _ = commands::force_update_categories();

            clipboard::start_clipboard_watcher(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::get_clipboard_count,
            commands::search_clipboard_history,
            commands::delete_clipboard_item,
            commands::clear_all_history,
            commands::toggle_pin,
            commands::export_clipboard_history,
            commands::import_clipboard_history,
            commands::is_first_run,
            commands::complete_first_run,
            commands::force_update_categories
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start Tauri application");
}
