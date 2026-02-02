/**
 * McpAppsProtocolAdapter Tests
 *
 * @module sandbox/transport/mcp-apps-adapter_test
 */

import { assertEquals } from "@std/assert";
import { McpAppsProtocolAdapter } from "../src/sandbox/transport/mcp-apps-adapter.ts";

// ============================================================================
// toInternal() Tests
// ============================================================================

Deno.test("McpAppsProtocolAdapter - toInternal() converts tools/call to rpc", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "postgres:query", arguments: { sql: "SELECT 1" } },
  };

  const internal = adapter.toInternal(jsonRpc);

  assertEquals(internal, {
    type: "rpc",
    rpcId: "1",
    method: "postgres:query",
    args: { sql: "SELECT 1" },
  });
});

Deno.test("McpAppsProtocolAdapter - toInternal() converts ui/initialize to init", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: "init-1",
    method: "ui/initialize",
    params: {},
  };

  const internal = adapter.toInternal(jsonRpc);

  assertEquals(internal, {
    type: "init",
    id: "init-1",
  });
});

Deno.test("McpAppsProtocolAdapter - toInternal() converts ui/update-model-context", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: "ctx-1",
    method: "ui/update-model-context",
    params: { sharedContext: { key: "value" } },
  };

  const internal = adapter.toInternal(jsonRpc);

  assertEquals(internal, {
    type: "context_update",
    id: "ctx-1",
    args: { sharedContext: { key: "value" } },
  });
});

Deno.test("McpAppsProtocolAdapter - toInternal() handles notifications", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    method: "notifications/cancelled",
    params: { requestId: "123" },
  };

  const internal = adapter.toInternal(jsonRpc);

  assertEquals(internal, {
    type: "notification",
    method: "notifications/cancelled",
    args: { requestId: "123" },
  });
});

Deno.test("McpAppsProtocolAdapter - toInternal() returns null for invalid JSON-RPC", () => {
  const adapter = new McpAppsProtocolAdapter();

  assertEquals(adapter.toInternal(null), null);
  assertEquals(adapter.toInternal(undefined), null);
  assertEquals(adapter.toInternal({}), null);
  assertEquals(adapter.toInternal({ jsonrpc: "1.0" }), null);
  assertEquals(adapter.toInternal({ foo: "bar" }), null);
});

Deno.test("McpAppsProtocolAdapter - toInternal() returns null for unknown method", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: 1,
    method: "unknown/method",
    params: {},
  };

  assertEquals(adapter.toInternal(jsonRpc), null);
});

Deno.test("McpAppsProtocolAdapter - toInternal() returns null for tools/call without name", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { arguments: {} }, // Missing name
  };

  assertEquals(adapter.toInternal(jsonRpc), null);
});

// ============================================================================
// toExternal() Tests
// ============================================================================

Deno.test("McpAppsProtocolAdapter - toExternal() converts rpc_response to JSON-RPC result", () => {
  const adapter = new McpAppsProtocolAdapter();

  const internal = {
    type: "rpc_response",
    id: "1",
    result: { rows: [{ id: 1 }] },
  };

  const jsonRpc = adapter.toExternal(internal);

  assertEquals(jsonRpc, {
    jsonrpc: "2.0",
    id: "1",
    result: { rows: [{ id: 1 }] },
  });
});

Deno.test("McpAppsProtocolAdapter - toExternal() converts rpc_error to JSON-RPC error", () => {
  const adapter = new McpAppsProtocolAdapter();

  const internal = {
    type: "rpc_error",
    id: "1",
    error: "Connection refused",
  };

  const jsonRpc = adapter.toExternal(internal);

  assertEquals(jsonRpc, {
    jsonrpc: "2.0",
    id: "1",
    error: {
      code: -32000,
      message: "Connection refused",
    },
  });
});

Deno.test("McpAppsProtocolAdapter - toExternal() converts init_response", () => {
  const adapter = new McpAppsProtocolAdapter();

  const internal = {
    type: "init_response",
    id: "init-1",
    result: { status: "ok" },
  };

  const jsonRpc = adapter.toExternal(internal);

  assertEquals(jsonRpc, {
    jsonrpc: "2.0",
    id: "init-1",
    result: { status: "ok" },
  });
});

Deno.test("McpAppsProtocolAdapter - toExternal() passes through unknown messages", () => {
  const adapter = new McpAppsProtocolAdapter();

  const unknown = { type: "custom", data: 123 };
  const result = adapter.toExternal(unknown);

  assertEquals(result, unknown);
});

Deno.test("McpAppsProtocolAdapter - toExternal() handles rpcId fallback", () => {
  const adapter = new McpAppsProtocolAdapter();

  const internal = {
    type: "rpc_response",
    rpcId: "rpc-42", // Using rpcId instead of id
    result: { value: "test" },
  };

  const jsonRpc = adapter.toExternal(internal);

  assertEquals(jsonRpc, {
    jsonrpc: "2.0",
    id: "rpc-42",
    result: { value: "test" },
  });
});

// ============================================================================
// Bidirectional Round-Trip Tests
// ============================================================================

Deno.test("McpAppsProtocolAdapter - round-trip: tools/call → rpc_response", () => {
  const adapter = new McpAppsProtocolAdapter();

  // Incoming JSON-RPC
  const request = {
    jsonrpc: "2.0",
    id: 42,
    method: "tools/call",
    params: { name: "math:add", arguments: { a: 1, b: 2 } },
  };

  // Convert to internal
  const internal = adapter.toInternal(request);
  assertEquals(internal?.type, "rpc");
  assertEquals((internal as { method: string }).method, "math:add");

  // Simulate response
  const response = {
    type: "rpc_response",
    id: (internal as { rpcId: string }).rpcId,
    result: 3,
  };

  // Convert back to JSON-RPC
  const jsonRpcResponse = adapter.toExternal(response);
  assertEquals(jsonRpcResponse, {
    jsonrpc: "2.0",
    id: "42",
    result: 3,
  });
});
