use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub content_type: String,       // "text" veya "image"
    pub category: String,           // "text", "url", "email", "code", "image"
    pub image_data: Option<String>, // Base64 encoded image data
    pub created_at: String,
    pub pinned: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipboardListItem {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    pub category: String,
    pub image_data: Option<String>,
    pub thumbnail_data: Option<String>,
    pub created_at: String,
    pub pinned: bool,
    pub content_size: i64,
    pub image_size: Option<i64>,
    pub image_width: Option<i64>,
    pub image_height: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Diagnostics {
    pub db_path: String,
    pub db_size: u64,
    pub item_count: i64,
    pub image_count: i64,
    pub image_payload_bytes: i64,
    pub largest_image_bytes: i64,
    pub app_log_count: i64,
    pub last_frontend_error: Option<String>,
    pub webview2_version: Option<String>,
    pub log_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppLogEntry {
    pub id: i64,
    pub level: String,
    pub target: String,
    pub message: String,
    pub created_at: String,
}
