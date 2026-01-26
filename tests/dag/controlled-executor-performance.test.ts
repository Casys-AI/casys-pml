/**
 * Integration Tests: Controlled Executor - Performance & Concurrency
 *
 * Tests for parallel execution behavior and layer dependency enforcement.
 * Verifies tasks execute concurrently within layers.
 *
 * @module tests/dag/controlled-executor-performance.test
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import {
  createMockToolExecutor,
  createExecutorWithWorkerBridge,
  collectEvents,
} from "./test-utils/controlled-executor-helpers.ts";
import { createParallelDAG, createTask } from "../factories/index.ts";

// ============================================================================
// Test Suite: Performance and Concurrency
// ============================================================================

Deno.test("Performance: Performance and concurrency", async (t) => {
  await t.step("Parallel tasks execute concurrently", async () => {
    const mockToolExecutor = createMockToolExecutor({ delay: 50 });
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);

    const dag = createParallelDAG(4);

    const startTime = performance.now();
    const events = await collectEvents(executor, dag);
    const endTime = performance.now();

    const totalTime = endTime - startTime;

    // Sequential would take ~200ms (4 * 50ms)
    // Parallel should take ~50-100ms (with overhead)
    assert(
      totalTime < 150,
      `Execution took ${totalTime}ms, expected < 150ms for parallel execution`,
    );

    const workflowComplete = events.find((e) => e.type === "workflow_complete");
    assertExists(workflowComplete);
    assertEquals(workflowComplete.successfulTasks, 4);

    console.log(`  ✓ Parallel tasks executed concurrently (${totalTime.toFixed(2)}ms)`);
  });

  await t.step({
    name: "Layer dependencies enforced correctly",
    ignore: false,
    fn: async () => {
      const mockToolExecutor = createMockToolExecutor();
      const executor = createExecutorWithWorkerBridge(mockToolExecutor);

      const dag: DAGStructure = {
        tasks: [
          // Layer 0
          createTask({ id: "l0_task1", tool: "test:tool1" }),
          createTask({ id: "l0_task2", tool: "test:tool2" }),
          // Layer 1
          createTask({
            id: "l1_task",
            tool: "test:tool3",
            dependsOn: ["l0_task1", "l0_task2"],
          }),
        ],
      };

      const events = await collectEvents(executor, dag);

      // Find when l0 tasks complete
      const l0_task1_complete = events.find((e) =>
        e.type === "task_complete" && e.taskId === "l0_task1"
      );
      const l0_task2_complete = events.find((e) =>
        e.type === "task_complete" && e.taskId === "l0_task2"
      );
      const l1_task_start = events.find((e) => e.type === "task_start" && e.taskId === "l1_task");

      assertExists(l0_task1_complete);
      assertExists(l0_task2_complete);
      assertExists(l1_task_start);

      // l1_task should start AFTER at least one l0 task completes
      // (Due to parallel execution, timestamps may be very close, so we just verify they all happened)
      const maxL0Time = Math.max(l0_task1_complete.timestamp, l0_task2_complete.timestamp);
      assert(
        l1_task_start.timestamp >= maxL0Time,
        `l1_task_start (${l1_task_start.timestamp}) should be >= max l0 completion (${maxL0Time})`,
      );

      console.log("  ✓ Layer dependencies enforced correctly");
    },
  });
});
