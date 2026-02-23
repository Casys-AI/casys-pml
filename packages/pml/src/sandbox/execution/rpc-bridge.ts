/**
 * RPC Bridge
 *
 * Handles bidirectional message passing between main thread and sandbox Worker.
 * Routes mcp.* calls from sandbox to appropriate handlers.
 *
 * Supports both direct Worker usage (backward compatible) and MessageTransport
 * abstraction for flexibility with different transport mechanisms.
 *
 * @module sandbox/execution/rpc-bridge
 */

import * as log from "@std/log";
import type {
  PromiseResolver,
  RpcHandler,
  RpcRequestMessage,
} from "../types.ts";
import type { MessageTransport, ProtocolAdapter } from "../transport/types.ts";
import { DenoWorkerTransport } from "../transport/deno-worker-transport.ts";
import { SANDBOX_RPC_TIMEOUT_MS } from "../constants.ts";

/**
 * Log debug message for RPC operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:sandbox:rpc] ${message}`);
}

/**
 * Check if value is a Worker (has postMessage and terminate methods).
 */
function isWorker(value: unknown): value is Worker {
  return (
    typeof value === "object" &&
    value !== null &&
    "postMessage" in value &&
    typeof (value as Worker).postMessage === "function" &&
    "terminate" in value &&
    typeof (value as Worker).terminate === "function"
  );
}

/**
 * RPC Bridge for Worker/Transport communication.
 *
 * Handles:
 * - Sending execute requests to Worker/Transport
 * - Receiving results from Worker/Transport
 * - Receiving mcp.* RPC requests from Worker/Transport
 * - Sending RPC responses back to Worker/Transport
 * - Optional protocol adaptation (e.g., JSON-RPC ↔ internal format)
 *
 * @example
 * ```ts
 * // Direct Worker usage (backward compatible)
 * const bridge = new RpcBridge(worker, async (method, args) => {
 *   return await stdioManager.call(method, args);
 * });
 *
 * // With MessageTransport
 * const transport = new DenoWorkerTransport(worker);
 * const bridge = new RpcBridge(transport, onRpc);
 *
 * // With protocol adapter (for MCP Apps iframes)
 * const bridge = new RpcBridge(iframeTransport, onRpc, 30000, adapter);
 *
 * const result = await bridge.execute(code, args);
 * ```
 */
/**
 * Handler for init messages (MCP Apps ui/initialize).
 * Return value is sent as the init response result.
 */
export type InitHandler = (id?: string) => unknown | Promise<unknown>;

export class RpcBridge {
  private readonly transport: MessageTransport;
  private readonly onRpc: RpcHandler;
  private readonly rpcTimeoutMs: number;
  private readonly adapter?: ProtocolAdapter;
  private readonly onInit?: InitHandler;

  /** Pending execution requests */
  private readonly pendingExecute = new Map<string, PromiseResolver>();

  /** Whether the bridge is shut down */
  private isShutdown = false;

  /**
   * Create an RpcBridge for a Worker.
   *
   * Factory method that wraps the Worker in DenoWorkerTransport.
   *
   * @param worker - Worker instance
   * @param onRpc - Handler for mcp.* calls
   * @param rpcTimeoutMs - Timeout for RPC calls
   * @param onInit - Optional handler for init messages
   * @returns Configured RpcBridge
   *
   * @example
   * ```ts
   * const worker = new Worker(url, { deno: { permissions: "none" } });
   * const bridge = RpcBridge.forWorker(worker, async (method, args) => {
   *   return await handleRpc(method, args);
   * });
   * ```
   */
  static forWorker(
    worker: Worker,
    onRpc: RpcHandler,
    rpcTimeoutMs = SANDBOX_RPC_TIMEOUT_MS,
    onInit?: InitHandler,
  ): RpcBridge {
    return new RpcBridge(
      new DenoWorkerTransport(worker),
      onRpc,
      rpcTimeoutMs,
      undefined, // No adapter for Workers
      onInit,
    );
  }

  /**
   * Create an RpcBridge.
   *
   * @param transportOrWorker - MessageTransport or Worker (backward compatible)
   * @param onRpc - Handler for mcp.* calls
   * @param rpcTimeoutMs - Timeout for RPC calls
   * @param adapter - Optional protocol adapter for message transformation
   * @param onInit - Optional handler for init messages (returns custom init response)
   */
  constructor(
    transportOrWorker: MessageTransport | Worker,
    onRpc: RpcHandler,
    rpcTimeoutMs = SANDBOX_RPC_TIMEOUT_MS,
    adapter?: ProtocolAdapter,
    onInit?: InitHandler,
  ) {
    // Wrap Worker in DenoWorkerTransport for backward compatibility
    this.transport = isWorker(transportOrWorker)
      ? new DenoWorkerTransport(transportOrWorker)
      : transportOrWorker;

    this.onRpc = onRpc;
    this.rpcTimeoutMs = rpcTimeoutMs;
    this.adapter = adapter;
    this.onInit = onInit;

    // Setup message handler
    this.transport.onMessage(this.handleMessage.bind(this));
    this.transport.onError?.(this.handleError.bind(this));
  }

  /**
   * Send execute request to Worker and wait for result.
   *
   * @param id - Unique execution ID
   * @param code - Capability code to execute
   * @param args - Arguments for the capability
   * @param timeoutMs - Optional execution timeout (defaults to no internal timeout)
   * @returns Execution result
   * @throws Error if execution fails or times out
   */
  execute(
    id: string,
    code: string,
    args: unknown,
    timeoutMs?: number,
  ): Promise<unknown> {
    if (this.isShutdown) {
      throw new Error("RpcBridge has been shut down");
    }

    return new Promise((resolve, reject) => {
      let timeoutId: number | undefined;

      // Wrapper to clean up timeout when resolved/rejected
      const cleanupAndResolve = (value: unknown) => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        this.pendingExecute.delete(id);
        resolve(value);
      };

      const cleanupAndReject = (error: Error) => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        this.pendingExecute.delete(id);
        reject(error);
      };

      // Store pending request with cleanup wrappers
      this.pendingExecute.set(id, {
        resolve: cleanupAndResolve,
        reject: cleanupAndReject,
      });

      // Optional internal timeout for cleanup
      if (timeoutMs !== undefined && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (this.pendingExecute.has(id)) {
            this.pendingExecute.delete(id);
            reject(new Error(`Execution timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }

      // Send execute message
      const message = {
        type: "execute",
        id,
        code,
        args,
      };

      this.transport.send(
        this.adapter ? this.adapter.toExternal(message) : message,
      );

      logDebug(`Sent execute request: ${id}`);
    });
  }

  /**
   * Cancel a pending execution.
   *
   * Used by SandboxWorker when external timeout triggers to prevent memory leaks.
   *
   * @param id - Execution ID to cancel
   * @param reason - Optional reason for cancellation
   */
  cancelExecution(id: string, reason = "Execution cancelled"): void {
    const pending = this.pendingExecute.get(id);
    if (pending) {
      this.pendingExecute.delete(id);
      pending.reject(new Error(reason));
      logDebug(`Execution cancelled: ${id} - ${reason}`);
    }
  }

  /**
   * Handle incoming messages from Worker/Transport.
   */
  private async handleMessage(rawData: unknown): Promise<void> {
    if (this.isShutdown) return;

    // Apply adapter transformation if provided
    const data = this.adapter
      ? this.adapter.toInternal(rawData)
      : rawData;

    // Adapter filtered out the message
    if (!data) return;

    const message = data as { type?: string; id?: string; rpcId?: string };
    const type = message.type;

    logDebug(`Received message: type=${type} id=${message.id || message.rpcId}`);

    switch (type) {
      case "result":
        this.handleResult(
          (data as { id: string; value: unknown }).id,
          (data as { value: unknown }).value,
        );
        break;

      case "error":
        this.handleExecuteError(
          (data as { id: string }).id,
          (data as { error: string }).error,
          (data as { code?: string }).code,
        );
        break;

      case "rpc":
        await this.handleRpcRequest(data as RpcRequestMessage);
        break;

      case "init":
        // Handle init messages (from MCP Apps)
        await this.handleInit((data as { id?: string }).id);
        break;

      case "context_update":
        // Handle context updates (from MCP Apps event routing)
        logDebug(`Context update received: ${JSON.stringify(data)}`);
        break;

      default:
        logDebug(`Unknown message type: ${type}`);
    }
  }

  /**
   * Handle init message (MCP Apps ui/initialize).
   */
  private async handleInit(id?: string): Promise<void> {
    logDebug(`Init request received: ${id}`);

    try {
      // Use custom init handler if provided, otherwise default response
      const result = this.onInit
        ? await Promise.resolve(this.onInit(id))
        : { status: "ok" };

      if (this.isShutdown || this.transport.closed) {
        logDebug(`Init response dropped (transport closed): ${id}`);
        return;
      }

      // Send init response
      const response = {
        type: "init_response",
        id,
        result,
      };

      this.transport.send(
        this.adapter ? this.adapter.toExternal(response) : response,
      );

      logDebug(`Init response sent: ${id}`);
    } catch (error) {
      if (this.isShutdown || this.transport.closed) {
        logDebug(`Init error dropped (transport closed): ${id} - ${error}`);
        return;
      }

      // Send error response
      const errorResponse = {
        type: "rpc_error",
        id,
        error: error instanceof Error ? error.message : String(error),
      };

      this.transport.send(
        this.adapter ? this.adapter.toExternal(errorResponse) : errorResponse,
      );

      logDebug(`Init error: ${id} - ${error}`);
    }
  }

  /**
   * Handle execution result from Worker.
   */
  private handleResult(id: string, value: unknown): void {
    const pending = this.pendingExecute.get(id);
    if (pending) {
      this.pendingExecute.delete(id);
      pending.resolve(value);
      logDebug(`Execution completed: ${id}`);
    }
  }

  /**
   * Handle execution error from Worker.
   */
  private handleExecuteError(
    id: string,
    error: string,
    code?: string,
  ): void {
    const pending = this.pendingExecute.get(id);
    if (pending) {
      this.pendingExecute.delete(id);
      const err = new Error(error);
      (err as Error & { code?: string }).code = code;
      pending.reject(err);
      logDebug(`Execution failed: ${id} - ${error}`);
    }
  }

  /**
   * Handle RPC request from Worker (mcp.* call).
   *
   * Routes the call through the onRpc handler and sends response back.
   */
  private async handleRpcRequest(request: RpcRequestMessage): Promise<void> {
    const { rpcId, method, args } = request;

    logDebug(`RPC request: ${method} (${rpcId})`);

    try {
      // Set up timeout for RPC call
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

      // Transport may have been closed while awaiting RPC (e.g. parallel calls where one fails)
      if (this.isShutdown || this.transport.closed) {
        logDebug(`RPC response dropped (transport closed): ${method} (${rpcId})`);
        return;
      }

      // Send response back
      const response = {
        type: "rpc_response",
        id: rpcId,
        result,
      };

      this.transport.send(
        this.adapter ? this.adapter.toExternal(response) : response,
      );

      logDebug(`RPC response: ${method} (${rpcId}) - success`);
    } catch (error) {
      // Transport may have been closed while awaiting RPC (e.g. parallel calls where one fails)
      if (this.isShutdown || this.transport.closed) {
        logDebug(`RPC error dropped (transport closed): ${method} (${rpcId}) - ${error}`);
        return;
      }

      // Send error back
      const errorResponse = {
        type: "rpc_error",
        id: rpcId,
        error: error instanceof Error ? error.message : String(error),
      };

      this.transport.send(
        this.adapter ? this.adapter.toExternal(errorResponse) : errorResponse,
      );

      logDebug(`RPC error: ${method} (${rpcId}) - ${error}`);
    }
  }

  /**
   * Handle Transport error.
   */
  private handleError(error: Error): void {
    logDebug(`Transport error: ${error.message}`);

    // Reject all pending executions
    for (const [id, pending] of this.pendingExecute) {
      pending.reject(new Error(`Transport error: ${error.message}`));
      this.pendingExecute.delete(id);
    }
  }

  /**
   * Shut down the bridge.
   *
   * Rejects all pending requests and marks bridge as shut down.
   */
  close(): void {
    this.isShutdown = true;

    // Reject all pending executions
    for (const [id, pending] of this.pendingExecute) {
      pending.reject(new Error("RpcBridge shut down"));
      this.pendingExecute.delete(id);
    }

    // Close the transport
    this.transport.close();

    logDebug("RpcBridge closed");
  }

  /**
   * Check if bridge is shut down.
   */
  get shutdown(): boolean {
    return this.isShutdown;
  }
}
