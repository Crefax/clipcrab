use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub content_type: String,       // "text" veya "image"
    pub image_data: Option<String>, // Base64 encoded image data
    pub created_at: String,
    pub pinned: bool,
}
