/**
 * Tests for trace-generator.ts
 *
 * Covers:
 * - getFusionMetadata() - fusion detection and metadata generation
 * - isFusedTask() - basic fusion detection
 * - getLogicalTasks() - logical task retrieval
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  getFusionMetadata,
  isFusedTask,
  getLogicalTasks,
} from "../../../src/dag/trace-generator.ts";
import type { OptimizedDAGStructure } from "../../../src/dag/dag-optimizer.ts";
import type { Task } from "../../../src/graphrag/types.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockOptimizedDAG(
  physicalToLogicalMap: Map<string, string[]>,
  logicalTasks: Array<{ id: string; tool: string }> = [],
): OptimizedDAGStructure {
  return {
    tasks: [],
    logicalToPhysical: new Map(),
    physicalToLogical: physicalToLogicalMap,
    logicalDAG: {
      tasks: logicalTasks.map((t) => ({
        id: t.id,
        tool: t.tool,
        type: "code_execution" as const,
        dependsOn: [],
        arguments: {},
      })) as Task[],
    },
  };
}

// ============================================================================
// getFusionMetadata() Tests
// ============================================================================

Deno.test("getFusionMetadata - single logical task returns isFused: false", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["logical_1"]]]),
    [{ id: "logical_1", tool: "filesystem:read_file" }],
  );

  const result = getFusionMetadata("task_1", 100, dag);

  assertEquals(result.isFused, false);
  assertEquals(result.logicalOperations, undefined);
});

Deno.test("getFusionMetadata - multiple logical tasks returns isFused: true with operations", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1", "l2", "l3"]]]),
    [
      { id: "l1", tool: "code:split" },
      { id: "l2", tool: "code:filter" },
      { id: "l3", tool: "code:map" },
    ],
  );

  const result = getFusionMetadata("task_1", 300, dag);

  assertEquals(result.isFused, true);
  assertExists(result.logicalOperations);
  assertEquals(result.logicalOperations?.length, 3);
  assertEquals(result.logicalOperations?.[0].toolId, "code:split");
  assertEquals(result.logicalOperations?.[1].toolId, "code:filter");
  assertEquals(result.logicalOperations?.[2].toolId, "code:map");
});

Deno.test("getFusionMetadata - duration is split evenly among logical operations", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1", "l2", "l3"]]]),
    [
      { id: "l1", tool: "code:split" },
      { id: "l2", tool: "code:filter" },
      { id: "l3", tool: "code:map" },
    ],
  );

  const result = getFusionMetadata("task_1", 300, dag);

  // 300ms / 3 operations = 100ms each
  assertEquals(result.logicalOperations?.[0].durationMs, 100);
  assertEquals(result.logicalOperations?.[1].durationMs, 100);
  assertEquals(result.logicalOperations?.[2].durationMs, 100);
});

Deno.test("getFusionMetadata - unknown task ID returns isFused: false", () => {
  const dag = createMockOptimizedDAG(new Map(), []);

  const result = getFusionMetadata("unknown_task", 100, dag);

  assertEquals(result.isFused, false);
  assertEquals(result.logicalOperations, undefined);
});

Deno.test("getFusionMetadata - missing logical task uses 'unknown' as toolId", () => {
  // physicalToLogical references logical tasks that don't exist in logicalDAG
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["missing_l1", "missing_l2"]]]),
    [], // No logical tasks defined
  );

  const result = getFusionMetadata("task_1", 200, dag);

  assertEquals(result.isFused, true);
  assertExists(result.logicalOperations);
  assertEquals(result.logicalOperations?.length, 2);
  assertEquals(result.logicalOperations?.[0].toolId, "unknown");
  assertEquals(result.logicalOperations?.[1].toolId, "unknown");
});

Deno.test("getFusionMetadata - four logical operations (split → filter → map → join)", () => {
  const dag = createMockOptimizedDAG(
    new Map([["fused_task", ["l1", "l2", "l3", "l4"]]]),
    [
      { id: "l1", tool: "code:split" },
      { id: "l2", tool: "code:filter" },
      { id: "l3", tool: "code:map" },
      { id: "l4", tool: "code:join" },
    ],
  );

  const result = getFusionMetadata("fused_task", 400, dag);

  assertEquals(result.isFused, true);
  assertEquals(result.logicalOperations?.length, 4);
  assertEquals(result.logicalOperations?.map((op) => op.toolId), [
    "code:split",
    "code:filter",
    "code:map",
    "code:join",
  ]);
  // 400ms / 4 = 100ms each
  result.logicalOperations?.forEach((op) => {
    assertEquals(op.durationMs, 100);
  });
});

Deno.test("getFusionMetadata - handles zero duration gracefully", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1", "l2"]]]),
    [
      { id: "l1", tool: "code:filter" },
      { id: "l2", tool: "code:map" },
    ],
  );

  // Zero duration should not cause division by zero or NaN
  const result = getFusionMetadata("task_1", 0, dag);

  assertEquals(result.isFused, true);
  assertEquals(result.logicalOperations?.length, 2);
  // 0ms / 2 operations = 0ms each (not NaN or undefined)
  assertEquals(result.logicalOperations?.[0].durationMs, 0);
  assertEquals(result.logicalOperations?.[1].durationMs, 0);
});

Deno.test("getFusionMetadata - handles negative duration defensively", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1", "l2"]]]),
    [
      { id: "l1", tool: "code:filter" },
      { id: "l2", tool: "code:map" },
    ],
  );

  // Negative duration should be treated as 0 (defensive)
  const result = getFusionMetadata("task_1", -100, dag);

  assertEquals(result.isFused, true);
  assertEquals(result.logicalOperations?.length, 2);
  // Negative treated as 0: 0ms / 2 = 0ms each
  assertEquals(result.logicalOperations?.[0].durationMs, 0);
  assertEquals(result.logicalOperations?.[1].durationMs, 0);
});

// ============================================================================
// isFusedTask() Tests
// ============================================================================

Deno.test("isFusedTask - returns true for fused task", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1", "l2"]]]),
  );

  assertEquals(isFusedTask("task_1", dag), true);
});

Deno.test("isFusedTask - returns false for single logical task", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1"]]]),
  );

  assertEquals(isFusedTask("task_1", dag), false);
});

Deno.test("isFusedTask - returns false for unknown task", () => {
  const dag = createMockOptimizedDAG(new Map());

  assertEquals(isFusedTask("unknown", dag), false);
});

// ============================================================================
// getLogicalTasks() Tests
// ============================================================================

Deno.test("getLogicalTasks - returns logical task IDs", () => {
  const dag = createMockOptimizedDAG(
    new Map([["task_1", ["l1", "l2", "l3"]]]),
  );

  assertEquals(getLogicalTasks("task_1", dag), ["l1", "l2", "l3"]);
});

Deno.test("getLogicalTasks - returns empty array for unknown task", () => {
  const dag = createMockOptimizedDAG(new Map());

  assertEquals(getLogicalTasks("unknown", dag), []);
});
