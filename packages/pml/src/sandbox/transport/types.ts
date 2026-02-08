/**
 * MessageTransport Types
 *
 * Interfaces for abstracting message passing between different transport mechanisms
 * (Deno Workers, browser iframes, etc.).
 *
 * @module sandbox/transport/types
 */

/**
 * Generic message transport interface.
 *
 * Abstracts message passing for both Deno Workers and browser iframes,
 * allowing RpcBridge to work with any transport mechanism.
 *
 * @example
 * ```ts
 * // Worker transport
 * const transport = new DenoWorkerTransport(worker);
 *
 * // Iframe transport (browser)
 * const transport = new IframeTransport(iframe);
 *
 * // Both work with RpcBridge
 * const bridge = new RpcBridge(transport, onRpc);
 * ```
 */
export interface MessageTransport {
  /**
   * Send a message to the other side.
   *
   * @param message - Message to send (will be serialized)
   */
  send(message: unknown): void;

  /**
   * Register handler for incoming messages.
   *
   * @param handler - Function called when a message is received
   */
  onMessage(handler: (message: unknown) => void): void;

  /**
   * Optional: Register handler for transport errors.
   *
   * Not all transports have explicit error events (e.g., iframes don't).
   *
   * @param handler - Function called when an error occurs
   */
  onError?(handler: (error: Error) => void): void;

  /**
   * Close the transport and cleanup resources.
   *
   * After calling close(), no more messages will be sent or received.
   */
  close(): void;
}

/**
 * Optional protocol adapter for message transformation.
 *
 * Used to convert between different message formats, such as
 * MCP Apps JSON-RPC and internal PML RPC format.
 *
 * @example
 * ```ts
 * // Convert MCP Apps JSON-RPC to internal format
 * const adapter = new McpAppsProtocolAdapter();
 * const bridge = new RpcBridge(transport, onRpc, timeout, adapter);
 *
 * // Incoming: { jsonrpc: '2.0', method: 'tools/call', params: { name: 'x' } }
 * // Internal: { type: 'rpc', rpcId: '1', method: 'x', args: {} }
 * ```
 */
export interface ProtocolAdapter {
  /**
   * Convert incoming message to internal format.
   *
   * @param message - Raw message from transport
   * @returns Converted message, or null to filter out
   */
  toInternal(message: unknown): unknown | null;

  /**
   * Convert internal message to external format.
   *
   * @param message - Internal message to convert
   * @returns Converted message for sending
   */
  toExternal(message: unknown): unknown;
}
