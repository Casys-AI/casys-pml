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
import { createStdBinaryResolver } from "./binary-resolver.ts";
import { PACKAGE_VERSION } from "../cli/shared/constants.ts";
import * as log from "@std/log";

/**
 * Default idle timeout (5 minutes).
 */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Request timeout (30 seconds).
 */
const REQUEST_TIMEOUT_MS = 30 * 1000;

/**
 * Log debug message for stdio operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:stdio] ${message}`);
}

/**
 * Check if dependency is mcp-std (uses jsr:@casys/mcp-std).
 * Only returns true if explicitly using jsr:@casys/mcp-std, not just named "std".
 */
function isMcpStd(dep: McpDependency): boolean {
  // Check args for jsr:@casys/mcp-std
  if (dep.args?.some((arg) => arg.includes("@casys/mcp-std"))) {
    return true;
  }
  // Check install command
  if (dep.install?.includes("@casys/mcp-std")) {
    return true;
  }
  // Don't match by name alone - user may have custom std server
  return false;
}

/**
 * Extract version from mcp-std dependency.
 */
function extractMcpStdVersion(dep: McpDependency): string {
  // Try to extract version from args like jsr:@casys/mcp-std@0.2.1/server
  const versionMatch = dep.args?.join(" ").match(/@casys\/mcp-std@([0-9.]+)/);
  if (versionMatch) {
    return versionMatch[1];
  }
  // Use dep.version if specified, otherwise "latest"
  return dep.version && dep.version !== "latest" ? dep.version : "latest";
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

  // Parse from install command (always present for stdio deps)
  const parts = (dep.install ?? "").trim().split(/\s+/);
  return {
    cmd: parts[0],
    args: parts.slice(1),
  };
}

/**
 * Resolve command for mcp-std to binary.
 * Downloads binary if not cached.
 */
async function resolveStdBinary(dep: McpDependency): Promise<{ cmd: string; args: string[] }> {
  const version = extractMcpStdVersion(dep);
  logDebug(`Resolving mcp-std binary for version ${version}`);

  const resolver = await createStdBinaryResolver(version);
  const binaryPath = await resolver.resolve();

  logDebug(`Resolved mcp-std to binary: ${binaryPath}`);

  return {
    cmd: binaryPath,
    args: [], // Binary is standalone, no args needed
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
/**
 * Options for crash handling.
 */
interface CrashHandlerOptions {
  /** Maximum restart attempts */
  maxRetries: number;
  /** Callback when crash is detected */
  onCrash?: (name: string, error: string) => void;
}

export class StdioManager {
  private readonly processes = new Map<string, StdioProcess>();
  private readonly idleTimeoutMs: number;
  private readonly idleTimers = new Map<string, number>();
  private readonly restartCounts = new Map<string, number>();
  private readonly crashOptions: CrashHandlerOptions;
  // F4 Fix: Track processes currently restarting to prevent race conditions
  private readonly restartingProcesses = new Set<string>();
  private readonly restartPromises = new Map<string, Promise<void>>();

  constructor(
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    crashOptions: Partial<CrashHandlerOptions> = {},
  ) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.crashOptions = {
      maxRetries: crashOptions.maxRetries ?? 3,
      onCrash: crashOptions.onCrash,
    };
  }

  /**
   * Get or spawn a process for a dependency.
   */
  async getOrSpawn(dep: McpDependency): Promise<StdioProcess> {
    // F4 Fix: Wait if process is currently restarting
    if (this.restartingProcesses.has(dep.name)) {
      logDebug(`${dep.name} is restarting, waiting...`);
      const restartPromise = this.restartPromises.get(dep.name);
      if (restartPromise) {
        await restartPromise;
      }
      // After restart completes, check if process exists now
      const restarted = this.processes.get(dep.name);
      if (restarted) {
        this.resetIdleTimer(dep.name);
        return restarted;
      }
      // Restart failed, fall through to spawn
    }

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
    // For mcp-std, resolve to binary (downloads if needed)
    let cmd: string;
    let args: string[];

    if (isMcpStd(dep)) {
      const resolved = await resolveStdBinary(dep);
      cmd = resolved.cmd;
      args = resolved.args;
    } else {
      const parsed = parseCommand(dep);
      cmd = parsed.cmd;
      args = parsed.args;
    }

    logDebug(`Spawning ${dep.name}: ${cmd} ${args.join(" ")}`);

    try {
      // Merge base env (from .env) with dependency-specific env vars
      // dep.env takes precedence over base env
      const baseEnv = Deno.env.toObject();
      const processEnv = dep.env ? { ...baseEnv, ...dep.env } : baseEnv;

      const command = new Deno.Command(cmd, {
        args,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
        // Pass merged env vars: base (.env) + dep-specific (mcpServers[name].env)
        env: processEnv,
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
        `Failed to spawn ${dep.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
        version: PACKAGE_VERSION,
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
            // Check if this is an unexpected closure (process still in our map)
            if (this.processes.has(name)) {
              logDebug(`${name} stdout closed unexpectedly, attempting restart...`);
              this.handleCrash(name, proc.dep, "Process terminated unexpectedly");
            } else {
              logDebug(`${name} stdout closed (expected shutdown)`);
            }
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
                    new Error(
                      `${response.error.code}: ${response.error.message}`,
                    ),
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
   * Handle unexpected process crash with auto-restart.
   * F4 Fix: Uses restartingProcesses set to prevent race conditions.
   *
   * @param name - Process name
   * @param dep - Original dependency config for respawn
   * @param reason - Crash reason for logging
   */
  private handleCrash(name: string, dep: McpDependency, reason: string): void {
    // F4 Fix: Mark as restarting to block concurrent getOrSpawn calls
    if (this.restartingProcesses.has(name)) {
      logDebug(`${name} already restarting, ignoring duplicate crash`);
      return;
    }
    this.restartingProcesses.add(name);

    // Create promise that resolves when restart completes
    const restartPromise = this.doRestart(name, dep, reason);
    this.restartPromises.set(name, restartPromise);

    // Clean up after restart completes
    restartPromise.finally(() => {
      this.restartingProcesses.delete(name);
      this.restartPromises.delete(name);
    });
  }

  /**
   * Internal restart logic.
   */
  private async doRestart(name: string, dep: McpDependency, reason: string): Promise<void> {
    // Clean up crashed process
    this.processes.delete(name);

    // Notify callback if provided
    this.crashOptions.onCrash?.(name, reason);

    // Check restart count
    const restartCount = (this.restartCounts.get(name) ?? 0) + 1;
    this.restartCounts.set(name, restartCount);

    if (restartCount > this.crashOptions.maxRetries) {
      logDebug(`${name} crashed ${restartCount} times, giving up (max: ${this.crashOptions.maxRetries})`);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s
    const backoffMs = 1000 * Math.pow(2, restartCount - 1);
    logDebug(`${name} restart attempt ${restartCount}/${this.crashOptions.maxRetries} in ${backoffMs}ms`);

    await new Promise((r) => setTimeout(r, backoffMs));

    // Attempt restart
    try {
      await this.spawn(dep);
      logDebug(`${name} restarted successfully (attempt ${restartCount})`);
      // Reset count on successful restart
      this.restartCounts.delete(name);
    } catch (error) {
      logDebug(`${name} restart failed (attempt ${restartCount}): ${error}`);
      // Will retry on next crash detection
    }
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
