/**
 * Sandbox Worker Runner
 *
 * Creates and manages isolated Deno Workers for capability code execution.
 * Workers run with `permissions: "none"` - complete isolation.
 *
 * Delegates message handling to RpcBridge - SandboxWorker manages lifecycle only.
 *
 * @module sandbox/execution/worker-runner
 */

import * as log from "@std/log";
import { uuidv7 } from "../../utils/uuid.ts";
import type {
  RpcHandler,
  SandboxError,
  SandboxResult,
  SandboxWorkerOptions,
} from "../types.ts";
import {
  SANDBOX_EXECUTION_TIMEOUT_MS,
  SANDBOX_RPC_TIMEOUT_MS,
} from "../constants.ts";
import { RpcBridge } from "./rpc-bridge.ts";

/**
 * Log debug message for sandbox operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:sandbox] ${message}`);
}

/**
 * Sandbox Worker for isolated capability code execution.
 *
 * Each SandboxWorker instance runs capability code in a completely isolated
 * Deno Worker with `permissions: "none"`. The capability code can ONLY
 * interact with the outside world via mcp.* RPC calls.
 *
 * Lifecycle management (Worker creation, timeout, shutdown) is handled here.
 * Message passing (RPC, results, errors) is delegated to RpcBridge.
 *
 * @example
 * ```ts
 * const sandbox = new SandboxWorker({
 *   onRpc: async (method, args) => {
 *     // Route mcp.* calls to appropriate handler
 *     return await stdioManager.call(method, args);
 *   },
 * });
 *
 * const result = await sandbox.execute(code, args);
 * sandbox.shutdown();
 * ```
 */
export class SandboxWorker {
  private worker: Worker | null = null;
  private bridge: RpcBridge | null = null;
  private readonly onRpc: RpcHandler;
  private readonly executionTimeoutMs: number;
  private readonly rpcTimeoutMs: number;

  /** Whether the sandbox has been shut down */
  private isShutdown = false;

  constructor(options: SandboxWorkerOptions) {
    this.onRpc = options.onRpc;
    this.executionTimeoutMs = options.executionTimeoutMs ?? SANDBOX_EXECUTION_TIMEOUT_MS;
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? SANDBOX_RPC_TIMEOUT_MS;
  }

  /**
   * Execute capability code in the sandbox.
   *
   * @param code - Capability code to execute
   * @param args - Arguments passed to the capability
   * @returns Execution result with success/error info
   */
  async execute(code: string, args: unknown): Promise<SandboxResult> {
    if (this.isShutdown) {
      return {
        success: false,
        error: {
          code: "WORKER_TERMINATED",
          message: "Sandbox has been shut down",
        },
        durationMs: 0,
      };
    }

    const startTime = Date.now();
    // Generate execution ID early for cleanup tracking
    const executionId = uuidv7();

    try {
      // Create worker and bridge if not exists
      if (!this.worker || !this.bridge) {
        await this.initializeWorker();
      }

      logDebug(`Executing in sandbox: ${executionId}`);

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Sandbox execution timeout (${this.executionTimeoutMs}ms)`));
        }, this.executionTimeoutMs);
      });

      // Race execution against timeout - delegate to RpcBridge
      const result = await Promise.race([
        this.bridge!.execute(executionId, code, args),
        timeoutPromise,
      ]);

      const durationMs = Date.now() - startTime;
      logDebug(`Execution completed in ${durationMs}ms`);

      return {
        success: true,
        value: result,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const sandboxError = this.formatError(error);

      logDebug(`Execution failed after ${durationMs}ms: ${sandboxError.message}`);

      // Cancel pending execution in RpcBridge to prevent memory leak
      if (this.bridge) {
        this.bridge.cancelExecution(
          executionId,
          `External timeout: ${sandboxError.message}`,
        );
      }

      // Terminate worker on timeout to clean up
      if (sandboxError.code === "EXECUTION_TIMEOUT") {
        this.terminateWorker();
      }

      return {
        success: false,
        error: sandboxError,
        durationMs,
      };
    }
  }

  /**
   * Initialize the sandbox Worker and RpcBridge.
   *
   * Creates a Worker with `permissions: "none"` for complete isolation.
   * Delegates message handling to RpcBridge via factory method.
   */
  private async initializeWorker(): Promise<void> {
    logDebug("Initializing sandbox Worker");

    // Create Worker with no permissions
    this.worker = new Worker(
      new URL("./sandbox-script.ts", import.meta.url),
      {
        type: "module",
        deno: {
          permissions: "none", // 🔒 Complete isolation
        },
      },
    );

    // Create RpcBridge with factory (handles transport internally)
    this.bridge = RpcBridge.forWorker(this.worker, this.onRpc, this.rpcTimeoutMs);

    // Wait for worker to be ready (small delay for initialization)
    await new Promise((resolve) => setTimeout(resolve, 10));

    logDebug("Sandbox Worker initialized with RpcBridge");
  }

  /**
   * Detect sandbox error code from error message and code property.
   */
  private detectErrorCode(message: string, code?: string): SandboxError["code"] {
    if (message.includes("timeout") || message.includes("Timeout")) {
      return "EXECUTION_TIMEOUT";
    }
    if (message.includes("PermissionDenied") || code === "PERMISSION_DENIED") {
      return "PERMISSION_DENIED";
    }
    if (message.includes("Worker") || code === "WORKER_TERMINATED") {
      return "WORKER_TERMINATED";
    }
    return "CODE_ERROR";
  }

  /**
   * Format an error into SandboxError.
   */
  private formatError(error: unknown): SandboxError {
    if (!(error instanceof Error)) {
      return { code: "CODE_ERROR", message: String(error) };
    }

    const code = (error as Error & { code?: string }).code;
    return {
      code: this.detectErrorCode(error.message, code),
      message: error.message,
      stack: error.stack,
    };
  }

  /**
   * Terminate the Worker and close the bridge.
   *
   * Note: RpcBridge.close() calls transport.close() which terminates the worker,
   * so we only need to call bridge.close() - no separate worker.terminate().
   */
  private terminateWorker(): void {
    if (this.bridge) {
      this.bridge.close();
      this.bridge = null;
    }
    // Worker is terminated by bridge.close() -> transport.close()
    this.worker = null;
    logDebug("Worker terminated");
  }

  /**
   * Shut down the sandbox.
   *
   * Terminates the Worker and cleans up resources.
   */
  shutdown(): void {
    if (this.isShutdown) return;

    this.isShutdown = true;
    this.terminateWorker();
    logDebug("Sandbox shut down");
  }

  /**
   * Check if sandbox is active.
   */
  isActive(): boolean {
    return !this.isShutdown && this.worker !== null;
  }
}
