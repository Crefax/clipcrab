pub mod clipboard;
pub mod commands;
pub mod database;
pub mod frontend_health;
pub mod global_hotkey;
pub mod models;
pub mod security;

use std::time::Duration;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindow, WindowEvent,
};

fn show_main_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
    if frontend_health::frontend_heartbeat_is_stale(Duration::from_secs(300)) {
        let _ = window.eval("window.location.reload()");
    }
    let _ = window.emit("app-window-shown", ());
}

fn hide_main_window(window: &WebviewWindow) {
    let _ = window.emit("app-window-hidden", ());
    let _ = window.hide();
}

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
                    show_main_window(&window);
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    hide_main_window(&window);
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
                            show_main_window(&app);
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
                let _ = window.emit("app-window-hidden", ());
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            if let Err(e) = enable_tray(app) {
                eprintln!("Tray icon setup failed: {}", e);
            }

            // Veritabanı migration'ını çalıştır
            clipboard::start_clipboard_watcher(app.handle().clone());
            global_hotkey::start_quick_open_hotkey(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::get_clipboard_item,
            commands::get_clipboard_count,
            commands::search_clipboard_history,
            commands::copy_clipboard_item,
            commands::delete_clipboard_item,
            commands::clear_all_history,
            commands::toggle_pin,
            commands::export_clipboard_history,
            commands::import_clipboard_history,
            commands::get_diagnostics,
            commands::compact_database,
            commands::log_frontend_error,
            commands::get_app_logs,
            commands::export_app_logs,
            commands::reload_frontend,
            commands::hide_frontend,
            commands::get_settings,
            commands::set_settings,
            frontend_health::report_frontend_status,
            commands::is_first_run,
            commands::complete_first_run,
            commands::force_update_categories
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start Tauri application");
}
