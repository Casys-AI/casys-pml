/**
 * Terminal component using xterm.js with PTY backend.
 *
 * Connects to Rust backend via Tauri for real shell access.
 */
import { useEffect, useRef, useCallback } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

export interface TerminalPanelProps {
  /** Initial command to run (null = default shell) */
  cmd?: string | null;
  /** CSS class for container */
  className?: string;
}

export function TerminalPanel({ cmd = null, className = '' }: TerminalPanelProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const isInitializedRef = useRef(false);

  // Resize handler
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    fitAddonRef.current.fit();
    const cols = xtermRef.current.cols;
    const rows = xtermRef.current.rows;

    invoke('terminal_resize', { cols, rows }).catch((err) => {
      console.warn('[Terminal] Resize failed:', err);
    });
  }, []);

  useEffect(() => {
    if (!termRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const term = new Terminal({
      theme: {
        background: '#0a0908',
        foreground: '#e0e0e0',
        cursor: '#ffb86f',
        cursorAccent: '#0a0908',
        selectionBackground: 'rgba(255, 184, 111, 0.3)',
        black: '#0a0908',
        red: '#ff6b6b',
        green: '#69db7c',
        yellow: '#ffd43b',
        blue: '#4dabf7',
        magenta: '#da77f2',
        cyan: '#66d9e8',
        white: '#e0e0e0',
        brightBlack: '#495057',
        brightRed: '#ff8787',
        brightGreen: '#8ce99a',
        brightYellow: '#ffe066',
        brightBlue: '#74c0fc',
        brightMagenta: '#e599f7',
        brightCyan: '#99e9f2',
        brightWhite: '#f8f9fa',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);

    // Initial fit
    requestAnimationFrame(() => {
      fit.fit();
    });

    xtermRef.current = term;
    fitAddonRef.current = fit;

    // Listen for stdout from Rust
    listen<string>('terminal:stdout', (event) => {
      term.write(event.payload);
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    // Send stdin to Rust
    term.onData((data: string) => {
      invoke('terminal_write', { data }).catch((err) => {
        console.warn('[Terminal] Write failed:', err);
      });
    });

    // Spawn shell
    invoke('terminal_spawn', { cmd }).catch((err) => {
      term.writeln(`\x1b[31mFailed to spawn shell: ${err}\x1b[0m`);
      console.error('[Terminal] Spawn failed:', err);
    });

    // Setup resize observer
    const observer = new ResizeObserver(() => {
      handleResize();
    });
    observer.observe(termRef.current);

    return () => {
      observer.disconnect();
      unlistenRef.current?.();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      isInitializedRef.current = false;
    };
  }, [cmd, handleResize]);

  return (
    <div
      ref={termRef}
      className={`terminal-container ${className}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '200px',
        backgroundColor: '#0a0908',
        padding: '4px',
      }}
    />
  );
}

export default TerminalPanel;
