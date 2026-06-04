use crate::clipboard::{content, watcher};
use crate::database;
use crate::models::{AppLogEntry, ClipboardItem, ClipboardListItem, Diagnostics};
use crate::security;
use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::io::Write;
use tauri::{async_runtime, Emitter, Manager};

const DEFAULT_PAGE_SIZE: i32 = 50;
const SEARCH_CHUNK_SIZE: i32 = 200;
const MAX_SEARCH_SCANNED_ROWS: i32 = 20_000;

type RawRow = (
    i64,
    String,
    String,
    String,
    Option<String>,
    String,
    bool,
    bool,
    Option<String>,
    Option<String>,
    i64,
    Option<i64>,
    Option<i64>,
    Option<i64>,
);

#[derive(Serialize, Deserialize)]
struct ClipboardExport {
    version: u32,
    encrypted: bool,
    items: Vec<ClipboardItem>,
}

#[tauri::command]
pub fn get_clipboard_count() -> i64 {
    let conn = database::init_db();
    conn.query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
        row.get(0)
    })
    .unwrap_or(0)
}

#[tauri::command]
pub async fn get_clipboard_history(
    limit: Option<i32>,
    offset: Option<i32>,
) -> Vec<ClipboardListItem> {
    async_runtime::spawn_blocking(move || get_clipboard_history_sync(limit, offset))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn search_clipboard_history(
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
    content_filter: Option<String>,
) -> Vec<ClipboardListItem> {
    async_runtime::spawn_blocking(move || {
        search_clipboard_history_sync(query, limit, offset, content_filter)
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn get_clipboard_item(id: i64) -> Result<ClipboardItem, String> {
    async_runtime::spawn_blocking(move || get_clipboard_item_sync(id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_clipboard_item(id: i64, plain_text: Option<bool>) -> Result<(), String> {
    async_runtime::spawn_blocking(move || copy_clipboard_item_sync(id, plain_text.unwrap_or(false)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn export_clipboard_history() -> Result<String, String> {
    let conn = database::init_db();
    let rows = load_raw_rows(&conn, None, None)?;
    let items: Vec<ClipboardItem> = rows.into_iter().filter_map(raw_to_full_item).collect();
    let export = ClipboardExport {
        version: 2,
        encrypted: false,
        items,
    };

    serde_json::to_string_pretty(&export).map_err(|e| format!("JSON failed: {e}"))
}

#[tauri::command]
pub fn import_clipboard_history(json_data: String) -> Result<usize, String> {
    let conn = database::init_db();
    let items = parse_import_items(&json_data)?;
    let mut inserted = 0;

    for item in items {
        if insert_plain_item(&conn, &item).is_ok() {
            inserted += 1;
        }
    }

    Ok(inserted)
}

#[tauri::command]
pub async fn get_diagnostics() -> Diagnostics {
    async_runtime::spawn_blocking(get_diagnostics_sync)
        .await
        .unwrap_or_else(|_| fallback_diagnostics())
}

fn get_diagnostics_sync() -> Diagnostics {
    let conn = database::init_db();
    let db_path = database::get_db_path();
    let log_path = get_log_path();
    let db_size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    let item_count = get_clipboard_count();
    let image_count = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_history WHERE content_type = 'image'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let image_payload_bytes = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(image_data)), 0) FROM clipboard_history WHERE image_data IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let largest_image_bytes = conn
        .query_row(
            "SELECT COALESCE(MAX(LENGTH(image_data)), 0) FROM clipboard_history WHERE image_data IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let app_log_count = conn
        .query_row("SELECT COUNT(*) FROM app_log", [], |row| row.get(0))
        .unwrap_or(0);
    let last_frontend_error = conn
        .query_row(
            "SELECT message FROM app_log
             WHERE target = 'frontend' AND level IN ('error', 'warn')
             ORDER BY id DESC
             LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    Diagnostics {
        db_path: db_path.display().to_string(),
        db_size,
        item_count,
        image_count,
        image_payload_bytes,
        largest_image_bytes,
        app_log_count,
        last_frontend_error,
        webview2_version: webview2_version(),
        log_path: log_path.display().to_string(),
    }
}

fn fallback_diagnostics() -> Diagnostics {
    let db_path = database::get_db_path();
    let log_path = get_log_path();
    Diagnostics {
        db_path: db_path.display().to_string(),
        db_size: 0,
        item_count: 0,
        image_count: 0,
        image_payload_bytes: 0,
        largest_image_bytes: 0,
        app_log_count: 0,
        last_frontend_error: None,
        webview2_version: webview2_version(),
        log_path: log_path.display().to_string(),
    }
}

#[tauri::command]
pub fn compact_database() -> Result<(), String> {
    let conn = database::init_db();
    conn.execute_batch("PRAGMA optimize; VACUUM;")
        .map_err(|e| format!("Compact failed: {e}"))
}

#[tauri::command]
pub fn log_frontend_error(level: String, message: String) -> Result<(), String> {
    let conn = database::init_db();
    let trimmed = truncate_for_log(&message);
    conn.execute(
        "INSERT INTO app_log(level, target, message, created_at)
         VALUES (?1, 'frontend', ?2, datetime('now', 'localtime'))",
        params![level, trimmed],
    )
    .map_err(|e| format!("Log failed: {e}"))?;
    append_log_file("frontend", &level, &trimmed)?;
    Ok(())
}

#[tauri::command]
pub fn get_app_logs(limit: Option<i32>) -> Vec<AppLogEntry> {
    let conn = database::init_db();
    let limit = normalize_limit(limit);
    let mut stmt = match conn.prepare(
        "SELECT id, level, target, message, created_at
         FROM app_log
         ORDER BY id DESC
         LIMIT ?1",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let logs = match stmt.query_map([limit], |row| {
        Ok(AppLogEntry {
            id: row.get(0)?,
            level: row.get(1)?,
            target: row.get(2)?,
            message: row.get(3)?,
            created_at: row.get(4)?,
        })
    }) {
        Ok(rows) => rows.filter_map(Result::ok).collect(),
        Err(_) => Vec::new(),
    };

    logs
}

#[tauri::command]
pub fn export_app_logs() -> Result<String, String> {
    let logs = get_app_logs(Some(500));
    let db_logs = serde_json::to_string_pretty(&logs).map_err(|e| e.to_string())?;
    let file_logs = std::fs::read_to_string(get_log_path()).unwrap_or_default();
    Ok(format!(
        "Database logs:\n{db_logs}\n\nFile logs:\n{file_logs}"
    ))
}

#[tauri::command]
pub fn reload_frontend(app_handle: tauri::AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    window
        .eval("window.location.reload()")
        .map_err(|e| format!("Reload failed: {e}"))
}

#[tauri::command]
pub fn hide_frontend(app_handle: tauri::AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let _ = window.emit("app-window-hidden", ());
    window.hide().map_err(|e| format!("Hide failed: {e}"))
}

fn get_clipboard_history_sync(limit: Option<i32>, offset: Option<i32>) -> Vec<ClipboardListItem> {
    let conn = database::init_db();
    let limit_value = normalize_limit(limit);
    let offset_value = offset.unwrap_or(0).max(0);

    match load_raw_rows(&conn, Some(limit_value), Some(offset_value)) {
        Ok(rows) => rows.into_iter().filter_map(raw_to_list_item).collect(),
        Err(_) => Vec::new(),
    }
}

fn search_clipboard_history_sync(
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
    content_filter: Option<String>,
) -> Vec<ClipboardListItem> {
    let conn = database::init_db();
    search_clipboard_history_with_conn(&conn, query, limit, offset, content_filter)
}

fn search_clipboard_history_with_conn(
    conn: &Connection,
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
    content_filter: Option<String>,
) -> Vec<ClipboardListItem> {
    let limit_value = normalize_limit(limit);
    let match_offset = offset.unwrap_or(0).max(0) as usize;
    let query_lower = query.trim().to_lowercase();
    let filters = parse_filters(content_filter.as_deref());
    let is_unfiltered = query_lower.is_empty() && filters.is_empty();

    if is_unfiltered {
        let offset_value = offset.unwrap_or(0).max(0);
        return load_raw_rows(conn, Some(limit_value), Some(offset_value))
            .map(|rows| rows.into_iter().filter_map(raw_to_list_item).collect())
            .unwrap_or_default();
    }

    let mut db_offset = 0;
    let mut scanned = 0;
    let mut matched = 0usize;
    let mut results = Vec::new();

    while results.len() < limit_value as usize && scanned < MAX_SEARCH_SCANNED_ROWS {
        let rows = match load_raw_rows(conn, Some(SEARCH_CHUNK_SIZE), Some(db_offset)) {
            Ok(rows) if rows.is_empty() => break,
            Ok(rows) => rows,
            Err(_) => break,
        };

        scanned += rows.len() as i32;
        db_offset += SEARCH_CHUNK_SIZE;

        for row in rows {
            if !filters.is_empty() && !filters.contains(&row.3.as_str()) {
                continue;
            }

            let Some(item) = raw_to_list_item(row) else {
                continue;
            };

            if !query_lower.is_empty() && !item.content.to_lowercase().contains(&query_lower) {
                continue;
            }

            if matched < match_offset {
                matched += 1;
                continue;
            }

            results.push(item);
            if results.len() >= limit_value as usize {
                break;
            }
        }
    }

    results
}

fn get_clipboard_item_sync(id: i64) -> Result<ClipboardItem, String> {
    let conn = database::init_db();
    let mut rows = load_raw_rows_by_id(&conn, id)?;
    rows.pop()
        .and_then(raw_to_full_item)
        .ok_or_else(|| "Clipboard item not found".to_string())
}

fn copy_clipboard_item_sync(id: i64, plain_text: bool) -> Result<(), String> {
    let item = get_clipboard_item_sync(id)?;
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard failed: {e}"))?;

    if item.content_type == "image" {
        let Some(image_data) = item.image_data.as_deref() else {
            return Err("Image data missing".to_string());
        };
        let png_bytes = general_purpose::STANDARD
            .decode(image_data)
            .map_err(|e| format!("Image decode failed: {e}"))?;
        let decoded = image::load_from_memory(&png_bytes)
            .map_err(|e| format!("Image load failed: {e}"))?
            .to_rgba8();
        let (width, height) = decoded.dimensions();

        watcher::ignore_next_clipboard_change("image", 2);
        clipboard
            .set_image(ImageData {
                width: width as usize,
                height: height as usize,
                bytes: Cow::Owned(decoded.into_raw()),
            })
            .map_err(|e| format!("Image copy failed: {e}"))?;
    } else {
        let text = if plain_text {
            strip_text_formatting(&item.content)
        } else {
            item.content
        };
        let hash = content::content_hash("text", &text);
        watcher::ignore_next_clipboard_hash(hash, 2);
        clipboard
            .set_text(text)
            .map_err(|e| format!("Text copy failed: {e}"))?;
    }

    Ok(())
}

fn load_raw_rows(
    conn: &Connection,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<RawRow>, String> {
    let sql = match (limit, offset) {
        (Some(_), Some(_)) => {
            "SELECT id, content, content_type, COALESCE(category, 'text'), image_data, created_at,
                    pinned, is_encrypted, thumbnail_data, preview, COALESCE(content_size, 0),
                    image_size, image_width, image_height
             FROM clipboard_history
             ORDER BY pinned DESC, id DESC
             LIMIT ?1 OFFSET ?2"
        }
        _ => {
            "SELECT id, content, content_type, COALESCE(category, 'text'), image_data, created_at,
                    pinned, is_encrypted, thumbnail_data, preview, COALESCE(content_size, 0),
                    image_size, image_width, image_height
             FROM clipboard_history
             ORDER BY id ASC"
        }
    };

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("Prepare failed: {e}"))?;

    if let (Some(limit), Some(offset)) = (limit, offset) {
        let mapped = stmt
            .query_map(params![limit, offset], raw_row_from_sql)
            .map_err(|e| format!("Query failed: {e}"))?;
        Ok(mapped.filter_map(Result::ok).collect())
    } else {
        let mapped = stmt
            .query_map([], raw_row_from_sql)
            .map_err(|e| format!("Query failed: {e}"))?;
        Ok(mapped.filter_map(Result::ok).collect())
    }
}

fn load_raw_rows_by_id(conn: &Connection, id: i64) -> Result<Vec<RawRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, content, content_type, COALESCE(category, 'text'), image_data, created_at,
                    pinned, is_encrypted, thumbnail_data, preview, COALESCE(content_size, 0),
                    image_size, image_width, image_height
             FROM clipboard_history
             WHERE id = ?1
             LIMIT 1",
        )
        .map_err(|e| format!("Prepare failed: {e}"))?;
    let mapped = stmt
        .query_map([id], raw_row_from_sql)
        .map_err(|e| format!("Query failed: {e}"))?;

    Ok(mapped.filter_map(Result::ok).collect())
}

fn raw_row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<RawRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
        row.get(12)?,
        row.get(13)?,
    ))
}

fn raw_to_list_item(row: RawRow) -> Option<ClipboardListItem> {
    let (
        id,
        content,
        content_type,
        category,
        _image_data,
        created_at,
        pinned,
        is_encrypted,
        thumbnail_data,
        stored_preview,
        content_size,
        image_size,
        image_width,
        image_height,
    ) = row;

    let decrypted_content = decrypt_if_needed(content, is_encrypted)?;
    let display_content = stored_preview
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| content::preview_text(&decrypted_content));
    let effective_content_size = if content_size > 0 {
        content_size
    } else {
        decrypted_content.len() as i64
    };

    let decrypted_thumbnail = match (thumbnail_data, is_encrypted) {
        (Some(value), true) if !value.is_empty() => security::decrypt(&value).ok(),
        (Some(value), _) if !value.is_empty() => Some(value),
        _ => None,
    };

    Some(ClipboardListItem {
        id,
        content: display_content,
        content_type,
        category,
        image_data: decrypted_thumbnail.clone(),
        thumbnail_data: decrypted_thumbnail,
        created_at,
        pinned,
        content_size: effective_content_size,
        image_size,
        image_width,
        image_height,
    })
}

fn raw_to_full_item(row: RawRow) -> Option<ClipboardItem> {
    let (
        id,
        content,
        content_type,
        category,
        image_data,
        created_at,
        pinned,
        is_encrypted,
        _thumbnail_data,
        _stored_preview,
        _content_size,
        _image_size,
        _image_width,
        _image_height,
    ) = row;

    let decrypted_content = decrypt_if_needed(content, is_encrypted)?;
    let decrypted_image = match (image_data, is_encrypted) {
        (Some(value), true) if !value.is_empty() => security::decrypt(&value).ok(),
        (Some(value), _) if !value.is_empty() => Some(value),
        _ => None,
    };

    Some(ClipboardItem {
        id,
        content: decrypted_content,
        content_type,
        category,
        image_data: decrypted_image,
        created_at,
        pinned,
    })
}

fn decrypt_if_needed(content: String, is_encrypted: bool) -> Option<String> {
    if is_encrypted {
        security::decrypt(&content).ok()
    } else {
        Some(content)
    }
}

fn insert_plain_item(conn: &Connection, item: &ClipboardItem) -> Result<(), String> {
    let category = if item.category.trim().is_empty() {
        content::detect_category(&item.content).to_string()
    } else {
        item.category.clone()
    };
    let content_hash = content::content_hash(&item.content_type, &item.content);
    let preview = content::preview_text(&item.content);
    let content_size = item.content.len() as i64;
    let image_size = item.image_data.as_ref().map(|value| value.len() as i64);
    let encrypted_content = security::encrypt(&item.content)?;
    let encrypted_image = match item.image_data.as_deref() {
        Some(value) if !value.is_empty() => Some(security::encrypt(value)?),
        _ => None,
    };

    conn.execute(
        "INSERT INTO clipboard_history (
            content, content_type, category, image_data, created_at, pinned, is_encrypted,
            content_hash, content_size, image_size, preview, schema_version
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, 2)",
        params![
            encrypted_content,
            item.content_type,
            category,
            encrypted_image,
            item.created_at,
            item.pinned,
            content_hash,
            content_size,
            image_size,
            preview,
        ],
    )
    .map_err(|e| format!("Import insert failed: {e}"))?;
    Ok(())
}

fn parse_import_items(json_data: &str) -> Result<Vec<ClipboardItem>, String> {
    if let Ok(export) = serde_json::from_str::<ClipboardExport>(json_data) {
        if export.encrypted {
            return Err(
                "Encrypted history backups are not supported by portable import".to_string(),
            );
        }
        return Ok(export.items);
    }

    serde_json::from_str::<Vec<ClipboardItem>>(json_data).map_err(|e| e.to_string())
}

fn normalize_limit(limit: Option<i32>) -> i32 {
    match limit {
        Some(value) if value > 0 => value.min(500),
        _ => DEFAULT_PAGE_SIZE,
    }
}

fn parse_filters(content_filter: Option<&str>) -> Vec<&str> {
    let allowed = ["text", "url", "image", "code", "email"];
    let Some(filter_string) = content_filter else {
        return Vec::new();
    };

    filter_string
        .split(',')
        .map(str::trim)
        .filter(|filter| !filter.is_empty() && *filter != "all")
        .filter(|filter| allowed.contains(filter))
        .collect()
}

fn strip_text_formatting(value: &str) -> String {
    value.replace('\r', "")
}

fn truncate_for_log(value: &str) -> String {
    const MAX_LOG_CHARS: usize = 2000;
    let mut output = String::new();
    for (idx, ch) in value.chars().enumerate() {
        if idx >= MAX_LOG_CHARS {
            output.push_str("...");
            break;
        }
        output.push(ch);
    }
    output
}

fn get_log_path() -> std::path::PathBuf {
    let mut dir = database::get_db_path()
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    dir.push("logs");
    let _ = std::fs::create_dir_all(&dir);
    dir.push("clipcrab.log");
    dir
}

fn append_log_file(target: &str, level: &str, message: &str) -> Result<(), String> {
    let path = get_log_path();
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Open log failed: {e}"))?;
    let line = format!(
        "{} [{}] {}: {}\n",
        chrono_like_timestamp(),
        level,
        target,
        message.replace('\n', "\\n")
    );
    file.write_all(line.as_bytes())
        .map_err(|e| format!("Write log failed: {e}"))
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    seconds.to_string()
}

#[cfg(windows)]
fn webview2_version() -> Option<String> {
    let keys = [
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        r"HKCU\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    ];

    for key in keys {
        let output = std::process::Command::new("reg")
            .args(["query", key, "/v", "pv"])
            .output();
        let Ok(output) = output else {
            continue;
        };
        if !output.status.success() {
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("REG_SZ") {
                if let Some(version) = line.split_whitespace().last() {
                    if !version.is_empty() && version != "0.0.0.0" {
                        return Some(version.to_string());
                    }
                }
            }
        }
    }

    None
}

#[cfg(not(windows))]
fn webview2_version() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_are_allowlisted() {
        assert_eq!(
            parse_filters(Some("text,image,not-a-filter,all")),
            vec!["text", "image"]
        );
    }

    #[test]
    fn import_accepts_old_array_format() {
        let json = r#"[{"id":1,"content":"hello","content_type":"text","category":"text","image_data":null,"created_at":"2026-01-01 00:00:00","pinned":false}]"#;
        let items = parse_import_items(json).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, "hello");
    }

    #[test]
    fn import_rejects_encrypted_wrapper_format() {
        let json = r#"{"version":2,"encrypted":true,"items":[]}"#;
        match parse_import_items(json) {
            Err(error) => assert!(error.contains("Encrypted history backups")),
            Ok(_) => panic!("encrypted import wrapper should be rejected"),
        }
    }

    #[test]
    fn search_finds_matches_beyond_first_chunk() {
        let conn = Connection::open_in_memory().unwrap();
        create_test_history_table(&conn);

        conn.execute(
            "INSERT INTO clipboard_history (
                content, content_type, category, created_at, pinned, is_encrypted,
                content_hash, content_size, schema_version
             ) VALUES ('target item outside first chunk', 'text', 'text', '2026-01-01 00:00:00', 0, 0, 'target-hash', 31, 2)",
            [],
        )
        .unwrap();

        for index in 0..(SEARCH_CHUNK_SIZE + 25) {
            conn.execute(
                "INSERT INTO clipboard_history (
                    content, content_type, category, created_at, pinned, is_encrypted,
                    content_hash, content_size, schema_version
                 ) VALUES (?1, 'text', 'text', '2026-01-01 00:00:00', 0, 0, ?2, ?3, 2)",
                params![
                    format!("ordinary item {index}"),
                    format!("hash-{index}"),
                    15_i64
                ],
            )
            .unwrap();
        }

        let results = search_clipboard_history_with_conn(
            &conn,
            "target item".to_string(),
            Some(5),
            Some(0),
            None,
        );

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "target item outside first chunk");
    }

    #[test]
    fn unfiltered_search_uses_supplied_connection() {
        let conn = Connection::open_in_memory().unwrap();
        create_test_history_table(&conn);
        conn.execute(
            "INSERT INTO clipboard_history (
                content, content_type, category, created_at, pinned, is_encrypted,
                content_hash, content_size, schema_version
             ) VALUES ('connection local item', 'text', 'text', '2026-01-01 00:00:00', 0, 0, 'local-hash', 21, 2)",
            [],
        )
        .unwrap();

        let results =
            search_clipboard_history_with_conn(&conn, "".to_string(), Some(5), Some(0), None);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "connection local item");
    }

    fn create_test_history_table(conn: &Connection) {
        conn.execute(
            "CREATE TABLE clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                content_type TEXT DEFAULT 'text',
                category TEXT DEFAULT 'text',
                image_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                pinned INTEGER DEFAULT 0,
                is_encrypted INTEGER DEFAULT 0,
                thumbnail_data TEXT,
                preview TEXT,
                content_size INTEGER DEFAULT 0,
                image_size INTEGER,
                image_width INTEGER,
                image_height INTEGER,
                content_hash TEXT DEFAULT '',
                schema_version INTEGER DEFAULT 2
            )",
            [],
        )
        .unwrap();
    }
}
