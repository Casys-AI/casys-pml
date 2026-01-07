/**
 * Sandbox Worker Runner
 *
 * Creates and manages isolated Deno Workers for capability code execution.
 * Workers run with `permissions: "none"` - complete isolation.
 *
 * @module sandbox/execution/worker-runner
 */

import * as log from "@std/log";
import type {
  PromiseResolver,
  RpcHandler,
  SandboxError,
  SandboxResult,
  SandboxWorkerOptions,
} from "../types.ts";
import {
  SANDBOX_EXECUTION_TIMEOUT_MS,
  SANDBOX_RPC_TIMEOUT_MS,
} from "../constants.ts";

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
  private readonly onRpc: RpcHandler;
  private readonly executionTimeoutMs: number;
  private readonly rpcTimeoutMs: number;

  /** Pending execution request (only one at a time) */
  private pendingExecution: PromiseResolver | null = null;

  /** Current execution ID */
  private currentExecutionId: string | null = null;

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

    try {
      // Create worker if not exists
      if (!this.worker) {
        await this.initializeWorker();
      }

      // Generate execution ID
      const executionId = crypto.randomUUID();
      this.currentExecutionId = executionId;

      logDebug(`Executing in sandbox: ${executionId}`);

      // Create execution promise
      const resultPromise = new Promise<unknown>((resolve, reject) => {
        this.pendingExecution = { resolve, reject };

        // Send execute message to worker
        this.worker!.postMessage({
          type: "execute",
          id: executionId,
          code,
          args,
        });
      });

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Sandbox execution timeout (${this.executionTimeoutMs}ms)`));
        }, this.executionTimeoutMs);
      });

      // Race execution against timeout
      const result = await Promise.race([resultPromise, timeoutPromise]);

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

      // Terminate worker on timeout to clean up
      if (sandboxError.code === "EXECUTION_TIMEOUT") {
        this.terminateWorker();
      }

      return {
        success: false,
        error: sandboxError,
        durationMs,
      };
    } finally {
      this.pendingExecution = null;
      this.currentExecutionId = null;
    }
  }

  /**
   * Initialize the sandbox Worker.
   *
   * Creates a Worker with `permissions: "none"` for complete isolation.
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

    // Setup message handler
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleWorkerError.bind(this);

    // Wait for worker to be ready (small delay for initialization)
    await new Promise((resolve) => setTimeout(resolve, 10));

    logDebug("Sandbox Worker initialized");
  }

  /**
   * Handle messages from the Worker.
   */
  private async handleWorkerMessage(event: MessageEvent): Promise<void> {
    const data = event.data;
    const type = data.type;

    logDebug(`Worker message: type=${type}`);

    switch (type) {
      case "result":
        // Execution succeeded
        if (this.pendingExecution && data.id === this.currentExecutionId) {
          this.pendingExecution.resolve(data.value);
        }
        break;

      case "error":
        // Execution failed
        if (this.pendingExecution && data.id === this.currentExecutionId) {
          const error = new Error(data.error);
          (error as Error & { code?: string }).code = data.code;
          this.pendingExecution.reject(error);
        }
        break;

      case "rpc":
        // mcp.* call from sandbox
        await this.handleRpcRequest(data);
        break;
    }
  }

  /**
   * Handle RPC request from Worker (mcp.* call).
   */
  private async handleRpcRequest(request: {
    rpcId: string;
    method: string;
    args: unknown;
  }): Promise<void> {
    const { rpcId, method, args } = request;

    logDebug(`RPC request: ${method} (${rpcId})`);

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`RPC timeout: ${method}`));
        }, this.rpcTimeoutMs);
      });

      // Execute RPC with timeout
      const result = await Promise.race([
        this.onRpc(method, args),
        timeoutPromise,
      ]);

      // Send response back to Worker
      this.worker?.postMessage({
        type: "rpc_response",
        id: rpcId,
        result,
      });

      logDebug(`RPC response: ${method} (${rpcId})`);
    } catch (error) {
      // Send error back to Worker
      this.worker?.postMessage({
        type: "rpc_error",
        id: rpcId,
        error: error instanceof Error ? error.message : String(error),
      });

      logDebug(`RPC error: ${method} (${rpcId}) - ${error}`);
    }
  }

  /**
   * Handle Worker error.
   */
  private handleWorkerError(event: ErrorEvent): void {
    logDebug(`Worker error: ${event.message}`);

    if (this.pendingExecution) {
      const error = new Error(`Worker error: ${event.message}`);
      (error as Error & { code?: string }).code = "WORKER_TERMINATED";
      this.pendingExecution.reject(error);
    }

    // Terminate and mark as shutdown
    this.terminateWorker();
  }

  /**
   * Format an error into SandboxError.
   */
  private formatError(error: unknown): SandboxError {
    if (error instanceof Error) {
      // Check for specific error types
      const message = error.message;
      const code = (error as Error & { code?: string }).code;

      if (message.includes("timeout") || message.includes("Timeout")) {
        return {
          code: "EXECUTION_TIMEOUT",
          message: message,
          stack: error.stack,
        };
      }

      if (message.includes("PermissionDenied") || code === "PERMISSION_DENIED") {
        return {
          code: "PERMISSION_DENIED",
          message: message,
          stack: error.stack,
        };
      }

      if (message.includes("Worker") || code === "WORKER_TERMINATED") {
        return {
          code: "WORKER_TERMINATED",
          message: message,
          stack: error.stack,
        };
      }

      return {
        code: "CODE_ERROR",
        message: message,
        stack: error.stack,
      };
    }

    return {
      code: "CODE_ERROR",
      message: String(error),
    };
  }

  /**
   * Terminate the Worker.
   */
  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      logDebug("Worker terminated");
    }
  }

  /**
   * Shut down the sandbox.
   *
   * Terminates the Worker and cleans up resources.
   */
  shutdown(): void {
    if (this.isShutdown) return;

    this.isShutdown = true;

    // Reject pending execution
    if (this.pendingExecution) {
      this.pendingExecution.reject(new Error("Sandbox shut down"));
      this.pendingExecution = null;
    }

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
