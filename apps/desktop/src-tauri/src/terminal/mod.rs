//! Terminal module - PTY management for shell integration.

mod pty;
mod state;

pub use pty::PtyHandle;
pub use state::TerminalState;
