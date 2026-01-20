/**
 * Tests for Static Structure to DAG Converter (Story 10.5)
 *
 * @module tests/dag/static-to-dag-converter_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  estimateParallelLayers,
  getToolsFromStaticStructure,
  isValidForDagConversion,
  staticStructureToDag,
} from "../../src/dag/static-to-dag-converter.ts";
import type { StaticStructure } from "../../src/capabilities/types.ts";

// =============================================================================
// Test Data Fixtures
// =============================================================================

const simpleSequentialStructure: StaticStructure = {
  nodes: [
    { id: "n1", type: "task", tool: "fs:read_file" },
    { id: "n2", type: "task", tool: "json:parse" },
    { id: "n3", type: "task", tool: "db:insert" },
  ],
  edges: [
    { from: "n1", to: "n2", type: "sequence" },
    { from: "n2", to: "n3", type: "sequence" },
  ],
};

const parallelStructure: StaticStructure = {
  nodes: [
    { id: "f1", type: "fork" },
    { id: "n1", type: "task", tool: "api:fetch_users" },
    { id: "n2", type: "task", tool: "api:fetch_posts" },
    { id: "n3", type: "task", tool: "api:fetch_comments" },
    { id: "j1", type: "join" },
  ],
  edges: [
    { from: "f1", to: "n1", type: "sequence" },
    { from: "f1", to: "n2", type: "sequence" },
    { from: "f1", to: "n3", type: "sequence" },
    { from: "n1", to: "j1", type: "sequence" },
    { from: "n2", to: "j1", type: "sequence" },
    { from: "n3", to: "j1", type: "sequence" },
  ],
};

const conditionalStructure: StaticStructure = {
  nodes: [
    { id: "n1", type: "task", tool: "api:get_user" },
    { id: "d1", type: "decision", condition: "user.isAdmin" },
    { id: "n2", type: "task", tool: "admin:dashboard" },
    { id: "n3", type: "task", tool: "user:profile" },
  ],
  edges: [
    { from: "n1", to: "d1", type: "sequence" },
    { from: "d1", to: "n2", type: "conditional", outcome: "true" },
    { from: "d1", to: "n3", type: "conditional", outcome: "false" },
  ],
};

const capabilityStructure: StaticStructure = {
  nodes: [
    { id: "n1", type: "task", tool: "fs:read_file" },
    { id: "c1", type: "capability", capabilityId: "parse-json-safely" },
    { id: "n2", type: "task", tool: "db:insert" },
  ],
  edges: [
    { from: "n1", to: "c1", type: "provides" },
    { from: "c1", to: "n2", type: "sequence" },
  ],
};

const emptyStructure: StaticStructure = {
  nodes: [],
  edges: [],
};

const forkJoinOnlyStructure: StaticStructure = {
  nodes: [
    { id: "f1", type: "fork" },
    { id: "j1", type: "join" },
  ],
  edges: [{ from: "f1", to: "j1", type: "sequence" }],
};

// =============================================================================
// AC1: staticStructureToDag Conversion Tests
// =============================================================================

Deno.test("staticStructureToDag - converts simple sequential structure", () => {
  const dag = staticStructureToDag(simpleSequentialStructure);

  assertEquals(dag.tasks.length, 3);
  assertEquals(dag.tasks[0].tool, "fs:read_file");
  assertEquals(dag.tasks[1].tool, "json:parse");
  assertEquals(dag.tasks[2].tool, "db:insert");

  // Check dependencies
  assertEquals(dag.tasks[0].dependsOn, []);
  assertEquals(dag.tasks[1].dependsOn, ["task_n1"]);
  assertEquals(dag.tasks[2].dependsOn, ["task_n2"]);
});

Deno.test("staticStructureToDag - converts parallel fork/join structure", () => {
  const dag = staticStructureToDag(parallelStructure);

  // Fork and join are not tasks, only the 3 actual tasks
  assertEquals(dag.tasks.length, 3);

  const tools = dag.tasks.map((t) => t.tool);
  assertEquals(tools.includes("api:fetch_users"), true);
  assertEquals(tools.includes("api:fetch_posts"), true);
  assertEquals(tools.includes("api:fetch_comments"), true);
});

Deno.test("staticStructureToDag - converts capability nodes", () => {
  const dag = staticStructureToDag(capabilityStructure);

  assertEquals(dag.tasks.length, 3);

  const capabilityTask = dag.tasks.find((t) => t.type === "capability");
  assertExists(capabilityTask);
  assertEquals(capabilityTask.capabilityId, "parse-json-safely");
});

Deno.test("staticStructureToDag - handles conditional branches (AC4)", () => {
  const dag = staticStructureToDag(conditionalStructure);

  // Decision node is not a task by default
  assertEquals(dag.tasks.length, 3);

  // Find tasks with conditions
  const adminTask = dag.tasks.find((t) => t.tool === "admin:dashboard");
  const userTask = dag.tasks.find((t) => t.tool === "user:profile");

  assertExists(adminTask);
  assertExists(userTask);

  // Both should have conditions
  assertExists(adminTask.condition);
  assertEquals(adminTask.condition?.requiredOutcome, "true");

  assertExists(userTask.condition);
  assertEquals(userTask.condition?.requiredOutcome, "false");
});

Deno.test("staticStructureToDag - respects taskIdPrefix option", () => {
  const dag = staticStructureToDag(simpleSequentialStructure, {
    taskIdPrefix: "exec_",
  });

  assertEquals(dag.tasks[0].id, "exec_n1");
  assertEquals(dag.tasks[1].id, "exec_n2");
  assertEquals(dag.tasks[1].dependsOn, ["exec_n1"]);
});

Deno.test("staticStructureToDag - can include decision tasks", () => {
  const dag = staticStructureToDag(conditionalStructure, {
    includeDecisionTasks: true,
  });

  // Now includes decision node as a task
  const decisionTask = dag.tasks.find((t) => t.tool === "internal:decision");
  assertExists(decisionTask);
});

// =============================================================================
// AC6: isValidForDagConversion Tests
// =============================================================================

Deno.test("isValidForDagConversion - returns true for valid structure", () => {
  assertEquals(isValidForDagConversion(simpleSequentialStructure), true);
  assertEquals(isValidForDagConversion(parallelStructure), true);
  assertEquals(isValidForDagConversion(capabilityStructure), true);
});

Deno.test("isValidForDagConversion - returns false for empty structure", () => {
  assertEquals(isValidForDagConversion(emptyStructure), false);
});

Deno.test("isValidForDagConversion - returns false for structure with only fork/join", () => {
  assertEquals(isValidForDagConversion(forkJoinOnlyStructure), false);
});

// =============================================================================
// Utility Function Tests
// =============================================================================

Deno.test("getToolsFromStaticStructure - extracts tool IDs", () => {
  const tools = getToolsFromStaticStructure(simpleSequentialStructure);

  assertEquals(tools.length, 3);
  assertEquals(tools, ["fs:read_file", "json:parse", "db:insert"]);
});

Deno.test("estimateParallelLayers - sequential structure", () => {
  const layers = estimateParallelLayers(simpleSequentialStructure);
  assertEquals(layers, 3); // 3 tasks = 3 layers in sequential
});

Deno.test("estimateParallelLayers - parallel structure", () => {
  const layers = estimateParallelLayers(parallelStructure);
  // Layer 1: 3 parallel tasks (n1, n2, n3) after fork
  // Layer 2: join point (j1) waits for all parallel tasks
  // Fork/join nodes don't add layers, they structure parallelism
  assertEquals(layers, 2);
});

// =============================================================================
// Story 10.2c Fix: Non-executable nodes in logical DAG for SHGAT learning
// Non-executable nodes are KEPT in the DAG (for trace-generator to include in
// executedPath for SHGAT). They are filtered during physical execution, not here.
// =============================================================================

Deno.test("staticStructureToDag - Story 10.2c fix: includes non-executable nodes in logical DAG", () => {
  // Simulate a method chain structure where intermediate nodes are non-executable
  const chainStructure: StaticStructure = {
    nodes: [
      // filter is non-executable (intermediate in chain)
      {
        id: "n1",
        type: "task",
        tool: "code:filter",
        code: "filter(n => n > 3)",
        metadata: { executable: false, nestingLevel: 0 },
      } as StaticStructure["nodes"][0],
      // map is non-executable (intermediate in chain)
      {
        id: "n2",
        type: "task",
        tool: "code:map",
        code: "map(n => n * 2)",
        metadata: { executable: false, nestingLevel: 0 },
      } as StaticStructure["nodes"][0],
      // sort is executable (final in chain) - has full code
      {
        id: "n3",
        type: "task",
        tool: "code:sort",
        code: "numbers.filter(n => n > 3).map(n => n * 2).sort()",
        metadata: { executable: true, nestingLevel: 0 },
      } as StaticStructure["nodes"][0],
    ],
    edges: [
      { from: "n1", to: "n2", type: "sequence" },
      { from: "n2", to: "n3", type: "sequence" },
    ],
  };

  const dag = staticStructureToDag(chainStructure);

  // All 3 tasks should be in the DAG (logical DAG includes non-executables for SHGAT)
  assertEquals(dag.tasks.length, 3, "Should create all 3 tasks in logical DAG");

  // Non-executable tasks should have metadata.executable = false
  const filterTask = dag.tasks.find((t) => t.tool === "code:filter");
  const mapTask = dag.tasks.find((t) => t.tool === "code:map");
  const sortTask = dag.tasks.find((t) => t.tool === "code:sort");

  assertEquals(filterTask?.metadata?.executable, false, "filter should be non-executable");
  assertEquals(mapTask?.metadata?.executable, false, "map should be non-executable");
  assertEquals(sortTask?.metadata?.executable, true, "sort should be executable");
});

Deno.test("staticStructureToDag - Story 10.2c fix: preserves executable metadata", () => {
  // Regular MCP tools should still work (they're always executable)
  const mixedStructure: StaticStructure = {
    nodes: [
      // MCP tool (always executable)
      {
        id: "n1",
        type: "task",
        tool: "fs:read_file",
        metadata: { executable: true },
      } as StaticStructure["nodes"][0],
      // Non-executable code operation
      {
        id: "n2",
        type: "task",
        tool: "code:filter",
        metadata: { executable: false },
      } as StaticStructure["nodes"][0],
      // Executable code operation
      {
        id: "n3",
        type: "task",
        tool: "code:map",
        metadata: { executable: true },
      } as StaticStructure["nodes"][0],
    ],
    edges: [
      { from: "n1", to: "n2", type: "sequence" },
      { from: "n2", to: "n3", type: "sequence" },
    ],
  };

  const dag = staticStructureToDag(mixedStructure);

  // All 3 tasks should be in the DAG (for SHGAT learning via trace-generator)
  assertEquals(dag.tasks.length, 3, "Should have all 3 tasks in logical DAG");

  const taskTools = dag.tasks.map((t) => t.tool);
  assertEquals(taskTools.includes("fs:read_file"), true, "Should include MCP tool");
  assertEquals(taskTools.includes("code:filter"), true, "Should include non-executable code op");
  assertEquals(taskTools.includes("code:map"), true, "Should include executable code op");

  // Verify executable metadata is preserved
  const filterTask = dag.tasks.find((t) => t.tool === "code:filter");
  assertEquals(
    filterTask?.metadata?.executable,
    false,
    "Non-executable task should have executable=false",
  );
});
