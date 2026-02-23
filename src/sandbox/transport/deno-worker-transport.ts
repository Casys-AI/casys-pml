/**
 * Deno Worker Transport
 *
 * MessageTransport implementation for Deno Workers.
 *
 * @module sandbox/transport/deno-worker-transport
 */

import { BaseTransport } from "./base-transport.ts";

/**
 * MessageTransport implementation for Deno Workers.
 *
 * Wraps a Worker instance to provide the MessageTransport interface,
 * allowing RpcBridge to communicate with Workers transparently.
 *
 * @example
 * ```ts
 * const worker = new Worker(new URL("./script.ts", import.meta.url), {
 *   type: "module",
 *   deno: { permissions: "none" },
 * });
 *
 * const transport = new DenoWorkerTransport(worker);
 * const bridge = new RpcBridge(transport, onRpc);
 * ```
 */
export class DenoWorkerTransport extends BaseTransport {
  private messageHandlerRegistered = false;
  private errorHandlerRegistered = false;

  constructor(private readonly worker: Worker) {
    super();
  }

  /**
   * Send a message to the Worker via postMessage.
   */
  protected doSend(message: unknown): void {
    this.worker.postMessage(message);
  }

  /**
   * Register handler for messages from the Worker.
   *
   * @throws Error if a handler has already been registered
   */
  onMessage(handler: (message: unknown) => void): void {
    if (this.messageHandlerRegistered) {
      throw new Error(
        "Message handler already registered. DenoWorkerTransport only supports a single handler.",
      );
    }
    this.messageHandlerRegistered = true;
    this.worker.onmessage = (e: MessageEvent) => handler(e.data);
  }

  /**
   * Register handler for Worker errors.
   *
   * Workers support explicit error events, so this is fully functional.
   *
   * @throws Error if a handler has already been registered
   */
  override onError(handler: (error: Error) => void): void {
    if (this.errorHandlerRegistered) {
      throw new Error(
        "Error handler already registered. DenoWorkerTransport only supports a single handler.",
      );
    }
    this.errorHandlerRegistered = true;
    this.worker.onerror = (e: ErrorEvent) => handler(new Error(e.message));
  }

  /**
   * Terminate the Worker.
   */
  protected doClose(): void {
    this.worker.terminate();
  }
}
