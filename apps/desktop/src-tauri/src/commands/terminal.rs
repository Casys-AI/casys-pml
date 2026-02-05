//! Terminal Tauri commands.
//!
//! Exposes PTY operations to the frontend.

use crate::terminal::{PtyHandle, TerminalState};

/// Spawn a new terminal shell.
///
/// # Arguments
/// * `cmd` - Command to run (null = default shell)
/// * `app` - Tauri app handle
/// * `state` - Terminal state
///
/// # Returns
/// Ok on success, error message on failure.
#[tauri::command]
pub async fn terminal_spawn(
    cmd: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    // Check if already active
    if state.is_active().await {
        return Err("Terminal already active. Close existing session first.".to_string());
    }

    let handle = PtyHandle::spawn(cmd.as_deref(), app)?;
    state.set_handle(handle).await;

    Ok(())
}

/// Write data to the terminal stdin.
///
/// # Arguments
/// * `data` - String data to write
/// * `state` - Terminal state
///
/// # Returns
/// Ok on success, error message on failure.
#[tauri::command]
pub async fn terminal_write(
    data: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    state.write(data.as_bytes()).await
}

/// Resize the terminal.
///
/// # Arguments
/// * `cols` - New column count
/// * `rows` - New row count
/// * `state` - Terminal state
///
/// # Returns
/// Ok on success, error message on failure.
#[tauri::command]
pub async fn terminal_resize(
    cols: u16,
    rows: u16,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    state.resize(cols, rows).await
}

#[cfg(test)]
mod tests {
    // Note: These commands require Tauri runtime context,
    // so testing is limited to integration tests.
}
