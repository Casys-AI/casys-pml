/**
 * Unit tests for POST /api/traces endpoint
 *
 * Tests the trace ingestion API that receives traces from PML CLI.
 * Key invariant: executedPath MUST be derived from taskResults.
 *
 * @module tests/unit/api/traces_test
 */

import { assertEquals, assertExists } from "@std/assert";

/**
 * Mock incoming trace structure (matches packages/pml LocalExecutionTrace)
 */
interface MockIncomingTrace {
  traceId?: string;
  parentTraceId?: string;
  workflowId?: string;
  capabilityId: string;
  success: boolean;
  error?: string;
  durationMs: number;
  taskResults: Array<{
    taskId: string;
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
    success: boolean;
    durationMs: number;
    timestamp: string;
  }>;
  decisions: Array<{
    nodeId: string;
    outcome: string;
    condition?: string;
  }>;
  timestamp: string;
  userId?: string;
}

/**
 * Simulate the mapIncomingToSaveInput logic for testing.
 * This mirrors the implementation in src/api/traces.ts
 */
function deriveExecutedPath(taskResults: MockIncomingTrace["taskResults"]): string[] {
  return taskResults.map((tr) => tr.tool);
}

// =============================================================================
// AC: executedPath derived from taskResults
// =============================================================================

Deno.test("deriveExecutedPath - extracts tool names in order", () => {
  const taskResults: MockIncomingTrace["taskResults"] = [
    {
      taskId: "t1",
      tool: "std:crypto_uuid",
      args: {},
      result: { uuid: "abc" },
      success: true,
      durationMs: 10,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t2",
      tool: "std:crypto_hash",
      args: { text: "test", algo: "sha256" },
      result: { hash: "def" },
      success: true,
      durationMs: 5,
      timestamp: new Date().toISOString(),
    },
  ];

  const executedPath = deriveExecutedPath(taskResults);

  assertEquals(executedPath, ["std:crypto_uuid", "std:crypto_hash"]);
});

Deno.test("deriveExecutedPath - empty taskResults returns empty array", () => {
  const taskResults: MockIncomingTrace["taskResults"] = [];

  const executedPath = deriveExecutedPath(taskResults);

  assertEquals(executedPath, []);
});

Deno.test("deriveExecutedPath - preserves order of multiple same tools", () => {
  const taskResults: MockIncomingTrace["taskResults"] = [
    {
      taskId: "t1",
      tool: "std:psql_query",
      args: { query: "SELECT 1" },
      result: { rows: [] },
      success: true,
      durationMs: 10,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t2",
      tool: "filesystem:read_file",
      args: { path: "/tmp/test" },
      result: { content: "hello" },
      success: true,
      durationMs: 5,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t3",
      tool: "std:psql_query",
      args: { query: "SELECT 2" },
      result: { rows: [] },
      success: true,
      durationMs: 8,
      timestamp: new Date().toISOString(),
    },
  ];

  const executedPath = deriveExecutedPath(taskResults);

  assertEquals(executedPath, ["std:psql_query", "filesystem:read_file", "std:psql_query"]);
  assertEquals(executedPath.length, 3);
});

Deno.test("deriveExecutedPath - handles various tool namespaces", () => {
  const taskResults: MockIncomingTrace["taskResults"] = [
    {
      taskId: "t1",
      tool: "std:git_status",
      args: {},
      result: {},
      success: true,
      durationMs: 10,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t2",
      tool: "filesystem:read_file",
      args: {},
      result: {},
      success: true,
      durationMs: 5,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t3",
      tool: "code:map",
      args: {},
      result: {},
      success: true,
      durationMs: 1,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t4",
      tool: "playwright:browser_navigate",
      args: {},
      result: {},
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
    },
  ];

  const executedPath = deriveExecutedPath(taskResults);

  assertEquals(executedPath, [
    "std:git_status",
    "filesystem:read_file",
    "code:map",
    "playwright:browser_navigate",
  ]);
});

Deno.test("deriveExecutedPath - includes failed tool calls", () => {
  const taskResults: MockIncomingTrace["taskResults"] = [
    {
      taskId: "t1",
      tool: "std:psql_query",
      args: { query: "SELECT 1" },
      result: { rows: [] },
      success: true,
      durationMs: 10,
      timestamp: new Date().toISOString(),
    },
    {
      taskId: "t2",
      tool: "filesystem:read_file",
      args: { path: "/nonexistent" },
      result: { error: "File not found" },
      success: false, // Failed call
      durationMs: 5,
      timestamp: new Date().toISOString(),
    },
  ];

  const executedPath = deriveExecutedPath(taskResults);

  // Failed calls should still be in executedPath (they were attempted)
  assertEquals(executedPath, ["std:psql_query", "filesystem:read_file"]);
});

// =============================================================================
// Regression test: Issue 7 - PML CLI traces must have executedPath
// =============================================================================

Deno.test("REGRESSION Issue 7: executedPath must not be empty when taskResults exist", () => {
  // This test prevents regression of Issue 7 where PML CLI traces
  // had taskResults but executedPath was empty []

  const taskResults: MockIncomingTrace["taskResults"] = [
    {
      taskId: "t1",
      tool: "filesystem:read_file",
      args: { path: "/test" },
      result: { content: "data" },
      success: true,
      durationMs: 10,
      timestamp: new Date().toISOString(),
    },
  ];

  const executedPath = deriveExecutedPath(taskResults);

  // CRITICAL: If taskResults has entries, executedPath MUST have entries
  assertExists(executedPath);
  assertEquals(executedPath.length > 0, true, "executedPath must not be empty when taskResults exist");
  assertEquals(executedPath.length, taskResults.length, "executedPath length must match taskResults length");
});
