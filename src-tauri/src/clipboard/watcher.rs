use crate::database;
use crate::models::ClipboardUpdateEvent;
use crate::security;
use arboard::Clipboard;
use base64::{engine::general_purpose, Engine as _};
use image::ImageBuffer;
use std::{thread, time::Duration};
use tauri::Emitter;

/// İçeriğin kategorisini belirle (kayıt anında)
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
    if content.contains('@')
        && content.split('@').count() == 2
        && content
            .split('@')
            .next_back()
            .map(|d| d.contains('.'))
            .unwrap_or(false)
        && !content.contains(' ')
    {
        return "email";
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

pub fn start_clipboard_watcher(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        // Watcher için optimize edilmiş bağlantı kullan
        let conn = database::init_db_for_watcher();
        let mut clipboard = Clipboard::new().expect("Failed to initialize clipboard");
        let mut last_clip_text = clipboard.get_text().unwrap_or_default();
        let mut last_clip_image = clipboard.get_image().ok();

        loop {
            // Metin kontrolü
            if let Ok(current) = clipboard.get_text() {
                if current != last_clip_text && !current.trim().is_empty() {
                    println!("New text content: {}", current);

                    // Kategoriyi belirle (kayıt anında)
                    let category = detect_category(&current);

                    // İçeriği şifrele
                    let encrypted_content = match security::encrypt(&current) {
                        Ok(encrypted) => encrypted,
                        Err(e) => {
                            eprintln!("Failed to encrypt content: {}", e);
                            current.clone()
                        }
                    };

                    // Veritabanına ekle (kategori ile birlikte)
                    let result = conn.execute(
                        "INSERT INTO clipboard_history (content, content_type, category, created_at, is_encrypted) VALUES (?1, 'text', ?2, datetime('now', 'localtime'), 1)",
                        [&encrypted_content, &category.to_string()],
                    );

                    if result.is_ok() {
                        // Frontend'e yeni öğe eventi gönder
                        let event = ClipboardUpdateEvent {
                            action: "refresh".to_string(),
                            message: "New text clipboard item added".to_string(),
                        };

                        println!("Event sending: {:?}", event);
                        match app_handle.emit("clipboard-update", event) {
                            Ok(_) => println!("Event sent successfully"),
                            Err(e) => eprintln!("Failed to send event: {}", e),
                        }
                    }

                    last_clip_text = current;
                }
            }

            // Resim kontrolü
            if let Ok(image) = clipboard.get_image() {
                // Resim değişip değişmediğini kontrol et
                let image_changed = match &last_clip_image {
                    Some(last_image) => {
                        last_image.width != image.width
                            || last_image.height != image.height
                            || last_image.bytes != image.bytes
                    }
                    None => true,
                };

                if image_changed {
                    println!("New image content: {}x{}", image.width, image.height);

                    // Resmi PNG formatına dönüştür ve base64'e encode et
                    let img_buffer = ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(
                        image.width as u32,
                        image.height as u32,
                        image.bytes.to_vec(),
                    )
                    .expect("Failed to create image buffer");

                    let mut png_data = Vec::new();
                    img_buffer
                        .write_with_encoder(image::codecs::png::PngEncoder::new(&mut png_data))
                        .expect("PNG encoding error");

                    let base64_image = general_purpose::STANDARD.encode(&png_data);
                    let content = format!("Image ({}x{})", image.width, image.height);

                    // İçeriği ve resim verisini şifrele
                    let encrypted_content = match security::encrypt(&content) {
                        Ok(encrypted) => encrypted,
                        Err(e) => {
                            eprintln!("Failed to encrypt content: {}", e);
                            content.clone()
                        }
                    };

                    let encrypted_image = match security::encrypt(&base64_image) {
                        Ok(encrypted) => encrypted,
                        Err(e) => {
                            eprintln!("Failed to encrypt image data: {}", e);
                            base64_image.clone()
                        }
                    };

                    // Veritabanına ekle (resim kategorisi ile)
                    let result = conn.execute(
                        "INSERT INTO clipboard_history (content, content_type, category, image_data, created_at, is_encrypted) VALUES (?1, 'image', 'image', ?2, datetime('now', 'localtime'), 1)",
                        [&encrypted_content, &encrypted_image],
                    );

                    if result.is_ok() {
                        // Frontend'e yeni öğe eventi gönder
                        let event = ClipboardUpdateEvent {
                            action: "refresh".to_string(),
                            message: "New image clipboard item added".to_string(),
                        };

                        println!("Event sending: {:?}", event);
                        match app_handle.emit("clipboard-update", event) {
                            Ok(_) => println!("Event sent successfully"),
                            Err(e) => eprintln!("Failed to send event: {}", e),
                        }
                    }

                    last_clip_image = Some(image);
                }
            }

            thread::sleep(Duration::from_millis(300));
        }
    });
}
