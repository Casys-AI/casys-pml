/**
 * PML Logging Module
 *
 * Unified logging for the PML package.
 * Uses stderr to not interfere with stdio JSON-RPC.
 * Enabled via PML_DEBUG=1 environment variable.
 *
 * @module logging
 */

const DEBUG = () => Deno.env.get("PML_DEBUG") === "1";
const VERBOSE = () => Deno.env.get("PML_VERBOSE") === "1";

type LogLevel = "debug" | "info" | "warn" | "error";

function formatTime(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function emit(level: LogLevel, module: string, message: string): void {
  const prefix = `[${formatTime()}] [${level.toUpperCase().padEnd(5)}] [${module}]`;
  console.error(`${prefix} ${message}`);
}

/**
 * Create a logger for a specific module.
 */
export function createLogger(module: string) {
  return {
    /** Debug log (PML_DEBUG=1) */
    debug: (message: string) => {
      if (DEBUG()) emit("debug", module, message);
    },

    /** Verbose log (PML_VERBOSE=1) - more detailed than debug */
    verbose: (message: string) => {
      if (VERBOSE()) emit("debug", module, message);
    },

    /** Info log (always shown when PML_DEBUG=1) */
    info: (message: string) => {
      if (DEBUG()) emit("info", module, message);
    },

    /** Warning log (always shown) */
    warn: (message: string) => {
      emit("warn", module, message);
    },

    /** Error log (always shown) */
    error: (message: string) => {
      emit("error", module, message);
    },

    /** Log flow step with arrow */
    step: (message: string) => {
      if (DEBUG()) emit("debug", module, `→ ${message}`);
    },

    /** Log result with checkmark or X */
    result: (success: boolean, message: string) => {
      if (DEBUG()) emit("debug", module, `${success ? "✓" : "✗"} ${message}`);
    },
  };
}

// Pre-configured loggers for main modules
export const loaderLog = createLogger("loader");
export const sessionLog = createLogger("session");
export const stdioLog = createLogger("stdio");
export const serveLog = createLogger("serve");
export const routingLog = createLogger("routing");
export const sandboxLog = createLogger("sandbox");
export const permLog = createLogger("perm");
