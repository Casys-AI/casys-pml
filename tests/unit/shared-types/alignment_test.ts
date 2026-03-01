/**
 * Shared Types Alignment Tests
 *
 * TDD contract tests — written BEFORE migration to verify structural correctness.
 * These tests serve as:
 * 1. Safety net during migration
 * 2. CI guard after migration
 *
 * @module tests/unit/shared-types/alignment_test
 */

import { assertEquals, assertExists } from "@std/assert";
import type {
  ApprovalType,
  BaseExecutionTrace,
  BranchDecision,
  DAGTask,
  FetchedUiHtml,
  JsonValue,
  McpToolInfo,
  RoutingConfig,
  ToolRouting,
  ToolUiMeta,
  TraceTaskResult,
} from "@casys/pml-types";
import type { LocalExecutionTrace } from "../../../packages/pml/src/tracing/types.ts";

// ============================================================================
// Test 1: BaseExecutionTrace — JSON round-trip from real HTTP payload
// ============================================================================

Deno.test("BaseExecutionTrace is assignable from JSON HTTP payload", () => {
  // Simulate a real trace payload as received from PML client
  const json = JSON.parse(JSON.stringify({
    traceId: "01936abc-1234-7000-8000-000000000001",
    parentTraceId: "01936abc-1234-7000-8000-000000000000",
    capabilityId: "local.default.fs.read_file.a7f3",
    success: true,
    errorMessage: undefined,
    durationMs: 142,
    taskResults: [
      {
        taskId: "t1",
        tool: "filesystem:read_file",
        args: { path: "/tmp/test.txt" },
        result: "hello world",
        success: true,
        durationMs: 89,
        timestamp: "2026-02-28T12:00:00.000Z",
        layerIndex: 0,
      },
    ],
    decisions: [],
    timestamp: "2026-02-28T12:00:00.000Z",
    userId: "user-123",
  }));

  // This assignment validates structural compatibility
  const trace: BaseExecutionTrace = json;
  assertEquals(trace.traceId, "01936abc-1234-7000-8000-000000000001");
  assertEquals(trace.success, true);
  assertEquals(trace.taskResults.length, 1);
  assertEquals(trace.taskResults[0].tool, "filesystem:read_file");
  assertEquals(trace.timestamp, "2026-02-28T12:00:00.000Z");
});

// ============================================================================
// Test 2: JSON round-trip serialization
// ============================================================================

Deno.test("BaseExecutionTrace round-trip JSON serialization", () => {
  const original: BaseExecutionTrace = {
    traceId: "test-id",
    success: true,
    durationMs: 100,
    taskResults: [
      {
        taskId: "t1",
        tool: "std:echo",
        args: { msg: "hi" },
        result: "hi",
        success: true,
        durationMs: 5,
        timestamp: "2026-01-01T00:00:00Z",
      },
    ],
    decisions: [{ nodeId: "d1", outcome: "true" }],
    timestamp: "2026-01-01T00:00:00Z",
  };

  const serialized = JSON.stringify(original);
  const deserialized: BaseExecutionTrace = JSON.parse(serialized);

  assertEquals(deserialized.traceId, original.traceId);
  assertEquals(deserialized.taskResults.length, 1);
  assertEquals(deserialized.decisions[0].outcome, "true");
});

// ============================================================================
// Test 3: TraceTaskResult — base fields are present
// ============================================================================

Deno.test("TraceTaskResult has all 8 base fields", () => {
  const result: TraceTaskResult = {
    taskId: "t1",
    tool: "std:echo",
    args: { key: "value" },
    result: null,
    success: true,
    durationMs: 10,
    timestamp: "2026-01-01T00:00:00Z",
  };

  assertExists(result.taskId);
  assertExists(result.tool);
  assertExists(result.args);
  assertEquals(result.success, true);
  assertEquals(result.durationMs, 10);
  assertExists(result.timestamp);
  // layerIndex is optional
  assertEquals(result.layerIndex, undefined);
});

// ============================================================================
// Test 4: BranchDecision structural check
// ============================================================================

Deno.test("BranchDecision is structurally correct", () => {
  const decision: BranchDecision = {
    nodeId: "d1",
    outcome: "true",
    condition: "x > 5",
  };

  assertEquals(decision.nodeId, "d1");
  assertEquals(decision.outcome, "true");
  assertEquals(decision.condition, "x > 5");
});

// ============================================================================
// Test 5: ToolUiMeta structural check
// ============================================================================

Deno.test("ToolUiMeta is structurally correct", () => {
  const meta: ToolUiMeta = {
    resourceUri: "ui://std/table-viewer",
    visibility: ["model", "app"],
    emits: ["filter"],
    accepts: ["update"],
  };

  assertEquals(meta.resourceUri, "ui://std/table-viewer");
  assertEquals(meta.visibility?.length, 2);
});

// ============================================================================
// Test 6: FetchedUiHtml — mimeType is required (not optional)
// ============================================================================

Deno.test("FetchedUiHtml has required mimeType", () => {
  const html: FetchedUiHtml = {
    resourceUri: "ui://std/table-viewer",
    content: "<div>test</div>",
    mimeType: "text/html",
  };

  assertEquals(html.mimeType, "text/html");
});

// ============================================================================
// Test 7: McpToolInfo structural check
// ============================================================================

Deno.test("McpToolInfo is structurally correct", () => {
  const tool: McpToolInfo = {
    name: "read_file",
    description: "Read a file",
    inputSchema: { type: "object", properties: {} },
    uiMeta: { resourceUri: "ui://fs/viewer" },
  };

  assertEquals(tool.name, "read_file");
  assertExists(tool.uiMeta);
});

// ============================================================================
// Test 8: ToolRouting union type
// ============================================================================

Deno.test("ToolRouting accepts valid values", () => {
  const client: ToolRouting = "client";
  const server: ToolRouting = "server";

  assertEquals(client, "client");
  assertEquals(server, "server");
});

// ============================================================================
// Test 9: RoutingConfig structural check
// ============================================================================

Deno.test("RoutingConfig is structurally correct", () => {
  const config: RoutingConfig = {
    version: "1.0",
    clientTools: ["filesystem", "shell"],
    serverTools: ["tavily"],
    defaultRouting: "client",
  };

  assertEquals(config.version, "1.0");
  assertEquals(config.clientTools.length, 2);
  assertEquals(config.defaultRouting, "client");
});

// ============================================================================
// Test 10: DAGTask structural check
// ============================================================================

Deno.test("DAGTask is structurally correct", () => {
  const task: DAGTask = {
    id: "t1",
    tool: "std:echo",
    arguments: { msg: "hi" },
    dependsOn: [],
    layerIndex: 0,
  };

  assertEquals(task.id, "t1");
  assertEquals(task.dependsOn.length, 0);
  assertEquals(task.layerIndex, 0);
});

// ============================================================================
// Test 11: ApprovalType union type
// ============================================================================

Deno.test("ApprovalType accepts all valid values", () => {
  const types: ApprovalType[] = [
    "tool_permission",
    "dependency",
    "api_key_required",
    "integrity",
    "oauth_connect",
  ];

  assertEquals(types.length, 5);
});

// ============================================================================
// Test 12: JsonValue recursive type
// ============================================================================

Deno.test("JsonValue handles nested structures", () => {
  const value: JsonValue = {
    string: "hello",
    number: 42,
    boolean: true,
    null_val: null,
    array: [1, "two", null],
    nested: { deep: { value: true } },
  };

  assertEquals(typeof value, "object");
});

Deno.test("LocalExecutionTrace extends BaseExecutionTrace with workflowId", () => {
  // LocalExecutionTrace must accept all BaseExecutionTrace fields + workflowId
  const trace: LocalExecutionTrace = {
    traceId: "trace-001",
    capabilityId: "test:cap",
    success: true,
    durationMs: 100,
    taskResults: [],
    decisions: [],
    timestamp: new Date().toISOString(),
    workflowId: "wf-001",
  };

  // Assignable to BaseExecutionTrace (drops workflowId)
  const base: BaseExecutionTrace = trace;
  assertEquals(base.traceId, "trace-001");
  assertEquals(base.success, true);

  // workflowId is the PML-specific extension
  assertEquals(trace.workflowId, "wf-001");
});
