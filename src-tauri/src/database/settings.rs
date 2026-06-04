use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    pub retention_enabled: bool,
    pub max_history: i64,
    pub max_db_size_mb: i64,
    pub max_text_size_kb: i64,
    pub max_image_size_mb: i64,
    pub capture_images: bool,
    pub capture_large_text: bool,
    pub show_notifications: bool,
    pub auto_clear_days: i64,
    pub ignore_apps: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            retention_enabled: false,
            max_history: 1000,
            max_db_size_mb: 250,
            max_text_size_kb: 512,
            max_image_size_mb: 5,
            capture_images: true,
            capture_large_text: false,
            show_notifications: true,
            auto_clear_days: 0,
            ignore_apps: vec![
                "1Password".to_string(),
                "Bitwarden".to_string(),
                "KeePass".to_string(),
                "KeePassXC".to_string(),
                "LastPass".to_string(),
                "Dashlane".to_string(),
                "ClipCrab".to_string(),
            ],
        }
    }
}

pub fn load_settings(conn: &Connection) -> AppSettings {
    let mut settings = AppSettings::default();
    let mut stmt = match conn.prepare("SELECT key, value FROM settings") {
        Ok(stmt) => stmt,
        Err(_) => return settings,
    };

    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(rows) => rows,
        Err(_) => return settings,
    };

    for row in rows.filter_map(Result::ok) {
        apply_setting(&mut settings, &row.0, &row.1);
    }

    normalize_settings(settings)
}

pub fn save_settings(conn: &Connection, settings: &AppSettings) -> Result<(), String> {
    let settings = normalize_settings(settings.clone());
    let values = [
        ("retention_enabled", settings.retention_enabled.to_string()),
        ("max_history", settings.max_history.to_string()),
        ("max_db_size_mb", settings.max_db_size_mb.to_string()),
        ("max_text_size_kb", settings.max_text_size_kb.to_string()),
        ("max_image_size_mb", settings.max_image_size_mb.to_string()),
        ("capture_images", settings.capture_images.to_string()),
        (
            "capture_large_text",
            settings.capture_large_text.to_string(),
        ),
        (
            "show_notifications",
            settings.show_notifications.to_string(),
        ),
        ("auto_clear_days", settings.auto_clear_days.to_string()),
        (
            "ignore_apps",
            serde_json::to_string(&settings.ignore_apps).map_err(|e| e.to_string())?,
        ),
    ];

    for (key, value) in values {
        conn.execute(
            "INSERT INTO settings(key, value)
             VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| format!("Settings save failed: {e}"))?;
    }

    Ok(())
}

pub fn enforce_retention(conn: &Connection) {
    let settings = load_settings(conn);
    if !settings.retention_enabled {
        return;
    }

    enforce_auto_clear(conn, settings.auto_clear_days);
    enforce_max_history(conn, settings.max_history);
    enforce_payload_budget(conn, settings.max_db_size_mb);
}

pub fn should_capture_text(settings: &AppSettings, text_len: usize) -> bool {
    settings.capture_large_text || text_len as i64 <= settings.max_text_size_kb * 1024
}

pub fn should_capture_image(settings: &AppSettings, image_size: i64) -> bool {
    settings.capture_images && image_size <= settings.max_image_size_mb * 1024 * 1024
}

fn apply_setting(settings: &mut AppSettings, key: &str, value: &str) {
    match key {
        "retention_enabled" => {
            settings.retention_enabled = parse_bool(value, settings.retention_enabled)
        }
        "max_history" => settings.max_history = parse_i64(value, settings.max_history),
        "max_db_size_mb" => settings.max_db_size_mb = parse_i64(value, settings.max_db_size_mb),
        "max_text_size_kb" => {
            settings.max_text_size_kb = parse_i64(value, settings.max_text_size_kb)
        }
        "max_image_size_mb" => {
            settings.max_image_size_mb = parse_i64(value, settings.max_image_size_mb)
        }
        "capture_images" => settings.capture_images = parse_bool(value, settings.capture_images),
        "capture_large_text" => {
            settings.capture_large_text = parse_bool(value, settings.capture_large_text)
        }
        "show_notifications" => {
            settings.show_notifications = parse_bool(value, settings.show_notifications)
        }
        "auto_clear_days" => settings.auto_clear_days = parse_i64(value, settings.auto_clear_days),
        "ignore_apps" => {
            settings.ignore_apps = serde_json::from_str(value).unwrap_or_else(|_| {
                value
                    .lines()
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                    .map(ToString::to_string)
                    .collect()
            });
        }
        _ => {}
    }
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    settings.max_history = settings.max_history.clamp(100, 100_000);
    settings.max_db_size_mb = settings.max_db_size_mb.clamp(50, 10_000);
    settings.max_text_size_kb = settings.max_text_size_kb.clamp(1, 10_240);
    settings.max_image_size_mb = settings.max_image_size_mb.clamp(1, 250);
    settings.auto_clear_days = settings.auto_clear_days.clamp(0, 3650);
    settings.ignore_apps = settings
        .ignore_apps
        .into_iter()
        .map(|app| app.trim().to_string())
        .filter(|app| !app.is_empty())
        .collect();
    settings.ignore_apps.sort();
    settings.ignore_apps.dedup();
    settings
}

fn parse_i64(value: &str, fallback: i64) -> i64 {
    value.parse::<i64>().unwrap_or(fallback)
}

fn parse_bool(value: &str, fallback: bool) -> bool {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => fallback,
    }
}

fn enforce_auto_clear(conn: &Connection, auto_clear_days: i64) {
    if auto_clear_days <= 0 {
        return;
    }

    let modifier = format!("-{} days", auto_clear_days);
    conn.execute(
        "DELETE FROM clipboard_history
         WHERE pinned = 0 AND datetime(created_at) < datetime('now', ?1)",
        [modifier],
    )
    .ok();
}

fn enforce_max_history(conn: &Connection, max_history: i64) {
    conn.execute(
        "DELETE FROM clipboard_history
         WHERE pinned = 0
           AND id NOT IN (
             SELECT id FROM clipboard_history
             WHERE pinned = 0
             ORDER BY id DESC
             LIMIT ?1
           )",
        [max_history],
    )
    .ok();
}

fn enforce_payload_budget(conn: &Connection, max_db_size_mb: i64) {
    let max_payload_bytes = max_db_size_mb * 1024 * 1024;
    let mut attempts = 0;

    while estimated_payload_bytes(conn) > max_payload_bytes && attempts < 20 {
        attempts += 1;
        let deleted = conn
            .execute(
                "DELETE FROM clipboard_history
                 WHERE id IN (
                   SELECT id FROM clipboard_history
                   WHERE pinned = 0
                   ORDER BY id ASC
                   LIMIT 100
                 )",
                [],
            )
            .unwrap_or(0);

        if deleted == 0 {
            break;
        }
    }
}

fn estimated_payload_bytes(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COALESCE(SUM(LENGTH(content)), 0) + COALESCE(SUM(LENGTH(image_data)), 0)
         FROM clipboard_history",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_normalize_bounds_and_dedupes_ignore_apps() {
        let settings = normalize_settings(AppSettings {
            retention_enabled: false,
            max_history: 1,
            max_db_size_mb: 1,
            max_text_size_kb: 0,
            max_image_size_mb: 999,
            capture_images: true,
            capture_large_text: false,
            show_notifications: true,
            auto_clear_days: 9999,
            ignore_apps: vec![" Bitwarden ".to_string(), "Bitwarden".to_string()],
        });

        assert_eq!(settings.max_history, 100);
        assert_eq!(settings.max_db_size_mb, 50);
        assert_eq!(settings.max_text_size_kb, 1);
        assert_eq!(settings.max_image_size_mb, 250);
        assert_eq!(settings.auto_clear_days, 3650);
        assert_eq!(settings.ignore_apps, vec!["Bitwarden"]);
    }

    #[test]
    fn capture_limits_follow_settings() {
        let settings = AppSettings::default();
        assert!(should_capture_text(&settings, 1024));
        assert!(!should_capture_text(
            &settings,
            (settings.max_text_size_kb * 1024 + 1) as usize
        ));
        assert!(should_capture_image(&settings, 1024));
        assert!(!should_capture_image(
            &settings,
            settings.max_image_size_mb * 1024 * 1024 + 1
        ));
    }

    #[test]
    fn max_history_cleanup_keeps_pinned_and_newest_unpinned() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                image_data TEXT,
                pinned INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        for index in 0..5 {
            conn.execute(
                "INSERT INTO clipboard_history(content, pinned) VALUES (?1, 0)",
                [format!("item {index}")],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO clipboard_history(content, pinned) VALUES ('pinned', 1)",
            [],
        )
        .unwrap();

        enforce_max_history(&conn, 2);

        let remaining: Vec<String> = conn
            .prepare("SELECT content FROM clipboard_history ORDER BY id ASC")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect();

        assert_eq!(remaining, vec!["item 3", "item 4", "pinned"]);
    }

    #[test]
    fn retention_disabled_does_not_delete_existing_history() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                image_data TEXT,
                pinned INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        for index in 0..120 {
            conn.execute(
                "INSERT INTO clipboard_history(content, pinned) VALUES (?1, 0)",
                [format!("item {index}")],
            )
            .unwrap();
        }

        save_settings(
            &conn,
            &AppSettings {
                retention_enabled: false,
                max_history: 100,
                ..Default::default()
            },
        )
        .unwrap();
        enforce_retention(&conn);

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(remaining, 120);
    }

    #[test]
    fn retention_enabled_applies_saved_limits() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE clipboard_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                image_data TEXT,
                pinned INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .unwrap();

        for index in 0..120 {
            conn.execute(
                "INSERT INTO clipboard_history(content, pinned) VALUES (?1, 0)",
                [format!("item {index}")],
            )
            .unwrap();
        }

        save_settings(
            &conn,
            &AppSettings {
                retention_enabled: true,
                max_history: 100,
                max_db_size_mb: 10_000,
                ..Default::default()
            },
        )
        .unwrap();
        enforce_retention(&conn);

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
                row.get(0)
            })
            .unwrap();

        assert_eq!(remaining, 100);
    }
}
