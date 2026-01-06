/**
 * Stdio JSON-RPC Protocol
 *
 * Implements JSON-RPC 2.0 over stdio for MCP communication.
 *
 * @module loader/stdio-rpc
 */

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 Notification (no id)
 */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

/**
 * Parse JSON-RPC response from buffer.
 *
 * @param buffer - Buffer containing JSON data
 * @returns Parsed response and remaining buffer
 */
export function parseResponse(
  buffer: string,
): { response: JsonRpcResponse | null; remaining: string } {
  // Look for complete JSON object (newline-delimited)
  const newlineIndex = buffer.indexOf("\n");

  if (newlineIndex === -1) {
    return { response: null, remaining: buffer };
  }

  const line = buffer.slice(0, newlineIndex).trim();
  const remaining = buffer.slice(newlineIndex + 1);

  if (!line) {
    return { response: null, remaining };
  }

  try {
    const data = JSON.parse(line);

    // Validate it's a JSON-RPC response
    if (data.jsonrpc !== "2.0") {
      throw new Error("Not a JSON-RPC 2.0 response");
    }

    return { response: data as JsonRpcResponse, remaining };
  } catch {
    // Invalid JSON, skip this line
    return { response: null, remaining };
  }
}

/**
 * Create JSON-RPC request.
 */
export function createRequest(
  id: string | number,
  method: string,
  params?: unknown,
): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

/**
 * Create JSON-RPC notification (no id, no response expected).
 */
export function createNotification(
  method: string,
  params?: unknown,
): JsonRpcNotification {
  return {
    jsonrpc: "2.0",
    method,
    params,
  };
}

/**
 * Serialize JSON-RPC message for stdio.
 */
export function serializeMessage(message: JsonRpcRequest | JsonRpcNotification): Uint8Array {
  const json = JSON.stringify(message);
  return new TextEncoder().encode(json + "\n");
}

/**
 * Check if a response is an error.
 */
export function isErrorResponse(response: JsonRpcResponse): boolean {
  return response.error !== undefined;
}

/**
 * Extract result from response.
 *
 * @throws Error if response is an error
 */
export function extractResult<T>(response: JsonRpcResponse): T {
  if (response.error) {
    throw new Error(
      `JSON-RPC Error (${response.error.code}): ${response.error.message}`,
    );
  }

  return response.result as T;
}

/**
 * Standard JSON-RPC error codes.
 */
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Create a standard error response.
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}
