/**
 * Base Transport
 *
 * Abstract base class for MessageTransport implementations.
 * Provides common state management and validation logic.
 *
 * @module sandbox/transport/base-transport
 */

import type { MessageTransport } from "./types.ts";

/**
 * Abstract base class for MessageTransport implementations.
 *
 * Provides common functionality:
 * - Closed state tracking
 * - Send validation (throws if closed)
 * - Idempotent close handling
 *
 * Subclasses must implement:
 * - doSend() - actual message sending
 * - onMessage() - message handler registration
 * - doClose() - transport-specific cleanup
 *
 * @example
 * ```ts
 * class MyTransport extends BaseTransport {
 *   protected doSend(message: unknown): void {
 *     // Send logic
 *   }
 *
 *   onMessage(handler: (message: unknown) => void): void {
 *     // Register handler
 *   }
 *
 *   protected doClose(): void {
 *     // Cleanup
 *   }
 * }
 * ```
 */
export abstract class BaseTransport implements MessageTransport {
  private _isClosed = false;

  /**
   * Check if transport has been closed.
   */
  get closed(): boolean {
    return this._isClosed;
  }

  /**
   * Protected access to closed state for subclasses.
   */
  protected get isClosed(): boolean {
    return this._isClosed;
  }

  /**
   * Send a message through the transport.
   *
   * @param message - Message to send
   * @throws Error if transport has been closed
   */
  send(message: unknown): void {
    if (this._isClosed) {
      throw new Error(`${this.constructor.name} has been closed`);
    }
    this.doSend(message);
  }

  /**
   * Actual send implementation - subclass must override.
   */
  protected abstract doSend(message: unknown): void;

  /**
   * Register handler for incoming messages.
   * Subclass must implement.
   */
  abstract onMessage(handler: (message: unknown) => void): void;

  /**
   * Register handler for transport errors.
   * Optional - not all transports support error events.
   *
   * Default implementation logs a warning per no-silent-fallbacks policy.
   */
  onError(_handler: (error: Error) => void): void {
    console.warn(
      `[${this.constructor.name}] onError() not supported by this transport. ` +
        "Error handling will rely on timeouts.",
    );
  }

  /**
   * Close the transport and cleanup resources.
   * Idempotent - safe to call multiple times.
   */
  close(): void {
    if (this._isClosed) return;
    this._isClosed = true;
    this.doClose();
  }

  /**
   * Transport-specific cleanup - subclass must override.
   */
  protected abstract doClose(): void;
}
