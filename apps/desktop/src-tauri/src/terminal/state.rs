//! Terminal state management for Tauri app.

use super::PtyHandle;
use std::sync::Arc;
use tokio::sync::Mutex;

/// State container for terminal sessions.
///
/// Managed as Tauri state, shared across commands.
pub struct TerminalState {
    /// Active PTY handle (one terminal for now, could be extended to HashMap<id, handle>)
    handle: Arc<Mutex<Option<PtyHandle>>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalState {
    /// Create a new empty terminal state.
    pub fn new() -> Self {
        Self {
            handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the active PTY handle.
    pub async fn set_handle(&self, handle: PtyHandle) {
        let mut guard = self.handle.lock().await;
        *guard = Some(handle);
    }

    /// Write data to the active terminal.
    pub async fn write(&self, data: &[u8]) -> Result<(), String> {
        let guard = self.handle.lock().await;
        match guard.as_ref() {
            Some(handle) => handle.write(data).await,
            None => Err("No active terminal session".to_string()),
        }
    }

    /// Resize the active terminal.
    pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let guard = self.handle.lock().await;
        match guard.as_ref() {
            Some(handle) => handle.resize(cols, rows).await,
            None => Err("No active terminal session".to_string()),
        }
    }

    /// Check if a terminal is active.
    pub async fn is_active(&self) -> bool {
        self.handle.lock().await.is_some()
    }
}
