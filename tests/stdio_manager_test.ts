/**
 * Stdio Manager Tests
 *
 * Tests for JSON-RPC protocol and stdio manager.
 *
 * @module tests/stdio_manager_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  createErrorResponse,
  createNotification,
  createRequest,
  extractResult,
  isErrorResponse,
  JsonRpcErrorCodes,
  parseResponse,
  serializeMessage,
} from "../src/loader/stdio-rpc.ts";
import { StdioManager } from "../src/loader/stdio-manager.ts";

// ============================================================================
// JSON-RPC Protocol Tests
// ============================================================================

Deno.test("createRequest - creates valid JSON-RPC request", () => {
  const request = createRequest(1, "tools/call", { name: "test" });

  assertEquals(request.jsonrpc, "2.0");
  assertEquals(request.id, 1);
  assertEquals(request.method, "tools/call");
  assertEquals(request.params, { name: "test" });
});

Deno.test("createRequest - works with string ID", () => {
  const request = createRequest("uuid-123", "initialize", {});

  assertEquals(request.id, "uuid-123");
  assertEquals(request.method, "initialize");
});

Deno.test("createNotification - creates valid notification", () => {
  const notification = createNotification("initialized", {});

  assertEquals(notification.jsonrpc, "2.0");
  assertEquals(notification.method, "initialized");
  assertEquals((notification as { id?: unknown }).id, undefined);
});

Deno.test("serializeMessage - returns newline-terminated JSON", () => {
  const request = createRequest(1, "test", {});
  const bytes = serializeMessage(request);
  const text = new TextDecoder().decode(bytes);

  assertEquals(text.endsWith("\n"), true);
  assertEquals(JSON.parse(text.trim()).jsonrpc, "2.0");
});

Deno.test("parseResponse - parses valid response", () => {
  const buffer = '{"jsonrpc":"2.0","id":1,"result":{"success":true}}\n';
  const { response, remaining } = parseResponse(buffer);

  assertExists(response);
  assertEquals(response.id, 1);
  assertEquals(response.result, { success: true });
  assertEquals(remaining, "");
});

Deno.test("parseResponse - handles partial data", () => {
  const buffer = '{"jsonrpc":"2.0","id":1,"result":';
  const { response, remaining } = parseResponse(buffer);

  assertEquals(response, null);
  assertEquals(remaining, buffer);
});

Deno.test("parseResponse - handles multiple responses", () => {
  const buffer = '{"jsonrpc":"2.0","id":1,"result":"a"}\n{"jsonrpc":"2.0","id":2,"result":"b"}\n';

  const { response: r1, remaining: rem1 } = parseResponse(buffer);
  assertExists(r1);
  assertEquals(r1.id, 1);

  const { response: r2, remaining: rem2 } = parseResponse(rem1);
  assertExists(r2);
  assertEquals(r2.id, 2);
  assertEquals(rem2, "");
});

Deno.test("parseResponse - handles error responses", () => {
  const buffer = '{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"Invalid"}}\n';
  const { response } = parseResponse(buffer);

  assertExists(response);
  assertExists(response.error);
  assertEquals(response.error.code, -32600);
  assertEquals(response.error.message, "Invalid");
});

Deno.test("isErrorResponse - detects error", () => {
  const errorResponse = { jsonrpc: "2.0" as const, id: 1, error: { code: -32600, message: "err" } };
  const successResponse = { jsonrpc: "2.0" as const, id: 1, result: {} };

  assertEquals(isErrorResponse(errorResponse), true);
  assertEquals(isErrorResponse(successResponse), false);
});

Deno.test("extractResult - returns result for success", () => {
  const response = { jsonrpc: "2.0" as const, id: 1, result: { data: "test" } };
  const result = extractResult<{ data: string }>(response);

  assertEquals(result.data, "test");
});

Deno.test("extractResult - throws for error response", () => {
  const response = { jsonrpc: "2.0" as const, id: 1, error: { code: -32600, message: "Invalid" } };

  try {
    extractResult(response);
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals((error as Error).message.includes("Invalid"), true);
  }
});

Deno.test("createErrorResponse - creates valid error", () => {
  const response = createErrorResponse(1, -32600, "Invalid Request", { extra: "data" });

  assertEquals(response.jsonrpc, "2.0");
  assertEquals(response.id, 1);
  assertExists(response.error);
  assertEquals(response.error.code, -32600);
  assertEquals(response.error.message, "Invalid Request");
  assertEquals(response.error.data, { extra: "data" });
});

Deno.test("JsonRpcErrorCodes - has standard codes", () => {
  assertEquals(JsonRpcErrorCodes.PARSE_ERROR, -32700);
  assertEquals(JsonRpcErrorCodes.INVALID_REQUEST, -32600);
  assertEquals(JsonRpcErrorCodes.METHOD_NOT_FOUND, -32601);
  assertEquals(JsonRpcErrorCodes.INVALID_PARAMS, -32602);
  assertEquals(JsonRpcErrorCodes.INTERNAL_ERROR, -32603);
});

// ============================================================================
// StdioManager Tests
// ============================================================================

Deno.test("StdioManager - creates with default idle timeout", () => {
  const manager = new StdioManager();
  assertEquals(manager["idleTimeoutMs"], 5 * 60 * 1000);
});

Deno.test("StdioManager - creates with custom idle timeout", () => {
  const manager = new StdioManager(60_000);
  assertEquals(manager["idleTimeoutMs"], 60_000);
});

Deno.test("StdioManager - isRunning returns false initially", () => {
  const manager = new StdioManager();
  assertEquals(manager.isRunning("test"), false);
});

Deno.test("StdioManager - getRunningProcesses returns empty initially", () => {
  const manager = new StdioManager();
  assertEquals(manager.getRunningProcesses(), []);
});

Deno.test("StdioManager - getProcessInfo returns undefined for unknown", () => {
  const manager = new StdioManager();
  assertEquals(manager.getProcessInfo("unknown"), undefined);
});

Deno.test("StdioManager - shutdown handles unknown process gracefully", () => {
  const manager = new StdioManager();
  // Should not throw
  manager.shutdown("nonexistent");
});

Deno.test("StdioManager - shutdownAll on empty manager works", () => {
  const manager = new StdioManager();
  // Should not throw
  manager.shutdownAll();
  assertEquals(manager.getRunningProcesses(), []);
});

// Note: Full spawn/call tests require actual MCP server binaries
// which are tested in integration tests
