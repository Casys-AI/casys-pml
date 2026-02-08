// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use casys_engine::Engine;
use std::fs;

mod commands;
mod terminal;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Engine ready.", name)
}

#[tauri::command]
fn engine_status() -> Result<String, String> {
    // Verify casys_engine links correctly by attempting to open a temporary engine
    let temp_dir = std::env::temp_dir().join("casys_engine_status_check");

    // Clean up any previous test directory
    let _ = fs::remove_dir_all(&temp_dir);

    let result = match Engine::open(&temp_dir) {
        Ok(_engine) => Ok("casys_engine linked successfully".to_string()),
        Err(e) => Err(format!("Engine initialization failed: {}", e)),
    };

    // Clean up after test
    let _ = fs::remove_dir_all(&temp_dir);

    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(terminal::TerminalState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            engine_status,
            commands::compute_layout,
            commands::update_layout_incremental,
            commands::terminal_spawn,
            commands::terminal_write,
            commands::terminal_resize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
