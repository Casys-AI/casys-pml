/**
 * Stdio Subprocess Manager
 *
 * Manages stdio MCP subprocesses with lifecycle, multiplexing, and idle timeout.
 *
 * @module loader/stdio-manager
 */

import type { McpDependency, PendingRequest, StdioProcess } from "./types.ts";
import { LoaderError } from "./types.ts";
import {
  createNotification,
  createRequest,
  parseResponse,
  serializeMessage,
} from "./stdio-rpc.ts";

/**
 * Default idle timeout (5 minutes).
 */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Request timeout (30 seconds).
 */
const REQUEST_TIMEOUT_MS = 30 * 1000;

/**
 * Log debug message if PML_DEBUG is enabled.
 */
function logDebug(message: string): void {
  if (Deno.env.get("PML_DEBUG") === "1") {
    console.error(`[pml:stdio] ${message}`);
  }
}

/**
 * Parse install command to get executable and args.
 */
function parseCommand(dep: McpDependency): { cmd: string; args: string[] } {
  // If command and args are explicitly provided, use them
  if (dep.command) {
    return {
      cmd: dep.command,
      args: dep.args ?? [],
    };
  }

  // Parse from install command
  const parts = dep.install.trim().split(/\s+/);
  return {
    cmd: parts[0],
    args: parts.slice(1),
  };
}

/**
 * Stdio subprocess manager.
 *
 * Handles lifecycle of MCP stdio subprocesses including:
 * - Spawning on first request
 * - Request/response multiplexing
 * - Idle timeout and shutdown
 * - Crash detection and auto-restart
 */
export class StdioManager {
  private readonly processes = new Map<string, StdioProcess>();
  private readonly idleTimeoutMs: number;
  private readonly idleTimers = new Map<string, number>();

  constructor(idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  /**
   * Get or spawn a process for a dependency.
   */
  async getOrSpawn(dep: McpDependency): Promise<StdioProcess> {
    const existing = this.processes.get(dep.name);
    if (existing) {
      this.resetIdleTimer(dep.name);
      return existing;
    }

    return await this.spawn(dep);
  }

  /**
   * Spawn a new subprocess.
   */
  private async spawn(dep: McpDependency): Promise<StdioProcess> {
    const { cmd, args } = parseCommand(dep);

    logDebug(`Spawning ${dep.name}: ${cmd} ${args.join(" ")}`);

    try {
      const command = new Deno.Command(cmd, {
        args,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();

      // Create writers/readers
      const writer = process.stdin.getWriter();
      const reader = process.stdout.getReader();

      const now = new Date();

      const stdioProcess: StdioProcess = {
        dep,
        process,
        writer,
        reader,
        spawnedAt: now,
        lastActivity: now,
        pendingRequests: new Map(),
        nextRequestId: 1,
        buffer: "",
      };

      this.processes.set(dep.name, stdioProcess);

      // Start reading responses
      this.startReader(dep.name, stdioProcess);

      // Start reading stderr for debugging
      this.startStderrReader(dep.name, process.stderr);

      // Start idle timer
      this.resetIdleTimer(dep.name);

      // Initialize MCP connection
      await this.initialize(dep.name, stdioProcess);

      logDebug(`Spawned and initialized ${dep.name}`);

      return stdioProcess;
    } catch (error) {
      throw new LoaderError(
        "SUBPROCESS_SPAWN_FAILED",
        `Failed to spawn ${dep.name}: ${error instanceof Error ? error.message : String(error)}`,
        { dep: dep.name, error: String(error) },
      );
    }
  }

  /**
   * Initialize MCP connection.
   */
  private async initialize(name: string, proc: StdioProcess): Promise<void> {
    // Send initialize request
    const initResult = await this.callInternal(name, proc, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "pml-loader",
        version: "0.1.0",
      },
    });

    logDebug(`${name} initialized: ${JSON.stringify(initResult)}`);

    // Send initialized notification
    const notification = createNotification("initialized", {});
    await proc.writer.write(serializeMessage(notification));
  }

  /**
   * Start background reader for a process.
   */
  private startReader(name: string, proc: StdioProcess): void {
    const read = async () => {
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { value, done } = await proc.reader.read();

          if (done) {
            logDebug(`${name} stdout closed`);
            break;
          }

          proc.buffer += decoder.decode(value);

          // Process complete responses
          let result = parseResponse(proc.buffer);
          while (result.response) {
            proc.buffer = result.remaining;

            const { response } = result;

            // Find pending request
            if (response.id !== null) {
              const pending = proc.pendingRequests.get(response.id);
              if (pending) {
                proc.pendingRequests.delete(response.id);

                if (response.error) {
                  pending.reject(
                    new Error(`${response.error.code}: ${response.error.message}`),
                  );
                } else {
                  pending.resolve(response.result);
                }
              }
            }

            result = parseResponse(proc.buffer);
          }
        }
      } catch (error) {
        logDebug(`${name} reader error: ${error}`);

        // Reject all pending requests
        for (const [id, pending] of proc.pendingRequests) {
          pending.reject(new Error(`Process terminated: ${error}`));
          proc.pendingRequests.delete(id);
        }
      }
    };

    // Start reader in background
    read().catch((error) => {
      logDebug(`${name} reader failed: ${error}`);
    });
  }

  /**
   * Start background stderr reader for a process.
   * Logs stderr output for debugging purposes.
   */
  private startStderrReader(
    name: string,
    stderr: ReadableStream<Uint8Array>,
  ): void {
    const reader = stderr.getReader();
    const decoder = new TextDecoder();

    const read = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          const text = decoder.decode(value).trim();
          if (text) {
            // Log stderr with process name prefix
            logDebug(`${name} stderr: ${text}`);
          }
        }
      } catch {
        // Ignore read errors on stderr (process may have terminated)
      }
    };

    // Start reader in background
    read().catch(() => {
      // Ignore errors
    });
  }

  /**
   * Call a method on a subprocess.
   */
  async call(
    name: string,
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    const proc = this.processes.get(name);
    if (!proc) {
      throw new LoaderError(
        "SUBPROCESS_CALL_FAILED",
        `Process not running: ${name}. Call getOrSpawn first.`,
        { name },
      );
    }

    return this.callInternal(name, proc, method, params);
  }

  /**
   * Internal call implementation.
   */
  private async callInternal(
    name: string,
    proc: StdioProcess,
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    const id = proc.nextRequestId++;
    proc.lastActivity = new Date();
    this.resetIdleTimer(name);

    logDebug(`${name} ← ${method} (id=${id})`);

    // Create promise for response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        method,
        sentAt: new Date(),
      };

      proc.pendingRequests.set(id, pending);

      // Setup timeout
      setTimeout(() => {
        if (proc.pendingRequests.has(id)) {
          proc.pendingRequests.delete(id);
          reject(
            new LoaderError(
              "SUBPROCESS_TIMEOUT",
              `Request to ${name}.${method} timed out after ${REQUEST_TIMEOUT_MS}ms`,
              { name, method, id },
            ),
          );
        }
      }, REQUEST_TIMEOUT_MS);
    });

    // Send request
    const request = createRequest(id, method, params);
    await proc.writer.write(serializeMessage(request));

    return responsePromise;
  }

  /**
   * Reset idle timer for a process.
   */
  private resetIdleTimer(name: string): void {
    // Clear existing timer
    const existingTimer = this.idleTimers.get(name);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      logDebug(`${name} idle timeout, shutting down`);
      this.shutdown(name);
    }, this.idleTimeoutMs);

    this.idleTimers.set(name, timer);
  }

  /**
   * Shutdown a specific process.
   */
  shutdown(name: string): void {
    const proc = this.processes.get(name);
    if (!proc) {
      return;
    }

    logDebug(`Shutting down ${name}`);

    // Clear idle timer
    const timer = this.idleTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(name);
    }

    // Reject pending requests
    for (const [id, pending] of proc.pendingRequests) {
      pending.reject(new Error("Process shutdown"));
      proc.pendingRequests.delete(id);
    }

    // Close streams and kill process
    try {
      proc.writer.close();
    } catch {
      // Ignore close errors
    }

    try {
      proc.process.kill("SIGTERM");
    } catch {
      // Ignore kill errors
    }

    this.processes.delete(name);
  }

  /**
   * Shutdown all processes and clear all timers.
   */
  shutdownAll(): void {
    // Clear all idle timers first
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    // Then shutdown all processes
    for (const name of this.processes.keys()) {
      this.shutdown(name);
    }
  }

  /**
   * Check if a process is running.
   */
  isRunning(name: string): boolean {
    return this.processes.has(name);
  }

  /**
   * Get all running process names.
   */
  getRunningProcesses(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Get process info for debugging.
   */
  getProcessInfo(name: string): {
    spawnedAt: Date;
    lastActivity: Date;
    pendingRequests: number;
  } | undefined {
    const proc = this.processes.get(name);
    if (!proc) {
      return undefined;
    }

    return {
      spawnedAt: proc.spawnedAt,
      lastActivity: proc.lastActivity,
      pendingRequests: proc.pendingRequests.size,
    };
  }
}
