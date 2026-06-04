use crate::database::{self, AppSettings};

#[tauri::command]
pub fn get_settings() -> AppSettings {
    let conn = database::init_db();
    database::load_settings(&conn)
}

#[tauri::command]
pub fn set_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let conn = database::init_db();
    database::save_settings(&conn, &settings)?;
    database::settings::enforce_retention(&conn);
    Ok(database::load_settings(&conn))
}
