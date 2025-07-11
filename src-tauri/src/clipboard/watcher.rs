use crate::database;
use crate::models::ClipboardUpdateEvent;
use crate::encryption;
use arboard::Clipboard;
use base64::{Engine as _, engine::general_purpose};
use image::ImageBuffer;
use std::{thread, time::Duration};
use tauri::Emitter;

pub fn start_clipboard_watcher(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        let conn = database::init_db();
        let mut clipboard = Clipboard::new().expect("Failed to initialize clipboard");
        let mut last_clip_text = clipboard.get_text().unwrap_or_default();
        let mut last_clip_image = clipboard.get_image().ok();

        loop {
            // Metin kontrolü
            match clipboard.get_text() {
                Ok(current) => {
                    if current != last_clip_text && !current.trim().is_empty() {
                        println!("New text content: {}", current);

                        // İçeriği şifrele
                        let encrypted_content = match encryption::encrypt(&current) {
                            Ok(encrypted) => encrypted,
                            Err(e) => {
                                eprintln!("Failed to encrypt content: {}", e);
                                current.clone()
                            }
                        };

                        // Veritabanına ekle
                        let result = conn.execute(
                            "INSERT INTO clipboard_history (content, content_type, created_at, is_encrypted) VALUES (?1, 'text', datetime('now', 'localtime'), 1)",
                            [&encrypted_content],
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
                Err(_) => {}
            }

            // Resim kontrolü
            match clipboard.get_image() {
                Ok(image) => {
                    // Resim değişip değişmediğini kontrol et
                    let image_changed = match &last_clip_image {
                        Some(last_image) => {
                            last_image.width != image.width || 
                            last_image.height != image.height ||
                            last_image.bytes != image.bytes
                        }
                        None => true
                    };

                    if image_changed {
                        println!("New image content: {}x{}", image.width, image.height);

                        // Resmi PNG formatına dönüştür ve base64'e encode et
                        let img_buffer = ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(
                            image.width as u32,
                            image.height as u32,
                            image.bytes.to_vec()
                        ).expect("Failed to create image buffer");

                        let mut png_data = Vec::new();
                        img_buffer
                            .write_with_encoder(image::codecs::png::PngEncoder::new(&mut png_data))
                            .expect("PNG encoding error");

                        let base64_image = general_purpose::STANDARD.encode(&png_data);
                        let content = format!("Image ({}x{})", image.width, image.height);

                        // İçeriği ve resim verisini şifrele
                        let encrypted_content = match encryption::encrypt(&content) {
                            Ok(encrypted) => encrypted,
                            Err(e) => {
                                eprintln!("Failed to encrypt content: {}", e);
                                content.clone()
                            }
                        };

                        let encrypted_image = match encryption::encrypt(&base64_image) {
                            Ok(encrypted) => encrypted,
                            Err(e) => {
                                eprintln!("Failed to encrypt image data: {}", e);
                                base64_image.clone()
                            }
                        };

                        // Veritabanına ekle
                        let result = conn.execute(
                            "INSERT INTO clipboard_history (content, content_type, image_data, created_at, is_encrypted) VALUES (?1, 'image', ?2, datetime('now', 'localtime'), 1)",
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
                Err(_) => {}
            }

            thread::sleep(Duration::from_millis(300));
        }
    });
} 