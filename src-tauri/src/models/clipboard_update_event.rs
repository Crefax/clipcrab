use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipboardUpdateEvent {
    pub action: String,
    pub message: String,
}
