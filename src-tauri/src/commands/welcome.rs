use tauri::{command, Manager};

#[command]
pub async fn is_first_run(app: tauri::AppHandle) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let first_run_flag = app_dir.join("first_run_completed");
    
    Ok(!first_run_flag.exists())
}

#[command]
pub async fn complete_first_run(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    
    let first_run_flag = app_dir.join("first_run_completed");
    std::fs::write(&first_run_flag, "completed").map_err(|e| e.to_string())?;
    
    Ok(())
}
