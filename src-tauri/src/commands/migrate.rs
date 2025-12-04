use crate::database;

/// Tüm kayıtların kategorilerini yeniden hesapla
#[tauri::command]
pub fn force_update_categories() -> String {
    let conn = database::init_db();

    // Image kayıtlarını güncelle
    let updated_images = conn
        .execute(
            "UPDATE clipboard_history SET category = 'image' WHERE content_type = 'image'",
            [],
        )
        .unwrap_or(0);

    // Text kayıtları için kategori hesapla
    let sql =
        "SELECT id, content, is_encrypted FROM clipboard_history WHERE content_type != 'image'";

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(e) => return format!("SQL Error: {}", e),
    };

    let rows: Vec<(i64, String, bool)> = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, bool>(2).unwrap_or(false),
        ))
    }) {
        Ok(mapped) => mapped.filter_map(Result::ok).collect(),
        Err(e) => return format!("Query Error: {}", e),
    };

    let total = rows.len();
    let mut url_count = 0;
    let mut email_count = 0;
    let mut code_count = 0;
    let mut text_count = 0;

    for (id, content, is_encrypted) in rows {
        // Şifreyi çöz
        let decrypted = if is_encrypted {
            crate::security::decrypt(&content).unwrap_or(content)
        } else {
            content
        };

        // Kategoriyi hesapla-
        let category = detect_category(&decrypted);

        match category {
            "url" => url_count += 1,
            "email" => email_count += 1,
            "code" => code_count += 1,
            _ => text_count += 1,
        }

        conn.execute(
            "UPDATE clipboard_history SET category = ?1 WHERE id = ?2",
            rusqlite::params![category, id],
        )
        .ok();
    }

    format!(
        "Updated {} records: {} images, {} urls, {} emails, {} code, {} text",
        total + updated_images as usize,
        updated_images,
        url_count,
        email_count,
        code_count,
        text_count
    )
}

/// Kategori tespit fonksiyonu
fn detect_category(content: &str) -> &'static str {
    let content_lower = content.to_lowercase();

    // URL kontrolü
    if content_lower.starts_with("http://")
        || content_lower.starts_with("https://")
        || content_lower.starts_with("www.")
    {
        return "url";
    }

    // Email kontrolü
    if content.contains('@') && content.split('@').count() == 2 && !content.contains(' ') {
        if let Some(domain) = content.split('@').next_back() {
            if domain.contains('.') {
                return "email";
            }
        }
    }

    // Code kontrolü
    if content.contains("function")
        || content.contains("const ")
        || content.contains("let ")
        || content.contains("var ")
        || content.contains("def ")
        || content.contains("class ")
        || content.contains("import ")
        || content.contains("fn ")
        || content.contains("pub ")
        || content.contains("->")
        || content.contains("=>")
        || (content.contains('{') && content.contains('}'))
        || content.contains("#include")
        || content.contains("<script")
    {
        return "code";
    }

    "text"
}
