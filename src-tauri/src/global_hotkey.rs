#[cfg(windows)]
const QUICK_OPEN_HOTKEY_ID: i32 = 0x0C06;

#[cfg(windows)]
pub fn start_quick_open_hotkey(app_handle: tauri::AppHandle) {
    use crate::show_main_window;
    use std::{mem, thread};
    use tauri::{Emitter, Manager};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY};

    thread::spawn(move || unsafe {
        let registered = RegisterHotKey(
            0,
            QUICK_OPEN_HOTKEY_ID,
            MOD_CONTROL | MOD_ALT,
            u32::from(b'V'),
        ) != 0;

        if !registered {
            eprintln!("Global hotkey Ctrl+Alt+V could not be registered");
            return;
        }

        let mut msg: MSG = mem::zeroed();
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            if msg.message == WM_HOTKEY && msg.wParam == QUICK_OPEN_HOTKEY_ID as usize {
                let app = app_handle.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    if let Some(window) = app.get_webview_window("main") {
                        show_main_window(&window);
                        let _ = window.emit("quick-open-search", ());
                    }
                });
            }
        }

        UnregisterHotKey(0, QUICK_OPEN_HOTKEY_ID);
    });
}

#[cfg(not(windows))]
pub fn start_quick_open_hotkey(_app_handle: tauri::AppHandle) {}
