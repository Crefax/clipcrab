use crate::clipboard::content;
use crate::database;
use crate::models::ClipboardUpdateEvent;
use crate::security;
use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose, Engine as _};
use image::ImageBuffer;
use rusqlite::{params, Connection};
use std::io::Cursor;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

const POLL_INTERVAL: Duration = Duration::from_millis(300);
const MAX_CONSECUTIVE_ERRORS: u32 = 10;
const MAX_CLIPBOARD_RETRIES: u32 = 5;
const THUMBNAIL_MAX_SIDE: u32 = 320;

#[derive(Clone)]
struct IgnoredClipboard {
    value: String,
    expires_at: Instant,
}

#[derive(Clone, Debug)]
struct SourceInfo {
    app_name: String,
    window_title: String,
}

static IGNORED_HASH: OnceLock<Mutex<Option<IgnoredClipboard>>> = OnceLock::new();
static IGNORED_KIND: OnceLock<Mutex<Option<IgnoredClipboard>>> = OnceLock::new();

pub fn ignore_next_clipboard_hash(hash: String, ttl_seconds: u64) {
    let ignored = IgnoredClipboard {
        value: hash,
        expires_at: Instant::now() + Duration::from_secs(ttl_seconds),
    };
    let mut guard = IGNORED_HASH
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(ignored);
}

pub fn ignore_next_clipboard_change(content_type: &str, ttl_seconds: u64) {
    let ignored = IgnoredClipboard {
        value: content_type.to_string(),
        expires_at: Instant::now() + Duration::from_secs(ttl_seconds),
    };
    let mut guard = IGNORED_KIND
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(ignored);
}

pub fn start_clipboard_watcher(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        let conn = database::init_db_for_watcher();
        let Some(mut clipboard) = create_clipboard_with_retry() else {
            return;
        };

        let mut last_clip_text = clipboard.get_text().unwrap_or_default();
        let mut last_clip_image_signature = clipboard
            .get_image()
            .ok()
            .map(|image| image_signature(&image));
        let mut consecutive_errors = 0;

        loop {
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                thread::sleep(Duration::from_secs(5));
                consecutive_errors = 0;
                continue;
            }

            match handle_text_clipboard(&conn, &app_handle, &mut clipboard, &mut last_clip_text) {
                Ok(()) => consecutive_errors = 0,
                Err(_) => consecutive_errors += 1,
            }

            match handle_image_clipboard(
                &conn,
                &app_handle,
                &mut clipboard,
                &mut last_clip_image_signature,
            ) {
                Ok(()) => consecutive_errors = 0,
                Err(_) => consecutive_errors += 1,
            }

            thread::sleep(POLL_INTERVAL);
        }
    });
}

fn create_clipboard_with_retry() -> Option<Clipboard> {
    let mut retry_count = 0;

    while retry_count < MAX_CLIPBOARD_RETRIES {
        match Clipboard::new() {
            Ok(clipboard) => {
                println!("Clipboard initialized successfully");
                return Some(clipboard);
            }
            Err(error) => {
                retry_count += 1;
                eprintln!(
                    "Failed to initialize clipboard (attempt {}/{}): {}",
                    retry_count, MAX_CLIPBOARD_RETRIES, error
                );
                if retry_count < MAX_CLIPBOARD_RETRIES {
                    thread::sleep(Duration::from_secs(2));
                }
            }
        }
    }

    eprintln!(
        "Clipboard watcher disabled after {} failed attempts.",
        MAX_CLIPBOARD_RETRIES
    );
    None
}

fn handle_text_clipboard(
    conn: &Connection,
    app_handle: &tauri::AppHandle,
    clipboard: &mut Clipboard,
    last_clip_text: &mut String,
) -> Result<(), ()> {
    let current = clipboard.get_text().map_err(|_| ())?;
    if current == *last_clip_text || current.trim().is_empty() {
        return Ok(());
    }

    let hash = content::content_hash("text", &current);
    if should_ignore_hash(&hash) {
        *last_clip_text = current;
        return Ok(());
    }

    let settings = database::settings::load_settings(conn);
    let source = current_source_info();
    if should_ignore_source(&settings, source.as_ref()) {
        *last_clip_text = current;
        return Ok(());
    }

    if !database::settings::should_capture_text(&settings, current.len()) {
        *last_clip_text = current;
        return Ok(());
    }

    if touch_existing_hash(conn, &hash) {
        *last_clip_text = current;
        emit_refresh(app_handle, "Clipboard item seen again");
        return Ok(());
    }

    let category = content::detect_category(&current);
    let preview = content::preview_text(&current);
    let content_size = current.len() as i64;
    let encrypted_content = security::encrypt(&current).unwrap_or_else(|error| {
        eprintln!("Failed to encrypt text content: {}", error);
        current.clone()
    });

    let result = conn.execute(
        "INSERT INTO clipboard_history (
            content, content_type, category, created_at, is_encrypted,
            content_hash, content_size, preview, source_app, last_seen_at, format_mask, schema_version
         ) VALUES (
            ?1, 'text', ?2, datetime('now', 'localtime'), 1,
            ?3, ?4, ?5, ?6, datetime('now', 'localtime'), 'text/plain', 2
         )",
        params![
            encrypted_content,
            category,
            hash,
            content_size,
            preview,
            source_label(source.as_ref())
        ],
    );

    if result.is_ok() {
        database::settings::enforce_retention(conn);
        emit_refresh(app_handle, "New text clipboard item added");
    } else if let Err(error) = result {
        eprintln!("Failed to insert text clipboard item: {}", error);
    }

    *last_clip_text = current;
    Ok(())
}

fn handle_image_clipboard(
    conn: &Connection,
    app_handle: &tauri::AppHandle,
    clipboard: &mut Clipboard,
    last_clip_image_signature: &mut Option<String>,
) -> Result<(), ()> {
    let image = clipboard.get_image().map_err(|_| ())?;
    let signature = image_signature(&image);

    if Some(&signature) == last_clip_image_signature.as_ref() {
        return Ok(());
    }

    if should_ignore_kind("image") {
        *last_clip_image_signature = Some(signature);
        return Ok(());
    }

    let encoded = match encode_image_payload(&image) {
        Ok(encoded) => encoded,
        Err(error) => {
            eprintln!("Failed to encode clipboard image: {}", error);
            *last_clip_image_signature = Some(signature);
            return Ok(());
        }
    };

    let settings = database::settings::load_settings(conn);
    let source = current_source_info();
    if should_ignore_source(&settings, source.as_ref()) {
        *last_clip_image_signature = Some(signature);
        return Ok(());
    }

    if !database::settings::should_capture_image(&settings, encoded.image_size) {
        *last_clip_image_signature = Some(signature);
        return Ok(());
    }

    if touch_existing_hash(conn, &encoded.content_hash) {
        *last_clip_image_signature = Some(signature);
        emit_refresh(app_handle, "Clipboard image seen again");
        return Ok(());
    }

    let encrypted_content = security::encrypt(&encoded.content).unwrap_or_else(|error| {
        eprintln!("Failed to encrypt image label: {}", error);
        encoded.content.clone()
    });
    let encrypted_image = security::encrypt(&encoded.base64_image).unwrap_or_else(|error| {
        eprintln!("Failed to encrypt image data: {}", error);
        encoded.base64_image.clone()
    });
    let encrypted_thumbnail = match encoded.thumbnail_base64 {
        Some(value) => match security::encrypt(&value) {
            Ok(encrypted) => Some(encrypted),
            Err(error) => {
                eprintln!("Failed to encrypt image thumbnail: {}", error);
                Some(value)
            }
        },
        None => None,
    };

    let result = conn.execute(
        "INSERT INTO clipboard_history (
            content, content_type, category, image_data, created_at, is_encrypted,
            content_hash, content_size, image_size, image_width, image_height,
            thumbnail_data, preview, source_app, last_seen_at, format_mask, schema_version
         ) VALUES (
            ?1, 'image', 'image', ?2, datetime('now', 'localtime'), 1,
            ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now', 'localtime'), 'image/png', 2
         )",
        params![
            encrypted_content,
            encrypted_image,
            encoded.content_hash,
            encoded.content.len() as i64,
            encoded.image_size,
            encoded.width as i64,
            encoded.height as i64,
            encrypted_thumbnail,
            encoded.content,
            source_label(source.as_ref()),
        ],
    );

    if result.is_ok() {
        database::settings::enforce_retention(conn);
        emit_refresh(app_handle, "New image clipboard item added");
    } else if let Err(error) = result {
        eprintln!("Failed to insert image clipboard item: {}", error);
    }

    *last_clip_image_signature = Some(signature);
    Ok(())
}

fn should_ignore_hash(hash: &str) -> bool {
    should_ignore(IGNORED_HASH.get_or_init(|| Mutex::new(None)), hash)
}

fn should_ignore_kind(content_type: &str) -> bool {
    should_ignore(IGNORED_KIND.get_or_init(|| Mutex::new(None)), content_type)
}

fn should_ignore(slot: &Mutex<Option<IgnoredClipboard>>, value: &str) -> bool {
    let mut guard = slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(ignored) = guard.as_ref() else {
        return false;
    };

    if ignored.expires_at <= Instant::now() {
        *guard = None;
        return false;
    }

    if ignored.value == value {
        *guard = None;
        return true;
    }

    false
}

fn touch_existing_hash(conn: &Connection, hash: &str) -> bool {
    if hash.is_empty() {
        return false;
    }

    conn.execute(
        "UPDATE clipboard_history
         SET last_seen_at = datetime('now', 'localtime')
         WHERE id = (
            SELECT id FROM clipboard_history
            WHERE content_hash = ?1
            ORDER BY id DESC
            LIMIT 1
         )",
        [hash],
    )
    .map(|updated| updated > 0)
    .unwrap_or(false)
}

fn should_ignore_source(
    settings: &database::settings::AppSettings,
    source: Option<&SourceInfo>,
) -> bool {
    let Some(source) = source else {
        return false;
    };

    let app = source.app_name.to_ascii_lowercase();
    let title = source.window_title.to_ascii_lowercase();
    if contains_private_marker(&title) {
        return true;
    }

    settings.ignore_apps.iter().any(|ignored| {
        let ignored = ignored.trim().to_ascii_lowercase();
        !ignored.is_empty() && (app.contains(&ignored) || title.contains(&ignored))
    })
}

fn contains_private_marker(title: &str) -> bool {
    [
        "incognito",
        "inprivate",
        "private browsing",
        "private window",
    ]
    .iter()
    .any(|marker| title.contains(marker))
}

fn source_label(source: Option<&SourceInfo>) -> Option<String> {
    source.map(|source| {
        if source.window_title.is_empty() {
            source.app_name.clone()
        } else {
            format!("{} - {}", source.app_name, source.window_title)
        }
    })
}

#[cfg(windows)]
fn current_source_info() -> Option<SourceInfo> {
    use std::path::Path;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 {
            return None;
        }

        let mut title_buffer = vec![0u16; 512];
        let title_len = GetWindowTextW(hwnd, title_buffer.as_mut_ptr(), title_buffer.len() as i32);
        let window_title = if title_len > 0 {
            String::from_utf16_lossy(&title_buffer[..title_len as usize])
        } else {
            String::new()
        };

        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if process_id == 0 {
            return Some(SourceInfo {
                app_name: String::new(),
                window_title,
            });
        }

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process == 0 {
            return Some(SourceInfo {
                app_name: String::new(),
                window_title,
            });
        }

        let mut path_buffer = vec![0u16; 1024];
        let mut path_len = path_buffer.len() as u32;
        let app_name =
            if QueryFullProcessImageNameW(process, 0, path_buffer.as_mut_ptr(), &mut path_len) != 0
            {
                let path = String::from_utf16_lossy(&path_buffer[..path_len as usize]);
                Path::new(&path)
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or(path)
            } else {
                String::new()
            };

        CloseHandle(process);

        Some(SourceInfo {
            app_name,
            window_title,
        })
    }
}

#[cfg(not(windows))]
fn current_source_info() -> Option<SourceInfo> {
    None
}

fn image_signature(image: &ImageData<'_>) -> String {
    let mut signature_input = Vec::with_capacity(image.bytes.len() + 32);
    signature_input.extend_from_slice(image.width.to_string().as_bytes());
    signature_input.push(0);
    signature_input.extend_from_slice(image.height.to_string().as_bytes());
    signature_input.push(0);
    signature_input.extend_from_slice(&image.bytes);
    content::bytes_hash("image-raw", &signature_input)
}

struct EncodedImage {
    content: String,
    base64_image: String,
    thumbnail_base64: Option<String>,
    content_hash: String,
    image_size: i64,
    width: usize,
    height: usize,
}

fn encode_image_payload(image: &ImageData<'_>) -> Result<EncodedImage, String> {
    let mut bytes = image.bytes.to_vec();
    fix_broken_alpha_channel(&mut bytes);

    let original_png = encode_rgba_png(image.width as u32, image.height as u32, bytes.clone())?;
    let thumbnail_png = encode_thumbnail_png(image.width as u32, image.height as u32, bytes)?;
    let content = format!("Image ({}x{})", image.width, image.height);
    let content_hash = content::bytes_hash("image/png", &original_png);

    Ok(EncodedImage {
        content,
        base64_image: general_purpose::STANDARD.encode(&original_png),
        thumbnail_base64: thumbnail_png.map(|png| general_purpose::STANDARD.encode(&png)),
        content_hash,
        image_size: original_png.len() as i64,
        width: image.width,
        height: image.height,
    })
}

fn fix_broken_alpha_channel(bytes: &mut [u8]) {
    let first_alpha = bytes.get(3).copied().unwrap_or(255);
    let mut all_alpha_zero = true;
    let mut all_alpha_same = true;

    for chunk in bytes.chunks(4) {
        if chunk.len() == 4 {
            if chunk[3] != 0 {
                all_alpha_zero = false;
            }
            if chunk[3] != first_alpha {
                all_alpha_same = false;
            }
        }
    }

    if all_alpha_zero && all_alpha_same {
        for chunk in bytes.chunks_exact_mut(4) {
            chunk[3] = 255;
        }
    }
}

fn encode_rgba_png(width: u32, height: u32, bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let image = ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width, height, bytes)
        .ok_or_else(|| "invalid RGBA image buffer".to_string())?;
    let mut png_data = Vec::new();
    image
        .write_with_encoder(image::codecs::png::PngEncoder::new(&mut png_data))
        .map_err(|error| error.to_string())?;
    Ok(png_data)
}

fn encode_thumbnail_png(
    width: u32,
    height: u32,
    bytes: Vec<u8>,
) -> Result<Option<Vec<u8>>, String> {
    if width <= THUMBNAIL_MAX_SIDE && height <= THUMBNAIL_MAX_SIDE {
        return Ok(None);
    }

    let image = ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width, height, bytes)
        .ok_or_else(|| "invalid RGBA thumbnail buffer".to_string())?;
    let dynamic = image::DynamicImage::ImageRgba8(image);
    let thumbnail = dynamic.thumbnail(THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE);
    let mut cursor = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut cursor, image::ImageOutputFormat::Png)
        .map_err(|error| error.to_string())?;
    Ok(Some(cursor.into_inner()))
}

fn emit_refresh(app_handle: &tauri::AppHandle, message: &str) {
    let event = ClipboardUpdateEvent {
        action: "refresh".to_string(),
        message: message.to_string(),
    };

    if let Err(error) = app_handle.emit("clipboard-update", event) {
        eprintln!("Failed to send clipboard update event: {}", error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_ignore_matches_app_name_and_private_titles() {
        let settings = database::settings::AppSettings {
            ignore_apps: vec!["Bitwarden".to_string()],
            ..Default::default()
        };

        assert!(should_ignore_source(
            &settings,
            Some(&SourceInfo {
                app_name: "Bitwarden.exe".to_string(),
                window_title: "Vault".to_string(),
            })
        ));

        assert!(should_ignore_source(
            &settings,
            Some(&SourceInfo {
                app_name: "chrome.exe".to_string(),
                window_title: "InPrivate - Secret".to_string(),
            })
        ));

        assert!(!should_ignore_source(
            &settings,
            Some(&SourceInfo {
                app_name: "notepad.exe".to_string(),
                window_title: "notes.txt".to_string(),
            })
        ));
    }
}
