/**
 * MCP Apps Protocol Adapter
 *
 * Converts between MCP Apps JSON-RPC format and internal PML RPC format.
 *
 * @module sandbox/transport/mcp-apps-adapter
 */

import type { ProtocolAdapter } from "./types.ts";

/**
 * MCP Apps JSON-RPC message format.
 */
interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
}

/**
 * MCP Apps JSON-RPC response format.
 */
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Internal PML RPC message format.
 */
interface InternalRpcMessage {
  type: string;
  id?: string;
  rpcId?: string;
  method?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

/**
 * Protocol adapter for MCP Apps JSON-RPC ↔ internal PML format.
 *
 * Handles bidirectional conversion between:
 * - MCP Apps: `{ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments } }`
 * - Internal: `{ type: 'rpc', rpcId, method, args }`
 *
 * @example
 * ```ts
 * const adapter = new McpAppsProtocolAdapter();
 *
 * // Incoming JSON-RPC → internal format
 * const internal = adapter.toInternal({
 *   jsonrpc: '2.0',
 *   id: 1,
 *   method: 'tools/call',
 *   params: { name: 'postgres:query', arguments: { sql: 'SELECT 1' } }
 * });
 * // Result: { type: 'rpc', rpcId: '1', method: 'postgres:query', args: { sql: 'SELECT 1' } }
 *
 * // Internal response → JSON-RPC
 * const jsonRpc = adapter.toExternal({
 *   type: 'rpc_response',
 *   id: '1',
 *   result: { rows: [{ id: 1 }] }
 * });
 * // Result: { jsonrpc: '2.0', id: '1', result: { rows: [{ id: 1 }] } }
 * ```
 */
export class McpAppsProtocolAdapter implements ProtocolAdapter {
  /**
   * Convert MCP Apps JSON-RPC message to internal format.
   *
   * @param message - Raw JSON-RPC message from iframe
   * @returns Internal message format, or null to filter out
   */
  toInternal(message: unknown): InternalRpcMessage | null {
    // Type guard: ensure message is an object
    if (typeof message !== "object" || message === null) {
      return null;
    }

    const msg = message as JsonRpcMessage;

    // Validate JSON-RPC format
    if (!msg.jsonrpc || msg.jsonrpc !== "2.0") return null;

    // ui/initialize → init message
    if (msg.method === "ui/initialize") {
      return {
        type: "init",
        id: String(msg.id ?? ""),
      };
    }

    // tools/call → rpc message
    if (msg.method === "tools/call") {
      const params = msg.params as { name: string; arguments?: unknown } | undefined;
      if (!params?.name) return null;

      return {
        type: "rpc",
        rpcId: String(msg.id ?? ""),
        method: params.name,
        args: params.arguments,
      };
    }

    // ui/update-model-context → context update (for event routing)
    if (msg.method === "ui/update-model-context") {
      return {
        type: "context_update",
        id: String(msg.id ?? ""),
        args: msg.params,
      };
    }

    // Notifications (no id) or unknown methods
    if (msg.method?.startsWith("notifications/")) {
      return {
        type: "notification",
        method: msg.method,
        args: msg.params,
      };
    }

    // Unknown method - filter out
    return null;
  }

  /**
   * Convert internal message to MCP Apps JSON-RPC response.
   *
   * @param message - Internal message to convert
   * @returns JSON-RPC formatted response, or original message if not recognized
   */
  toExternal(message: unknown): JsonRpcResponse | typeof message {
    // Type guard: ensure message is an object with type property
    if (typeof message !== "object" || message === null) {
      return message;
    }

    const msg = message as InternalRpcMessage;

    // rpc_response → JSON-RPC result
    if (msg.type === "rpc_response") {
      return {
        jsonrpc: "2.0",
        id: msg.id ?? msg.rpcId ?? "",
        result: msg.result,
      } as JsonRpcResponse;
    }

    // rpc_error → JSON-RPC error
    if (msg.type === "rpc_error") {
      return {
        jsonrpc: "2.0",
        id: msg.id ?? msg.rpcId ?? "",
        error: {
          code: -32000, // Server error
          message: msg.error ?? "Unknown error",
        },
      } as JsonRpcResponse;
    }

    // init_response → JSON-RPC result for ui/initialize
    if (msg.type === "init_response") {
      return {
        jsonrpc: "2.0",
        id: msg.id ?? "",
        result: msg.result ?? {},
      } as JsonRpcResponse;
    }

    // Pass through other messages unchanged
    return message;
  }
}
