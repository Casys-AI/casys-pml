/**
 * RPC Bridge
 *
 * Handles bidirectional message passing between main thread and sandbox Worker.
 * Routes mcp.* calls from sandbox to appropriate handlers.
 *
 * @module sandbox/execution/rpc-bridge
 */

import * as log from "@std/log";
import type {
  PromiseResolver,
  RpcHandler,
  RpcRequestMessage,
} from "../types.ts";
import { SANDBOX_RPC_TIMEOUT_MS } from "../constants.ts";

/**
 * Log debug message for RPC operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:sandbox:rpc] ${message}`);
}

/**
 * RPC Bridge for Worker communication.
 *
 * Handles:
 * - Sending execute requests to Worker
 * - Receiving results from Worker
 * - Receiving mcp.* RPC requests from Worker
 * - Sending RPC responses back to Worker
 *
 * @example
 * ```ts
 * const bridge = new RpcBridge(worker, async (method, args) => {
 *   // Route mcp.* calls to appropriate handler
 *   return await stdioManager.call(method, args);
 * });
 *
 * const result = await bridge.execute(code, args);
 * ```
 */
export class RpcBridge {
  private readonly worker: Worker;
  private readonly onRpc: RpcHandler;
  private readonly rpcTimeoutMs: number;

  /** Pending execution requests */
  private readonly pendingExecute = new Map<string, PromiseResolver>();

  /** Whether the bridge is shut down */
  private shutdown = false;

  constructor(
    worker: Worker,
    onRpc: RpcHandler,
    rpcTimeoutMs = SANDBOX_RPC_TIMEOUT_MS,
  ) {
    this.worker = worker;
    this.onRpc = onRpc;
    this.rpcTimeoutMs = rpcTimeoutMs;

    // Setup message handler
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
  }

  /**
   * Send execute request to Worker and wait for result.
   *
   * @param id - Unique execution ID
   * @param code - Capability code to execute
   * @param args - Arguments for the capability
   * @returns Execution result
   * @throws Error if execution fails or times out
   */
  async execute(id: string, code: string, args: unknown): Promise<unknown> {
    if (this.shutdown) {
      throw new Error("RpcBridge has been shut down");
    }

    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingExecute.set(id, { resolve, reject });

      // Send execute message to Worker
      this.worker.postMessage({
        type: "execute",
        id,
        code,
        args,
      });

      logDebug(`Sent execute request: ${id}`);
    });
  }

  /**
   * Handle incoming messages from Worker.
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    if (this.shutdown) return;

    const data = event.data;
    const type = data.type;

    logDebug(`Received message: type=${type} id=${data.id || data.rpcId}`);

    switch (type) {
      case "result":
        this.handleResult(data.id, data.value);
        break;

      case "error":
        this.handleExecuteError(data.id, data.error, data.code);
        break;

      case "rpc":
        await this.handleRpcRequest(data as RpcRequestMessage);
        break;

      default:
        logDebug(`Unknown message type: ${type}`);
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
          reject(new Error(`RPC call ${method} timed out after ${this.rpcTimeoutMs}ms`));
        }, this.rpcTimeoutMs);
      });

      // Execute RPC with timeout
      const result = await Promise.race([
        this.onRpc(method, args),
        timeoutPromise,
      ]);

      // Send response back to Worker
      this.worker.postMessage({
        type: "rpc_response",
        id: rpcId,
        result,
      });

      logDebug(`RPC response: ${method} (${rpcId}) - success`);
    } catch (error) {
      // Send error back to Worker
      this.worker.postMessage({
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
  private handleError(event: ErrorEvent): void {
    logDebug(`Worker error: ${event.message}`);

    // Reject all pending executions
    for (const [id, pending] of this.pendingExecute) {
      pending.reject(new Error(`Worker error: ${event.message}`));
      this.pendingExecute.delete(id);
    }
  }

  /**
   * Shut down the bridge.
   *
   * Rejects all pending requests and marks bridge as shut down.
   */
  close(): void {
    this.shutdown = true;

    // Reject all pending executions
    for (const [id, pending] of this.pendingExecute) {
      pending.reject(new Error("RpcBridge shut down"));
      this.pendingExecute.delete(id);
    }

    logDebug("RpcBridge closed");
  }
}
