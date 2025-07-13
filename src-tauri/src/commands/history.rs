use crate::database;
use crate::models::ClipboardItem;
use crate::security;
use serde_json;

#[tauri::command]
pub fn get_clipboard_history() -> Vec<ClipboardItem> {
    let conn = database::init_db();
    database::migrate_database(&conn);

    // Basit bir yaklaşım: is_encrypted kolonunu try-catch ile kontrol et
    let mut stmt = match conn.prepare("SELECT id, content, content_type, image_data, created_at, pinned, is_encrypted FROM clipboard_history ORDER BY pinned DESC, id DESC LIMIT 50") {
        Ok(stmt) => stmt,
        Err(_) => {
            // is_encrypted kolonu yoksa eski formatı kullan
            let mut stmt = conn.prepare("SELECT id, content, content_type, image_data, created_at, pinned FROM clipboard_history ORDER BY pinned DESC, id DESC LIMIT 50")
                .expect("Failed to prepare query");
            
            return stmt.query_map([], |row| {
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_type: row.get(2)?,
                    image_data: row.get(3)?,
                    created_at: row.get(4)?,
                    pinned: row.get(5)?,
                })
            })
            .expect("Failed to execute query")
            .filter_map(Result::ok)
            .collect();
        }
    };

    stmt.query_map([], |row| {
        let mut content: String = row.get(1)?;
        let mut image_data: Option<String> = row.get(3)?;
        let is_encrypted: bool = row.get(6)?;
        
        // Eğer veri şifrelenmişse çöz
        if is_encrypted {
            if let Ok(decrypted_content) = security::decrypt(&content) {
                content = decrypted_content;
            }
            
            if let Some(ref img_data) = image_data {
                if let Ok(decrypted_image) = security::decrypt(img_data) {
                    image_data = Some(decrypted_image);
                }
            }
        }
        
        Ok(ClipboardItem {
            id: row.get(0)?,
            content,
            content_type: row.get(2)?,
            image_data,
            created_at: row.get(4)?,
            pinned: row.get(5)?,
        })
    })
    .expect("Failed to execute query")
    .filter_map(Result::ok)
    .collect()
} 

#[tauri::command]
pub fn export_clipboard_history() -> Result<String, String> {
    let conn = database::init_db();
    let mut stmt = match conn.prepare("SELECT id, content, content_type, image_data, created_at, pinned FROM clipboard_history ORDER BY id ASC") {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("[EXPORT ERROR] Prepare failed: {}", e);
            return Err(format!("Prepare failed: {}", e));
        }
    };
    let items: Vec<ClipboardItem> = match stmt.query_map([], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            content: row.get(1)?,
            content_type: row.get(2)?,
            image_data: row.get(3)?,
            created_at: row.get(4)?,
            pinned: row.get(5)?,
        })
    }) {
        Ok(map) => map.filter_map(Result::ok).collect(),
        Err(e) => {
            eprintln!("[EXPORT ERROR] Query failed: {}", e);
            return Err(format!("Query failed: {}", e));
        }
    };
    match serde_json::to_string_pretty(&items) {
        Ok(json) => Ok(json),
        Err(e) => {
            eprintln!("[EXPORT ERROR] JSON failed: {}", e);
            Err(format!("JSON failed: {}", e))
        }
    }
}

#[tauri::command]
pub fn import_clipboard_history(json_data: String) -> Result<usize, String> {
    let conn = database::init_db();
    let items: Vec<ClipboardItem> = serde_json::from_str(&json_data).map_err(|e| e.to_string())?;
    let mut inserted = 0;
    for item in items {
        let result = conn.execute(
            "INSERT INTO clipboard_history (content, content_type, image_data, created_at, pinned, is_encrypted) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            [
                &item.content,
                &item.content_type,
                &item.image_data.clone().unwrap_or_default(),
                &item.created_at,
                &item.pinned.to_string(),
            ],
        );
        if result.is_ok() {
            inserted += 1;
        }
    }
    Ok(inserted)
} 