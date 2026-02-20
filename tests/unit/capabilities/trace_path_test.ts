/**
 * Tests for trace-path.ts — consolidated trace path extraction
 *
 * Covers:
 * - getCleanToolPath: taskResults primary, executedPath fallback
 * - cleanToolIds: raw string[] normalize + filter
 */

import { assertEquals } from "@std/assert";
import { getCleanToolPath, cleanToolIds } from "../../../src/capabilities/trace-path.ts";

// ============================================================================
// getCleanToolPath
// ============================================================================

Deno.test("getCleanToolPath: prefers taskResults over executedPath", () => {
  const trace = {
    executedPath: ["old:tool1", "old:tool2"],
    taskResults: [
      { taskId: "t1", tool: "std:psql_query", args: {}, result: null, success: true, durationMs: 10, layerIndex: 0 },
      { taskId: "t2", tool: "filesystem:read_file", args: {}, result: null, success: true, durationMs: 20, layerIndex: 1 },
    ],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("getCleanToolPath: normalizes FQDN from taskResults", () => {
  const trace = {
    executedPath: [],
    taskResults: [
      { taskId: "t1", tool: "pml.mcp.std.psql_query.db48", args: {}, result: null, success: true, durationMs: 10, layerIndex: 0 },
    ],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query"]);
});

Deno.test("getCleanToolPath: filters internal operations (code:map, loop:forOf)", () => {
  const trace = {
    executedPath: [],
    taskResults: [
      { taskId: "t1", tool: "std:psql_query", args: {}, result: null, success: true, durationMs: 10, layerIndex: 0 },
      { taskId: "t2", tool: "code:map", args: {}, result: null, success: true, durationMs: 5, layerIndex: 1 },
      { taskId: "t3", tool: "loop:forOf", args: {}, result: null, success: true, durationMs: 5, layerIndex: 2 },
      { taskId: "t4", tool: "filesystem:write_file", args: {}, result: null, success: true, durationMs: 15, layerIndex: 3 },
    ],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query", "filesystem:write_file"]);
});

Deno.test("getCleanToolPath: falls back to executedPath when taskResults empty", () => {
  const trace = {
    executedPath: ["std:psql_query", "filesystem:read_file"],
    taskResults: [],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("getCleanToolPath: falls back to executedPath when taskResults undefined", () => {
  const trace = {
    executedPath: ["std:psql_query"],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query"]);
});

Deno.test("getCleanToolPath: handles empty trace (no taskResults, no executedPath)", () => {
  const trace = {
    executedPath: undefined,
    taskResults: undefined,
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, []);
});

Deno.test("getCleanToolPath: handles empty arrays", () => {
  const trace = {
    executedPath: [],
    taskResults: [],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, []);
});

Deno.test("getCleanToolPath: resolves $cap:uuid via resolvedTool", () => {
  const trace = {
    executedPath: [],
    taskResults: [
      {
        taskId: "t1",
        tool: "$cap:8fb1a0ec-de91-4a89-ba64-f2f1f2c14fdb",
        resolvedTool: "fake:person",
        args: {},
        result: null,
        success: true,
        durationMs: 10,
        layerIndex: 0,
      },
      { taskId: "t2", tool: "std:psql_query", args: {}, result: null, success: true, durationMs: 20, layerIndex: 1 },
    ],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["fake:person", "std:psql_query"]);
});

Deno.test("getCleanToolPath: filters UUIDs from executedPath fallback", () => {
  const trace = {
    executedPath: [
      "8fb1a0ec-de91-4a89-ba64-f2f1f2c14fdb",
      "std:psql_query",
      "01942abc-def0-7000-8000-000000000000",
      "filesystem:read_file",
    ],
    taskResults: [],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("getCleanToolPath: sorts taskResults by layerIndex", () => {
  const trace = {
    executedPath: [],
    taskResults: [
      { taskId: "t2", tool: "filesystem:write_file", args: {}, result: null, success: true, durationMs: 20, layerIndex: 2 },
      { taskId: "t1", tool: "std:psql_query", args: {}, result: null, success: true, durationMs: 10, layerIndex: 0 },
      { taskId: "t3", tool: "github:create_issue", args: {}, result: null, success: true, durationMs: 15, layerIndex: 1 },
    ],
  };
  const result = getCleanToolPath(trace);
  assertEquals(result, ["std:psql_query", "github:create_issue", "filesystem:write_file"]);
});

// ============================================================================
// cleanToolIds
// ============================================================================

Deno.test("cleanToolIds: normalizes and filters a raw string array", () => {
  const ids = [
    "pml.mcp.std.psql_query.db48",
    "8fb1a0ec-de91-4a89-ba64-f2f1f2c14fdb",
    "code:filter",
    "loop:forOf",
    "filesystem:read_file",
  ];
  const result = cleanToolIds(ids);
  assertEquals(result, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("cleanToolIds: null → empty array", () => {
  assertEquals(cleanToolIds(null), []);
});

Deno.test("cleanToolIds: undefined → empty array", () => {
  assertEquals(cleanToolIds(undefined), []);
});

Deno.test("cleanToolIds: empty array → empty array", () => {
  assertEquals(cleanToolIds([]), []);
});

Deno.test("cleanToolIds: keeps code:exec_* (capabilities, not internal ops)", () => {
  const ids = ["code:exec_something", "code:filter", "std:psql_query"];
  const result = cleanToolIds(ids);
  assertEquals(result, ["code:exec_something", "std:psql_query"]);
});

Deno.test("cleanToolIds: UUID-v7 also filtered", () => {
  const ids = [
    "019b3e2a-1c4f-7000-8000-000000000001",
    "std:psql_query",
  ];
  const result = cleanToolIds(ids);
  assertEquals(result, ["std:psql_query"]);
});
