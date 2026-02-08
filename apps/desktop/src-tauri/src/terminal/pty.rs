//! PTY handle for shell process management.
//!
//! Uses portable-pty to spawn and manage shell processes.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Handle to a running PTY session.
pub struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    #[allow(dead_code)]
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

impl PtyHandle {
    /// Spawn a new shell process.
    ///
    /// # Arguments
    /// * `cmd` - Command to run (None = default shell)
    /// * `app` - Tauri app handle for event emission
    ///
    /// # Returns
    /// A new PTY handle or error message.
    pub fn spawn(cmd: Option<&str>, app: AppHandle) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell = match cmd {
            Some(c) => c.to_string(),
            None => get_user_shell(),
        };
        let mut cmd_builder = CommandBuilder::new(&shell);

        // Set up environment for shell
        cmd_builder.env("TERM", "xterm-256color");
        cmd_builder.env("COLORTERM", "truecolor");

        // Set working directory to home
        if let Some(home) = dirs::home_dir() {
            cmd_builder.cwd(home);
        }

        let child = pair
            .slave
            .spawn_command(cmd_builder)
            .map_err(|e| format!("Failed to spawn command '{}': {}", shell, e))?;

        // Get reader for stdout
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        // Spawn thread to read stdout and emit events
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - process exited
                        let _ = app.emit("terminal:exit", ());
                        break;
                    }
                    Ok(n) => {
                        // Convert to string (lossy for binary data)
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        if let Err(e) = app.emit("terminal:stdout", data) {
                            log::warn!("Failed to emit terminal:stdout: {}", e);
                        }
                    }
                    Err(e) => {
                        log::error!("PTY read error: {}", e);
                        break;
                    }
                }
            }
        });

        // Get writer for stdin
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        Ok(Self {
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
        })
    }

    /// Write data to the PTY stdin.
    pub async fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock().await;
        writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        writer.flush().map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    }

    /// Resize the PTY.
    pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let master = self.master.lock().await;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {}", e))
    }

}

/// Get the user's default shell (returns owned String for async contexts).
#[cfg(unix)]
pub fn get_user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

#[cfg(windows)]
pub fn get_user_shell() -> String {
    "powershell.exe".to_string()
}
