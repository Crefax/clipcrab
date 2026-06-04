use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

static LAST_FRONTEND_HEARTBEAT: OnceLock<Mutex<Instant>> = OnceLock::new();

fn heartbeat_slot() -> &'static Mutex<Instant> {
    LAST_FRONTEND_HEARTBEAT.get_or_init(|| Mutex::new(Instant::now()))
}

#[tauri::command]
pub fn report_frontend_status() {
    let mut guard = heartbeat_slot()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Instant::now();
}

pub fn frontend_heartbeat_is_stale(max_age: Duration) -> bool {
    let guard = heartbeat_slot()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.elapsed() > max_age
}
