/**
 * Integration Tests: Controlled Executor - Checkpoint Persistence
 *
 * Tests for checkpoint save/restore and workflow resume functionality.
 * Verifies state persistence across workflow interruptions.
 *
 * @module tests/dag/controlled-executor-persistence.test
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ExecutionEvent } from "../../src/dag/types.ts";
import {
  setupTestDb,
  createMockToolExecutor,
  createExecutorWithWorkerBridge,
  collectEvents,
} from "./test-utils/controlled-executor-helpers.ts";
import { createLinearDAG, createTask } from "../factories/index.ts";

// ============================================================================
// Test Suite: Checkpoint Integration
// ============================================================================

Deno.test("Persistence: Checkpoint save and restore", async (t) => {
  await t.step("Save checkpoints after each layer", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);
    const db = await setupTestDb();
    executor.setCheckpointManager(db, false);

    const dag = createLinearDAG(3);
    const events = await collectEvents(executor, dag);

    // Count checkpoint events
    const checkpointEvents = events.filter((e) => e.type === "checkpoint");
    assertEquals(checkpointEvents.length, 3); // One per layer

    // Verify checkpoint IDs are unique
    const checkpointIds = checkpointEvents.map((e) => {
      if (e.type === "checkpoint") return e.checkpointId;
      return "";
    });
    assertEquals(new Set(checkpointIds).size, 3);

    console.log("  ✓ Checkpoints saved after each layer");

    await db.close();
  });

  await t.step("Resume from checkpoint completes remaining layers", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);
    const db = await setupTestDb();
    executor.setCheckpointManager(db, false);

    const dag = createLinearDAG(3);

    // Initial execution to create checkpoint
    const events = await collectEvents(executor, dag);
    const firstCheckpoint = events.find((e) => e.type === "checkpoint" && e.layerIndex === 0);
    assertExists(firstCheckpoint);

    // Resume from first checkpoint
    const resumeExecutor = createExecutorWithWorkerBridge(mockToolExecutor);
    resumeExecutor.setCheckpointManager(db, false);

    if (!firstCheckpoint || firstCheckpoint.type !== "checkpoint") {
      throw new Error("First checkpoint not found");
    }
    const resumeGen = resumeExecutor.resumeFromCheckpoint(dag, firstCheckpoint.checkpointId);
    const resumeEvents: ExecutionEvent[] = [];

    for await (const event of resumeGen) {
      resumeEvents.push(event);
    }

    // Should start from layer 1 (task_2)
    const layer1Start = resumeEvents.find((e) => e.type === "layer_start" && e.layerIndex === 1);
    assertExists(layer1Start);

    // Should NOT re-execute task_1
    const task1Events = resumeEvents.filter((e) => {
      return (
        (e.type === "task_start" || e.type === "task_complete" || e.type === "task_error" ||
          e.type === "task_warning") &&
        e.taskId === "task_1"
      );
    });
    assertEquals(task1Events.length, 0);

    // Should execute task_2 and task_3
    const task2Complete = resumeEvents.find((e) =>
      e.type === "task_complete" && e.taskId === "task_2"
    );
    const task3Complete = resumeEvents.find((e) =>
      e.type === "task_complete" && e.taskId === "task_3"
    );
    assertExists(task2Complete);
    assertExists(task3Complete);

    console.log("  ✓ Resume skips completed layers and executes remaining");

    await db.close();
  });

  await t.step("Checkpoint includes workflow state", async () => {
    const mockToolExecutor = createMockToolExecutor();
    const executor = createExecutorWithWorkerBridge(mockToolExecutor);
    const db = await setupTestDb();
    executor.setCheckpointManager(db, false);

    const dag: DAGStructure = {
      tasks: [
        createTask({ id: "task1", tool: "test:tool1" }),
        createTask({ id: "task2", tool: "test:tool2", dependsOn: ["task1"] }),
      ],
    };

    const events = await collectEvents(executor, dag);
    const checkpoint = events.find((e) => e.type === "checkpoint" && e.layerIndex === 0);
    assertExists(checkpoint);

    // Verify state snapshot exists
    const state = executor.getState();
    assertExists(state);
    assert(state.tasks.length > 0);
    assertEquals(state.currentLayer, 1); // After layer 0 completes

    console.log("  ✓ Checkpoints capture workflow state");

    await db.close();
  });
});
