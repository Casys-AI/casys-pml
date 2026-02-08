---
title: 'PML Desktop - Increment 5: Terminal Integration'
slug: 'pml-desktop-05-terminal'
created: '2026-01-26'
status: 'completed'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 5
estimated_tasks: 4
depends_on: ['04-sliding-sidebar.md']
---

# Increment 5: Terminal Integration

**Goal:** xterm.js terminal with PTY backend, can spawn shell and run commands.

## Prerequisites

- Increment 4 completed (sidebar + graph working)
- `portable-pty` crate knowledge

## Tasks

- [x] **Task 5.1: Setup xterm.js component**
  - File: `apps/desktop/src/components/Terminal.tsx`
  - Action: Preact component wrapping xterm.js
  - Code:
    ```tsx
    import { Terminal } from 'xterm';
    import { FitAddon } from '@xterm/addon-fit';
    import { useEffect, useRef } from 'preact/hooks';
    import { invoke } from '@tauri-apps/api/core';
    import { listen } from '@tauri-apps/api/event';

    export function TerminalPanel() {
      const termRef = useRef<HTMLDivElement>(null);
      const xtermRef = useRef<Terminal>();

      useEffect(() => {
        const term = new Terminal({ theme: { background: '#0a0908' } });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(termRef.current!);
        fit.fit();

        // Listen for stdout from Rust
        listen('terminal:stdout', (e) => {
          term.write(e.payload as string);
        });

        // Send stdin to Rust
        term.onData((data) => {
          invoke('terminal_write', { data });
        });

        // Spawn shell
        invoke('terminal_spawn', { cmd: null }); // null = default shell

        xtermRef.current = term;
      }, []);

      return <div ref={termRef} class="terminal-container" />;
    }
    ```

- [x] **Task 5.2: Implement PTY backend in Rust**
  - File: `apps/desktop/src-tauri/src/terminal/pty.rs`
  - Action: Use `portable-pty` to spawn shell
  - Code:
    ```rust
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::sync::Arc;
    use tokio::sync::Mutex;

    pub struct PtyHandle {
        writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
        // reader runs in background, emits to Tauri
    }

    impl PtyHandle {
        pub fn spawn(cmd: Option<&str>, app: tauri::AppHandle) -> Result<Self, String> {
            let pty_system = native_pty_system();
            let pair = pty_system.openpty(PtySize {
                rows: 24,
                cols: 80,
                ..Default::default()
            }).map_err(|e| e.to_string())?;

            let cmd = CommandBuilder::new(cmd.unwrap_or(Self::default_shell()));
            let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

            // Read stdout in background, emit events
            let reader = pair.master.try_clone_reader().unwrap();
            let app_clone = app.clone();
            std::thread::spawn(move || {
                // Read and emit terminal:stdout events
            });

            Ok(Self {
                writer: Arc::new(Mutex::new(pair.master.take_writer().unwrap())),
            })
        }

        fn default_shell() -> &'static str {
            #[cfg(windows)] { "powershell.exe" }
            #[cfg(unix)] { std::env::var("SHELL").unwrap_or("/bin/bash".into()) }
        }
    }
    ```

- [x] **Task 5.3: Create Tauri commands for terminal**
  - File: `apps/desktop/src-tauri/src/commands/terminal.rs`
  - Action: Expose spawn, write, resize commands
  - Code:
    ```rust
    #[tauri::command]
    async fn terminal_spawn(cmd: Option<String>, app: tauri::AppHandle) -> Result<(), String> {
        let handle = PtyHandle::spawn(cmd.as_deref(), app)?;
        // Store handle in app state
        Ok(())
    }

    #[tauri::command]
    async fn terminal_write(data: String, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
        state.write(data.as_bytes()).await
    }

    #[tauri::command]
    async fn terminal_resize(cols: u16, rows: u16, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
        state.resize(cols, rows).await
    }
    ```

- [x] **Task 5.4: Handle terminal resize**
  - File: `apps/desktop/src/components/Terminal.tsx`
  - Action: Resize PTY when panel resizes
  - Code:
    ```tsx
    useEffect(() => {
      const observer = new ResizeObserver(() => {
        fit.fit();
        invoke('terminal_resize', {
          cols: term.cols,
          rows: term.rows
        });
      });
      observer.observe(termRef.current!);
      return () => observer.disconnect();
    }, []);
    ```

## Acceptance Criteria

- [x] **AC1:** Given app launches, when terminal panel is visible, then a shell prompt appears
- [x] **AC2:** Given terminal is active, when user types `ls`, then directory listing appears
- [x] **AC3:** Given terminal is running, when panel is resized, then PTY adjusts and content reflows
- [x] **AC4:** Given terminal, when user runs `claude --help`, then Claude CLI output appears

## Layout Update

```
┌────────────┬───────────────────┬────────────────┐
│  Sidebar   │      Graph        │   Terminal     │
│            │                   │                │
│            │                   │ $ ls           │
│            │                   │ file1 file2    │
│            │                   │ $ _            │
└────────────┴───────────────────┴────────────────┘
```

## Deliverable

Three-panel layout with working terminal. No MCP integration yet.

## Review Notes

- Adversarial review completed: 2026-02-05
- Findings: 17 total, 0 fixed, 17 noted as action items
- Resolution approach: Skip (noted for future)

### Action Items (Post-MVP)

#### Critical
- [ ] **F1:** Sanitize/whitelist `cmd` parameter to prevent command injection

#### High Priority
- [ ] **F2:** Clear TerminalState.handle when process exits
- [ ] **F3:** Fix TOCTOU race condition in terminal_spawn (atomic check+set)
- [ ] **F4:** Add mechanism to cancel reader thread on component unmount
- [ ] **F5:** Implement proper child process cleanup (kill on drop)

#### Medium Priority
- [ ] **F6:** Add `terminal:exit` event listener in frontend
- [ ] **F7:** Debounce resize events (100-200ms)
- [ ] **F8:** Consider base64 encoding for binary-safe transfer
- [ ] **F9:** Remove `cmd` from useEffect deps or handle changes properly
- [ ] **F10:** Validate resize dimensions (min 1, max reasonable)

#### Low Priority
- [ ] **F11:** Add Drop impl for PtyHandle
- [ ] **F12:** Replace isInitializedRef with more robust pattern
- [ ] **F13:** Detect user's preferred shell on Windows
- [ ] **F14:** Surface IPC errors to UI
- [ ] **F15:** Add terminal_close command

## Next Increment

→ `06-mcp-live-sync.md` - MCP gateway integration + live node creation
