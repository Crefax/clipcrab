use crate::database;
use crate::models::ClipboardItem;
use crate::security;
use rayon::prelude::*;
use serde_json;
use tauri::async_runtime;

/// Toplam öğe sayısını döndür (pagination için)
#[tauri::command]
pub fn get_clipboard_count() -> i64 {
    let conn = database::init_db();
    conn.query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
        row.get(0)
    })
    .unwrap_or(0)
}

/// Tüm veritabanında arama yap - SQL ile kategori filtreleme (async)
#[tauri::command]
pub async fn search_clipboard_history(
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
    content_filter: Option<String>,
) -> Vec<ClipboardItem> {
    async_runtime::spawn_blocking(move || {
        search_clipboard_history_sync(query, limit, offset, content_filter)
    })
    .await
    .unwrap_or_else(|_| Vec::new())
}

/// Senkron arama fonksiyonu - SQL seviyesinde filtreleme
fn search_clipboard_history_sync(
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
    content_filter: Option<String>,
) -> Vec<ClipboardItem> {
    let conn = database::init_db();

    let limit_value = limit.unwrap_or(100);
    let offset_value = offset.unwrap_or(0);

    // Filtreleri parse et
    let filter_str = content_filter.as_deref().unwrap_or("all");
    let filters: Vec<&str> = filter_str.split(',').map(|s| s.trim()).collect();
    let is_all_filter = filters.len() == 1 && (filters[0] == "all" || filters[0].is_empty());

    // SQL WHERE koşulunu oluştur
    let category_condition = if is_all_filter {
        String::new()
    } else {
        let placeholders: Vec<String> = filters.iter().map(|f| format!("'{}'", f)).collect();
        // NULL kategorileri text olarak kabul et
        if filters.contains(&"text") {
            format!(
                " AND (COALESCE(category, 'text') IN ({}))",
                placeholders.join(",")
            )
        } else {
            format!(" AND category IN ({})", placeholders.join(","))
        }
    };

    // Query SQL - category ile filtreleme + pagination (SQL seviyesinde, çok hızlı)
    let sql = format!(
        "SELECT id, content, content_type, COALESCE(category, 'text') as category, image_data, created_at, pinned, is_encrypted 
         FROM clipboard_history 
         WHERE 1=1 {}
         ORDER BY pinned DESC, id DESC 
         LIMIT ?1 OFFSET ?2",
        category_condition
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(_) => {
            // category kolonu yoksa eski sorguyu kullan
            return search_without_category(&conn, &query, limit_value, offset_value, &filters);
        }
    };

    let rows: Vec<_> = match stmt.query_map([limit_value, offset_value], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?
                .unwrap_or_else(|| "text".to_string()),
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, bool>(6)?,
            row.get::<_, bool>(7)?,
        ))
    }) {
        Ok(mapped) => mapped.filter_map(Result::ok).collect(),
        Err(_) => return Vec::new(),
    };

    let query_lower = query.to_lowercase();
    let is_image_only = filters.len() == 1 && filters[0] == "image";

    // Paralel şifre çözme - çok daha hızlı
    rows.into_par_iter()
        .filter_map(
            |(
                id,
                content,
                content_type,
                category,
                image_data,
                created_at,
                pinned,
                is_encrypted,
            )| {
                // Image-only filtrede content decrypt'e gerek yok (arama yoksa)
                let decrypted_content = if is_image_only && query.is_empty() {
                    // Image için content zaten "Image (WxH)" formatında, decrypt etmeye gerek yok
                    if is_encrypted {
                        security::decrypt(&content).unwrap_or(content)
                    } else {
                        content
                    }
                } else if is_encrypted {
                    security::decrypt(&content).unwrap_or(content)
                } else {
                    content
                };

                // Arama eşleşmesi (image-only filtrede atla)
                if !query.is_empty() && !decrypted_content.to_lowercase().contains(&query_lower) {
                    return None;
                }

                // Image verisini decrypt et - paralel olduğu için çok daha hızlı
                let decrypted_image = if is_encrypted && image_data.is_some() {
                    image_data.and_then(|img| security::decrypt(&img).ok())
                } else {
                    image_data
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
            },
        )
        .collect()
}

/// category kolonu olmayan eski veritabanları için fallback
fn search_without_category(
    conn: &rusqlite::Connection,
    query: &str,
    limit: i32,
    offset: i32,
    filters: &[&str],
) -> Vec<ClipboardItem> {
    let sql = "SELECT id, content, content_type, image_data, created_at, pinned, is_encrypted 
               FROM clipboard_history ORDER BY pinned DESC, id DESC LIMIT ?1 OFFSET ?2";

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let rows: Vec<_> = match stmt.query_map([limit, offset], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, bool>(5)?,
            row.get::<_, bool>(6)?,
        ))
    }) {
        Ok(mapped) => mapped.filter_map(Result::ok).collect(),
        Err(_) => return Vec::new(),
    };

    let query_lower = query.to_lowercase();
    let is_all = filters.iter().any(|f| *f == "all" || f.is_empty());

    rows.into_iter()
        .filter_map(
            |(id, content, content_type, image_data, created_at, pinned, is_encrypted)| {
                let decrypted_content = if is_encrypted {
                    security::decrypt(&content).unwrap_or(content)
                } else {
                    content
                };

                // Arama
                if !query.is_empty() && !decrypted_content.to_lowercase().contains(&query_lower) {
                    return None;
                }

                // Kategoriyi hesapla (eski kayıtlar için)
                let category = detect_category_from_content(&decrypted_content, &content_type);

                // Filtre
                if !is_all && !filters.contains(&category.as_str()) {
                    return None;
                }

                let decrypted_image = if is_encrypted {
                    image_data.and_then(|img| security::decrypt(&img).ok())
                } else {
                    image_data
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
            },
        )
        .collect()
}

/// Eski kayıtlar için kategori hesapla
fn detect_category_from_content(content: &str, content_type: &str) -> String {
    if content_type == "image" {
        return "image".to_string();
    }

    let content_lower = content.to_lowercase();

    if content_lower.starts_with("http://")
        || content_lower.starts_with("https://")
        || content_lower.starts_with("www.")
    {
        return "url".to_string();
    }

    if content.contains('@') && content.split('@').count() == 2 && !content.contains(' ') {
        if let Some(domain) = content.split('@').next_back() {
            if domain.contains('.') {
                return "email".to_string();
            }
        }
    }

    if content.contains("function")
        || content.contains("const ")
        || content.contains("let ")
        || content.contains("def ")
        || content.contains("class ")
        || content.contains("fn ")
        || content.contains("pub ")
        || content.contains("->")
        || content.contains("=>")
        || (content.contains('{') && content.contains('}'))
    {
        return "code".to_string();
    }

    "text".to_string()
}

/// Async wrapper - UI thread'i bloke etmez
#[tauri::command]
pub async fn get_clipboard_history(limit: Option<i32>, offset: Option<i32>) -> Vec<ClipboardItem> {
    async_runtime::spawn_blocking(move || get_clipboard_history_sync(limit, offset))
        .await
        .unwrap_or_else(|_| Vec::new())
}

/// Senkron versiyon
fn get_clipboard_history_sync(limit: Option<i32>, offset: Option<i32>) -> Vec<ClipboardItem> {
    let conn = database::init_db();

    let limit_value = match limit {
        Some(l) if l <= 0 => 100000,
        Some(l) => l,
        None => 50,
    };

    let offset_value = offset.unwrap_or(0);

    // category dahil yeni sorgu
    let sql_new =
        "SELECT id, content, content_type, category, image_data, created_at, pinned, is_encrypted 
                   FROM clipboard_history ORDER BY pinned DESC, id DESC LIMIT ?1 OFFSET ?2";

    let sql_old = "SELECT id, content, content_type, image_data, created_at, pinned, is_encrypted 
                   FROM clipboard_history ORDER BY pinned DESC, id DESC LIMIT ?1 OFFSET ?2";

    // Önce yeni formatı dene
    if let Ok(mut stmt) = conn.prepare(sql_new) {
        let rows: Vec<_> = match stmt.query_map([limit_value, offset_value], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, bool>(6)?,
                row.get::<_, bool>(7)?,
            ))
        }) {
            Ok(mapped) => mapped.filter_map(Result::ok).collect(),
            Err(_) => Vec::new(),
        };

        return rows
            .into_iter()
            .map(
                |(
                    id,
                    content,
                    content_type,
                    category,
                    image_data,
                    created_at,
                    pinned,
                    is_encrypted,
                )| {
                    let decrypted_content = if is_encrypted {
                        security::decrypt(&content).unwrap_or(content)
                    } else {
                        content
                    };

                    let decrypted_image = if is_encrypted {
                        image_data.and_then(|img| security::decrypt(&img).ok())
                    } else {
                        image_data
                    };

                    ClipboardItem {
                        id,
                        content: decrypted_content,
                        content_type,
                        category,
                        image_data: decrypted_image,
                        created_at,
                        pinned,
                    }
                },
            )
            .collect();
    }

    // Eski format fallback
    let mut stmt = conn.prepare(sql_old).expect("Failed to prepare query");

    stmt.query_map([limit_value, offset_value], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, bool>(5)?,
            row.get::<_, bool>(6)?,
        ))
    })
    .expect("Failed to execute query")
    .filter_map(Result::ok)
    .map(
        |(id, content, content_type, image_data, created_at, pinned, is_encrypted)| {
            let decrypted_content = if is_encrypted {
                security::decrypt(&content).unwrap_or(content)
            } else {
                content
            };

            let category = detect_category_from_content(&decrypted_content, &content_type);

            let decrypted_image = if is_encrypted {
                image_data.and_then(|img| security::decrypt(&img).ok())
            } else {
                image_data
            };

            ClipboardItem {
                id,
                content: decrypted_content,
                content_type,
                category,
                image_data: decrypted_image,
                created_at,
                pinned,
            }
        },
    )
    .collect()
}

#[tauri::command]
pub fn export_clipboard_history() -> Result<String, String> {
    let conn = database::init_db();
    let sql = "SELECT id, content, content_type, category, image_data, created_at, pinned FROM clipboard_history ORDER BY id ASC";

    let mut stmt = match conn.prepare(sql) {
        Ok(stmt) => stmt,
        Err(_) => {
            // category yok, eski format
            let sql_old = "SELECT id, content, content_type, image_data, created_at, pinned FROM clipboard_history ORDER BY id ASC";
            let mut stmt = conn
                .prepare(sql_old)
                .map_err(|e| format!("Prepare failed: {}", e))?;

            let items: Vec<ClipboardItem> = stmt
                .query_map([], |row| {
                    let content: String = row.get(1)?;
                    let content_type: String = row.get(2)?;
                    let category = detect_category_from_content(&content, &content_type);
                    Ok(ClipboardItem {
                        id: row.get(0)?,
                        content,
                        content_type,
                        category,
                        image_data: row.get(3)?,
                        created_at: row.get(4)?,
                        pinned: row.get(5)?,
                    })
                })
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(Result::ok)
                .collect();

            return serde_json::to_string_pretty(&items).map_err(|e| format!("JSON failed: {}", e));
        }
    };

    let items: Vec<ClipboardItem> = stmt
        .query_map([], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content: row.get(1)?,
                content_type: row.get(2)?,
                category: row.get(3)?,
                image_data: row.get(4)?,
                created_at: row.get(5)?,
                pinned: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(Result::ok)
        .collect();

    serde_json::to_string_pretty(&items).map_err(|e| format!("JSON failed: {}", e))
}

#[tauri::command]
pub fn import_clipboard_history(json_data: String) -> Result<usize, String> {
    let conn = database::init_db();
    let items: Vec<ClipboardItem> = serde_json::from_str(&json_data).map_err(|e| e.to_string())?;
    let mut inserted = 0;

    for item in items {
        let category = if item.category.is_empty() {
            detect_category_from_content(&item.content, &item.content_type)
        } else {
            item.category
        };

        let result = conn.execute(
            "INSERT INTO clipboard_history (content, content_type, category, image_data, created_at, pinned, is_encrypted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
            rusqlite::params![
                &item.content,
                &item.content_type,
                &category,
                &item.image_data.unwrap_or_default(),
                &item.created_at,
                item.pinned,
            ],
        );
        if result.is_ok() {
            inserted += 1;
        }
    }
    Ok(inserted)
}
