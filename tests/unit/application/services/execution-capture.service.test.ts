/**
 * Tests for ExecutionCaptureService fusion enrichment logic
 *
 * Covers:
 * - getFusionMetadata() integration with ExecutionCaptureService
 * - Fusion detection scenarios
 */

import { assertEquals, assertExists } from "@std/assert";
import type { DAGStructure } from "../../../../src/graphrag/types.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

interface MockOptimizedDAG {
  tasks: Array<{ id: string; tool: string; type: string; dependsOn: string[] }>;
  logicalToPhysical: Map<string, string>;
  physicalToLogical: Map<string, string[]>;
  logicalDAG: DAGStructure;
}

function createMockOptimizedDAG(
  tasks: Array<{ id: string; tool: string }>,
  physicalToLogicalMap: Map<string, string[]>,
  logicalTasks: Array<{ id: string; tool: string }>,
): MockOptimizedDAG {
  const logicalDAG: DAGStructure = {
    tasks: logicalTasks.map((t) => ({
      id: t.id,
      tool: t.tool,
      type: "code_execution" as const,
      dependsOn: [],
      arguments: {},
    })),
  };

  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      tool: t.tool,
      type: "mcp_tool",
      dependsOn: [],
    })),
    logicalToPhysical: new Map(),
    physicalToLogical: physicalToLogicalMap,
    logicalDAG,
  };
}

// ============================================================================
// Tests for getFusionMetadata (used by ExecutionCaptureService)
// ============================================================================

Deno.test("getFusionMetadata - single MCP task without fusion returns isFused: false", async () => {
  const { getFusionMetadata } = await import(
    "../../../../src/dag/trace-generator.ts"
  );

  const optimizedDAG = createMockOptimizedDAG(
    [{ id: "task_1", tool: "filesystem:read_file" }],
    new Map([["task_1", ["l1"]]]), // Single logical task = not fused
    [{ id: "l1", tool: "filesystem:read_file" }],
  );

  const fusionMeta = getFusionMetadata("task_1", 100, optimizedDAG as any);

  assertEquals(fusionMeta.isFused, false);
  assertEquals(fusionMeta.logicalOperations, undefined);
});

Deno.test("getFusionMetadata - fused code chain returns isFused: true with operations", async () => {
  const { getFusionMetadata } = await import(
    "../../../../src/dag/trace-generator.ts"
  );

  const optimizedDAG = createMockOptimizedDAG(
    [{ id: "fused_task", tool: "code:join" }], // Physical task is the final join
    new Map([["fused_task", ["l1", "l2", "l3", "l4"]]]), // 4 logical ops fused
    [
      { id: "l1", tool: "code:split" },
      { id: "l2", tool: "code:filter" },
      { id: "l3", tool: "code:map" },
      { id: "l4", tool: "code:join" },
    ],
  );

  const fusionMeta = getFusionMetadata("fused_task", 400, optimizedDAG as any);

  assertEquals(fusionMeta.isFused, true);
  assertExists(fusionMeta.logicalOperations);
  assertEquals(fusionMeta.logicalOperations?.length, 4);
  assertEquals(fusionMeta.logicalOperations?.map((op) => op.toolId), [
    "code:split",
    "code:filter",
    "code:map",
    "code:join",
  ]);
});

Deno.test("getFusionMetadata - mixed MCP and fused correctly identifies each", async () => {
  const { getFusionMetadata } = await import(
    "../../../../src/dag/trace-generator.ts"
  );

  const optimizedDAG = createMockOptimizedDAG(
    [
      { id: "mcp_task", tool: "filesystem:read_file" },
      { id: "fused_task", tool: "code:join" },
    ],
    new Map([
      ["mcp_task", ["l1"]], // Single logical = not fused
      ["fused_task", ["l2", "l3"]], // Multiple = fused
    ]),
    [
      { id: "l1", tool: "filesystem:read_file" },
      { id: "l2", tool: "code:filter" },
      { id: "l3", tool: "code:join" },
    ],
  );

  // MCP task should not be fused
  const mcpMeta = getFusionMetadata("mcp_task", 100, optimizedDAG as any);
  assertEquals(mcpMeta.isFused, false);

  // Fused task should be fused
  const fusedMeta = getFusionMetadata("fused_task", 200, optimizedDAG as any);
  assertEquals(fusedMeta.isFused, true);
  assertEquals(fusedMeta.logicalOperations?.length, 2);
});

Deno.test("getFusionMetadata - duplicate tools with different fusion states", async () => {
  const { getFusionMetadata } = await import(
    "../../../../src/dag/trace-generator.ts"
  );

  const optimizedDAG = createMockOptimizedDAG(
    [
      { id: "read_1", tool: "filesystem:read_file" },
      { id: "read_2", tool: "filesystem:read_file" },
    ],
    new Map([
      ["read_1", ["l1"]], // First read - not fused
      ["read_2", ["l2", "l3"]], // Second read - fused with processing
    ]),
    [
      { id: "l1", tool: "filesystem:read_file" },
      { id: "l2", tool: "filesystem:read_file" },
      { id: "l3", tool: "code:filter" },
    ],
  );

  // First task with same tool - not fused
  const meta1 = getFusionMetadata("read_1", 100, optimizedDAG as any);
  assertEquals(meta1.isFused, false);

  // Second task with same tool - fused
  const meta2 = getFusionMetadata("read_2", 200, optimizedDAG as any);
  assertEquals(meta2.isFused, true);
  assertEquals(meta2.logicalOperations?.length, 2);
});

Deno.test("getFusionMetadata - unknown task ID returns isFused: false gracefully", async () => {
  const { getFusionMetadata } = await import(
    "../../../../src/dag/trace-generator.ts"
  );

  const optimizedDAG = createMockOptimizedDAG(
    [{ id: "task_1", tool: "filesystem:read_file" }],
    new Map([["task_1", ["l1"]]]),
    [{ id: "l1", tool: "filesystem:read_file" }],
  );

  // Unknown task ID should return not fused, not crash
  const fusionMeta = getFusionMetadata("unknown_task", 100, optimizedDAG as any);
  assertEquals(fusionMeta.isFused, false);
  assertEquals(fusionMeta.logicalOperations, undefined);
});
