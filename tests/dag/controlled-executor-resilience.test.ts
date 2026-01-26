/**
 * Integration Tests: Controlled Executor - Error Handling & Resilience
 *
 * Tests for partial failures, safe-to-fail tasks, and critical failure handling.
 * Verifies workflow continues or halts appropriately based on failure type.
 *
 * @module tests/dag/controlled-executor-resilience.test
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import {
  createMockToolExecutor,
  createExecutorWithWorkerBridge,
  collectEvents,
} from "./test-utils/controlled-executor-helpers.ts";
import {
  createTask,
  createMCPTask,
  createCodeTask,
  createSafeToFailCodeTask,
} from "../factories/index.ts";

// ============================================================================
// Test Suite: Error Handling and Resilience
// ============================================================================

Deno.test("Resilience: Error handling and resilience", async (t) => {
  await t.step("Partial layer failures captured correctly", async () => {
    const mockToolExecutor = createMockToolExecutor({ failOnTasks: ["failing_task"] });
    // Disable AIL to avoid 60s timeout waiting for decision on error
    const executor = createExecutorWithWorkerBridge(mockToolExecutor, {
      ail: { enabled: false, decision_points: "manual" },
    });

    const dag: DAGStructure = {
      tasks: [
        // Parallel tasks in same layer
        createTask({ id: "success_task", tool: "test:tool1" }),
        createMCPTask({
          id: "failing_task",
          tool: "test:fail",
          arguments: { _taskId: "failing_task" },
        }),
      ],
    };

    const events = await collectEvents(executor, dag);

    const successComplete = events.find((e) =>
      e.type === "task_complete" && e.taskId === "success_task"
    );
    const failureError = events.find((e) => e.type === "task_error" && e.taskId === "failing_task");

    assertExists(successComplete);
    assertExists(failureError);

    const workflowComplete = events.find((e) => e.type === "workflow_complete");
    assertExists(workflowComplete);
    assertEquals(workflowComplete.successfulTasks, 1);
    assertEquals(workflowComplete.failedTasks, 1);

    console.log("  ✓ Partial layer failures captured correctly");
  });

  await t.step("Safe-to-fail code tasks continue workflow", async () => {
    const mockToolExecutor = createMockToolExecutor();
    // Disable AIL to avoid timeout on safe-to-fail errors
    const executor = createExecutorWithWorkerBridge(mockToolExecutor, {
      ail: { enabled: false, decision_points: "manual" },
    });

    const dag: DAGStructure = {
      tasks: [
        createSafeToFailCodeTask(
          "safe_fail",
          `throw new Error("Safe to fail");`,
        ),
        createMCPTask({
          id: "next_task",
          tool: "test:tool1",
          dependsOn: ["safe_fail"],
        }),
      ],
    };

    const events = await collectEvents(executor, dag);

    const warningEvent = events.find((e) => e.type === "task_warning" && e.taskId === "safe_fail");
    const nextComplete = events.find((e) => e.type === "task_complete" && e.taskId === "next_task");

    assertExists(warningEvent);
    assertExists(nextComplete);

    const workflowComplete = events.find((e) => e.type === "workflow_complete");
    assertExists(workflowComplete);
    assertEquals(workflowComplete.successfulTasks, 1); // Only next_task succeeded

    console.log("  ✓ Safe-to-fail tasks allow workflow continuation");
  });

  await t.step("Safe-to-fail tasks emit warning events", async () => {
    const mockToolExecutor = createMockToolExecutor();
    // Disable AIL to avoid timeout on safe-to-fail errors
    const executor = createExecutorWithWorkerBridge(mockToolExecutor, {
      ail: { enabled: false, decision_points: "manual" },
    });

    const dag: DAGStructure = {
      tasks: [
        createCodeTask({
          id: "safe_task",
          code: `throw new Error("Safe failure");`,
        }),
        createCodeTask({
          id: "next_task",
          code: `return { continued: true };`,
          dependsOn: ["safe_task"],
        }),
      ],
    };

    const events = await collectEvents(executor, dag);

    const warningEvent = events.find((e) => e.type === "task_warning" && e.taskId === "safe_task");
    assertExists(warningEvent);
    if (warningEvent && warningEvent.type === "task_warning") {
      assert(warningEvent.message.includes("Safe-to-fail"));
    }

    const nextTaskComplete = events.find((e) =>
      e.type === "task_complete" && e.taskId === "next_task"
    );
    assertExists(nextTaskComplete);

    console.log("  ✓ Safe-to-fail tasks emit warnings and workflow continues");
  });

  await t.step("Critical failures halt workflow", async () => {
    // Use MCP tool that fails - MCP tools are NEVER safe-to-fail
    const mockToolExecutor = createMockToolExecutor({ failOnTasks: ["critical_fail"] });
    // Disable AIL to avoid timeout on critical errors
    const executor = createExecutorWithWorkerBridge(mockToolExecutor, {
      ail: { enabled: false, decision_points: "manual" },
    });

    const dag: DAGStructure = {
      tasks: [
        createMCPTask({
          id: "critical_fail",
          tool: "json:parse", // Use allowed tool to avoid HIL
          arguments: { _taskId: "critical_fail" },
        }),
        createMCPTask({
          id: "next_task",
          tool: "json:stringify",
          dependsOn: ["critical_fail"],
        }),
      ],
    };

    const events = await collectEvents(executor, dag);

    const errorEvent = events.find((e) => e.type === "task_error" && e.taskId === "critical_fail");
    assertExists(errorEvent);

    // Next task should also fail due to dependency failure
    const nextTaskEvent = events.find((e) =>
      (e.type === "task_error" || e.type === "task_warning") && e.taskId === "next_task"
    );
    assertExists(nextTaskEvent);

    const workflowComplete = events.find((e) => e.type === "workflow_complete");
    assertExists(workflowComplete);
    assert(workflowComplete.failedTasks >= 1, "At least critical_fail should fail");

    console.log("  ✓ Critical failures halt dependent task execution");
  });
});
