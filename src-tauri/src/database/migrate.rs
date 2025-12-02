use rusqlite::Connection;
use crate::security;

pub fn migrate_database(conn: &Connection) {
    // Mevcut sütunları kontrol et
    let mut stmt = conn
        .prepare("PRAGMA table_info(clipboard_history)")
        .unwrap();
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    let has_content_type = columns.iter().any(|col| col == "content_type");
    let has_image_data = columns.iter().any(|col| col == "image_data");
    let has_pinned = columns.iter().any(|col| col == "pinned");
    let has_category = columns.iter().any(|col| col == "category");

    if !has_content_type {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN content_type TEXT DEFAULT 'text'",
            [],
        )
        .expect("Failed to add content_type column");
    }
    if !has_image_data {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN image_data TEXT",
            [],
        )
        .expect("Failed to add image_data column");
    }
    if !has_pinned {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN pinned INTEGER DEFAULT 0",
            [],
        )
        .expect("Failed to add pinned column");
    }
    
    // category kolonu ekle
    if !has_category {
        conn.execute(
            "ALTER TABLE clipboard_history ADD COLUMN category TEXT DEFAULT 'text'",
            [],
        )
        .expect("Failed to add category column");
    }
    
    // Mevcut kayıtların kategorilerini güncelle (NULL veya boş olanlar için)
    update_existing_categories(conn);
}

/// Mevcut kayıtların kategorilerini güncelle
pub fn update_existing_categories(conn: &Connection) {
    // Önce image olanları güncelle
    let _ = conn.execute(
        "UPDATE clipboard_history SET category = 'image' WHERE content_type = 'image'",
        [],
    );
    
    // Tüm text kayıtları için kategori hesapla (NULL, boş veya 'text' olanlar)
    let sql = "SELECT id, content, content_type, is_encrypted FROM clipboard_history WHERE content_type != 'image'";
    
    if let Ok(mut stmt) = conn.prepare(sql) {
        let rows: Vec<(i64, String, String, bool)> = match stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, bool>(3).unwrap_or(false),
            ))
        }) {
            Ok(mapped) => mapped.filter_map(Result::ok).collect(),
            Err(_) => return,
        };
        
        for (id, content, content_type, is_encrypted) in rows {
            if content_type == "image" {
                conn.execute("UPDATE clipboard_history SET category = 'image' WHERE id = ?1", [id]).ok();
                continue;
            }
            
            // Şifreyi çöz
            let decrypted = if is_encrypted {
                security::decrypt(&content).unwrap_or(content)
            } else {
                content
            };
            
            // Kategoriyi hesapla
            let category = detect_category(&decrypted);
            
            conn.execute(
                "UPDATE clipboard_history SET category = ?1 WHERE id = ?2",
                rusqlite::params![category, id],
            ).ok();
        }
    }
}

/// Kategori tespit fonksiyonu
fn detect_category(content: &str) -> &'static str {
    let content_lower = content.to_lowercase();
    
    // URL kontrolü
    if content_lower.starts_with("http://") || 
       content_lower.starts_with("https://") || 
       content_lower.starts_with("www.") {
        return "url";
    }
    
    // Email kontrolü
    if content.contains('@') && 
       content.split('@').count() == 2 &&
       !content.contains(' ') {
        if let Some(domain) = content.split('@').last() {
            if domain.contains('.') {
                return "email";
            }
        }
    }
    
    // Code kontrolü
    if content.contains("function") ||
       content.contains("const ") ||
       content.contains("let ") ||
       content.contains("var ") ||
       content.contains("def ") ||
       content.contains("class ") ||
       content.contains("import ") ||
       content.contains("fn ") ||
       content.contains("pub ") ||
       content.contains("->") ||
       content.contains("=>") ||
       (content.contains('{') && content.contains('}')) ||
       content.contains("#include") ||
       content.contains("<script") {
        return "code";
    }
    
    "text"
}
