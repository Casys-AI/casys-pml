/**
 * Integration Tests: Controlled Executor - Decision Loops
 *
 * Tests for AIL (Agent-in-the-Loop) and HIL (Human-in-the-Loop) decision points.
 * Covers per_layer triggers, on_error triggers, abort commands, and permission model.
 *
 * @module tests/dag/controlled-executor-decisions.test
 */

import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@1";
import { ControlledExecutor } from "../../src/dag/controlled-executor.ts";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ExecutorConfig } from "../../src/dag/types.ts";
import {
  createMockToolExecutor,
  createExecutorWithWorkerBridge,
  collectEvents,
} from "./test-utils/controlled-executor-helpers.ts";
import { createLinearDAG, createTask, createMCPTask, createPureTask } from "../factories/index.ts";

// ============================================================================
// Test Suite: AIL Decision Loops Integration
// ============================================================================

Deno.test({
  name: "Decisions: AIL decision loops",
  sanitizeOps: false, // Timer leaks from CommandQueue.waitForCommand are expected in AIL tests
  sanitizeResources: false,
  fn: async (t) => {
    await t.step("AIL per_layer triggers after each layer", async () => {
      const config: ExecutorConfig = {
        ail: { enabled: true, decision_points: "per_layer" },
        timeouts: { ail: 5000 },
      };

      const mockToolExecutor = createMockToolExecutor();
      const executor = new ControlledExecutor(mockToolExecutor, config);

      const dag = createLinearDAG(2, "task");
      const events = await collectEvents(executor, dag, { autoContinueAIL: true });

      // Should have 2 AIL decision points (one per layer)
      const ailEvents = events.filter((e) =>
        e.type === "decision_required" && e.decisionType === "AIL"
      );
      assertEquals(ailEvents.length, 2);

      console.log("  ✓ AIL per_layer triggers correctly");
    });

    await t.step("AIL on_error triggers only when tasks fail", async () => {
      const config: ExecutorConfig = {
        ail: { enabled: true, decision_points: "on_error" },
        timeouts: { ail: 5000 },
      };

      const mockToolExecutor = createMockToolExecutor();
      const executor = new ControlledExecutor(mockToolExecutor, config);

      const dag: DAGStructure = {
        tasks: [
          createTask({ id: "task1", tool: "std:tool1" }),
          createTask({ id: "task2", tool: "std:tool2", dependsOn: ["task1"] }),
        ],
      };

      const events = await collectEvents(executor, dag);

      // Should have NO AIL decision points (no errors)
      const ailEvents = events.filter((e) =>
        e.type === "decision_required" && e.decisionType === "AIL"
      );
      assertEquals(ailEvents.length, 0);

      console.log("  ✓ AIL on_error does not trigger without errors");
    });

    await t.step({
      name: "AIL abort command stops execution",
      fn: async () => {
        const config: ExecutorConfig = {
          ail: { enabled: true, decision_points: "per_layer" },
          timeouts: { ail: 5000 },
        };

        const mockToolExecutor = createMockToolExecutor();
        const executor = new ControlledExecutor(mockToolExecutor, config);

        const dag: DAGStructure = {
          tasks: [
            createTask({ id: "task1", tool: "std:tool1" }),
            createTask({ id: "task2", tool: "std:tool2", dependsOn: ["task1"] }),
          ],
        };

        const streamGen = executor.executeStream(dag);

        await assertRejects(
          async () => {
            for await (const event of streamGen) {
              if (event.type === "decision_required" && event.decisionType === "AIL") {
                // Send abort command
                executor.enqueueCommand({ type: "abort", reason: "Test abort" });
              }
            }
          },
          Error,
          "aborted by agent",
        );

        console.log("  ✓ AIL abort command stops execution");
      },
    });
  },
});

// ============================================================================
// Test Suite: Tool Permission-Based HIL (allow/ask/deny model)
// ============================================================================

Deno.test({
  name: "Decisions: Tool permission-based HIL",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step("Tools in 'allow' list do not trigger HIL", async () => {
      // Tools prefixed with 'json:' or 'math:' are in DEFAULT_PERMISSIONS allow list
      const config: ExecutorConfig = {
        hil: { enabled: true, approval_required: "never" },
        timeouts: { hil: 5000 },
      };

      const mockToolExecutor = createMockToolExecutor();
      const executor = createExecutorWithWorkerBridge(mockToolExecutor, config);

      const dag: DAGStructure = {
        tasks: [
          createMCPTask({ id: "task1", tool: "json:parse" }),
          createMCPTask({ id: "task2", tool: "math:add" }),
        ],
      };

      const events = await collectEvents(executor, dag);

      // No HIL events for allowed tools
      const hilEvents = events.filter((e) =>
        e.type === "decision_required" && e.decisionType === "HIL"
      );
      assertEquals(hilEvents.length, 0);

      const workflowComplete = events.find((e) => e.type === "workflow_complete");
      assertExists(workflowComplete);
      assertEquals(workflowComplete.successfulTasks, 2);

      console.log("  ✓ Allowed tools execute without HIL");
    });

    await t.step("Unknown tools trigger HIL (safety default)", async () => {
      // Tools with unknown prefix require HIL for safety
      const config: ExecutorConfig = {
        hil: { enabled: true, approval_required: "never" },
        timeouts: { hil: 5000 },
      };

      const mockToolExecutor = createMockToolExecutor();
      const executor = createExecutorWithWorkerBridge(mockToolExecutor, config);

      const dag: DAGStructure = {
        tasks: [
          // 'unknown' prefix is not in allow/ask/deny lists → requires HIL
          createMCPTask({ id: "task1", tool: "unknown:action" }),
        ],
      };

      const events = await collectEvents(executor, dag, { autoApproveHIL: true });

      // Unknown tools should trigger HIL
      const hilEvents = events.filter((e) =>
        e.type === "decision_required" && e.decisionType === "HIL"
      );
      assertEquals(hilEvents.length, 1);

      console.log("  ✓ Unknown tools trigger HIL for safety");
    });

    await t.step({
      name: "HIL rejection aborts workflow",
      // TODO: Fix timing issue - rejection command needs to be processed before auto-approve
      ignore: true,
      fn: async () => {
        const config: ExecutorConfig = {
          hil: { enabled: true, approval_required: "never" },
          timeouts: { hil: 5000 },
        };

        const mockToolExecutor = createMockToolExecutor();
        const executor = createExecutorWithWorkerBridge(mockToolExecutor, config);

        const dag: DAGStructure = {
          tasks: [
            // Unknown tool triggers HIL
            createMCPTask({ id: "task1", tool: "unknown:action" }),
          ],
        };

        // Pre-enqueue rejection command before starting
        executor.enqueueCommand({
          type: "approval_response",
          checkpointId: "pre-exec",
          approved: false,
          feedback: "User rejected unknown tool",
        });

        const streamGen = executor.executeStream(dag);
        let aborted = false;

        try {
          for await (const event of streamGen) {
            if (event.type === "workflow_abort") {
              aborted = true;
            }
          }
        } catch (error) {
          // Expected: workflow aborted
          aborted = true;
          assert(
            (error as Error).message.includes("aborted") ||
              (error as Error).message.includes("rejected"),
          );
        }

        assert(aborted, "Workflow should have been aborted by HIL rejection");
        console.log("  ✓ HIL rejection aborts workflow");
      },
    });

    await t.step("Pure tasks skip HIL even if tool is unknown", async () => {
      const config: ExecutorConfig = {
        hil: { enabled: true, approval_required: "never" },
        timeouts: { hil: 5000 },
      };

      const mockToolExecutor = createMockToolExecutor();
      const executor = createExecutorWithWorkerBridge(mockToolExecutor, config);

      const dag: DAGStructure = {
        tasks: [
          createPureTask("pure_task", { tool: "unknown:pure_action" }),
        ],
      };

      const events = await collectEvents(executor, dag);

      // Pure tasks skip HIL
      const hilEvents = events.filter((e) =>
        e.type === "decision_required" && e.decisionType === "HIL"
      );
      assertEquals(hilEvents.length, 0);

      console.log("  ✓ Pure tasks skip HIL");
    });
  },
});
