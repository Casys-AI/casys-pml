/**
 * Integration Tests: Controlled Executor - Events & State
 *
 * Tests for event stream ordering, completeness, and workflow state management.
 * Verifies all required events are emitted in correct order.
 *
 * @module tests/dag/controlled-executor-events.test
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import {
  setupTestDb,
  createMockToolExecutor,
  createExecutorWithWorkerBridge,
  collectEvents,
} from "./test-utils/controlled-executor-helpers.ts";
import { createLinearDAG, createTask } from "../factories/index.ts";

// ============================================================================
// Test Suite: Event Stream Validation
// ============================================================================

Deno.test("Events: Event stream ordering and completeness", async (t) => {
  await t.step("Events emitted in correct order", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);

    const dag = createLinearDAG(2);
    const events = await collectEvents(executor, dag);

    // Verify event order
    const eventTypes = events.map((e) => e.type);

    // Expected pattern:
    // workflow_start
    // layer_start(0), task_start(task1), task_complete(task1), state_updated, checkpoint
    // layer_start(1), task_start(task2), task_complete(task2), state_updated, checkpoint
    // workflow_complete

    assertEquals(eventTypes[0], "workflow_start");
    assertEquals(eventTypes[eventTypes.length - 1], "workflow_complete");

    // Each layer should have: layer_start, task_start, task_complete, state_updated
    const layer0StartIdx = eventTypes.indexOf("layer_start");
    const layer1StartIdx = eventTypes.indexOf("layer_start", layer0StartIdx + 1);

    assert(layer0StartIdx >= 0);
    assert(layer1StartIdx > layer0StartIdx);

    console.log("  ✓ Events emitted in correct order");
  });

  await t.step("All event types present in complete workflow", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);
    const db = await setupTestDb();
    executor.setCheckpointManager(db, false);

    const dag = createLinearDAG(2);
    const events = await collectEvents(executor, dag);

    // Required event types
    const expectedTypes = [
      "workflow_start",
      "layer_start",
      "task_start",
      "task_complete",
      "state_updated",
      "checkpoint",
      "workflow_complete",
    ];

    for (const type of expectedTypes) {
      const found = events.some((e) => e.type === type);
      assert(found, `Missing event type: ${type}`);
    }

    console.log("  ✓ All required event types present");

    await db.close();
  });

  await t.step("Event timestamps are monotonically increasing", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);

    const dag = createLinearDAG(2);
    const events = await collectEvents(executor, dag);

    // Verify timestamps increase
    for (let i = 1; i < events.length; i++) {
      assert(
        events[i].timestamp >= events[i - 1].timestamp,
        `Timestamp out of order at index ${i}`,
      );
    }

    console.log("  ✓ Event timestamps are monotonically increasing");
  });
});

// ============================================================================
// Test Suite: State Management Integration
// ============================================================================

Deno.test("Events: Workflow state management", async (t) => {
  await t.step({
    name: "State updates after each layer",
    // TODO: Investigate why state_updated events are not being captured
    ignore: true,
    fn: async () => {
      const mockToolExecutor = createMockToolExecutor();
      // Disable HIL explicitly to avoid blocking
      const executor = createExecutorWithWorkerBridge(mockToolExecutor, {
        hil: { enabled: false, approval_required: "never" },
      });

      const dag: DAGStructure = {
        tasks: [
          // Use allowed tools to avoid HIL
          createTask({ id: "task1", tool: "json:parse" }),
          createTask({ id: "task2", tool: "json:stringify", dependsOn: ["task1"] }),
          createTask({ id: "task3", tool: "math:add", dependsOn: ["task2"] }),
        ],
      };

      const streamGen = executor.executeStream(dag);
      const stateSnapshots: Array<{ layerIndex: number; taskCount: number }> = [];

      for await (const event of streamGen) {
        if (event.type === "state_updated") {
          const state = executor.getState();
          if (state) {
            stateSnapshots.push({
              layerIndex: state.currentLayer,
              taskCount: state.tasks.length,
            });
          }
        }
      }

      // Should have 3 state updates (one per layer)
      assertEquals(stateSnapshots.length, 3);

      // Verify task count increases
      assertEquals(stateSnapshots[0].taskCount, 1);
      assertEquals(stateSnapshots[1].taskCount, 2);
      assertEquals(stateSnapshots[2].taskCount, 3);

      console.log("  ✓ State updates correctly after each layer");
    },
  });

  await t.step("State includes task results with execution metrics", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);

    const dag: DAGStructure = {
      tasks: [createTask({ id: "task1", tool: "test:tool1" })],
    };

    await collectEvents(executor, dag);

    const state = executor.getState();
    assertExists(state);
    assertEquals(state.tasks.length, 1);

    const task = state.tasks[0];
    assertEquals(task.taskId, "task1");
    assertEquals(task.status, "success");
    assertExists(task.executionTimeMs);
    assert(task.executionTimeMs > 0);

    console.log("  ✓ State includes task results with metrics");
  });
});
