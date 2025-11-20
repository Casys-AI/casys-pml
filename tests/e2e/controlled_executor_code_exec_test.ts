/**
 * E2E Tests: ControlledExecutor with Code Execution Tasks
 *
 * Tests the full Epic 2.5 delegation workflow:
 * - ControlledExecutor builds hybrid DAG (MCP + code_execution)
 * - Parallel execution across layers
 * - Checkpoint persistence
 * - State management via reducers
 *
 * Story 3.4 - AC: #8, #9, #10, #11, #15
 *
 * @module tests/e2e/controlled_executor_code_exec_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { ControlledExecutor } from "../../src/dag/controlled-executor.ts";
import { createDefaultClient } from "../../src/db/client.ts";
import { MigrationRunner, getAllMigrations } from "../../src/db/migrations.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";
import type { PGliteClient } from "../../src/db/client.ts";
import type { DAGStructure } from "../../src/graphrag/types.ts";
import type { ExecutionEvent } from "../../src/dag/types.ts";

/**
 * Shared test context (initialized once)
 */
let sharedDb: PGliteClient;
let sharedEmbeddingModel: EmbeddingModel;

/**
 * Initialize shared resources once for all tests
 */
async function initializeOnce() {
  if (!sharedDb) {
    sharedDb = createDefaultClient();
    await sharedDb.connect();

    const runner = new MigrationRunner(sharedDb);
    await runner.runUp(getAllMigrations());
  }

  if (!sharedEmbeddingModel) {
    sharedEmbeddingModel = new EmbeddingModel();
    await sharedEmbeddingModel.load();
  }
}

/**
 * Helper to create test executor with dependencies
 */
async function createTestExecutor(toolExecutor: any) {
  await initializeOnce();

  const vectorSearch = new VectorSearch(sharedDb, sharedEmbeddingModel);

  const executor = new ControlledExecutor(toolExecutor, {
    verbose: true,
  });

  // Enable code execution support
  executor.setCodeExecutionSupport(vectorSearch, new Map());

  // Enable checkpointing
  executor.setCheckpointManager(sharedDb);

  return executor;
}

Deno.test({
  name: "E2E: ControlledExecutor executes code_execution task",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Mock tool executor (for MCP tools)
    const mockToolExecutor = async (tool: string, _args: Record<string, unknown>) => {
      if (tool === "mock:get_data") {
        return { numbers: [1, 2, 3, 4, 5] };
      }
      return {};
    };

    const executor = await createTestExecutor(mockToolExecutor);

    // Build hybrid DAG: MCP tool → code execution
    const dag: DAGStructure = {
      tasks: [
        // Layer 0: Fetch data via MCP tool
        {
          id: "fetch_data",
          tool: "mock:get_data",
          arguments: {},
          depends_on: [],
          type: "mcp_tool",
        },
        // Layer 1: Process data via code execution
        {
          id: "process_data",
          tool: "code_execution",
          type: "code_execution",
          code: `
            const data = deps.fetch_data;
            const sum = data.numbers.reduce((a, b) => a + b, 0);
            const avg = sum / data.numbers.length;
            return { sum, avg, count: data.numbers.length };
          `,
          arguments: {},
          depends_on: ["fetch_data"],
        },
      ],
    };

    // Execute DAG and collect events
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag)) {
      events.push(event);
    }

    // Verify workflow completed
    const workflowComplete = events.find((e) =>
      e.type === "workflow_complete"
    ) as any;
    assertExists(workflowComplete, "Workflow should complete");
    assertEquals(
      workflowComplete.successful_tasks,
      2,
      "Both tasks should succeed",
    );

    // Verify checkpoint was created
    const checkpointEvent = events.find((e) => e.type === "checkpoint");
    assertExists(checkpointEvent, "Checkpoint should be created");

    // Verify task results
    const state = executor.getState();
    assertExists(state, "State should exist");

    const processDataResult = state.tasks.find((t) =>
      t.taskId === "process_data"
    );
    assertExists(processDataResult, "Code execution task result should exist");
    assertEquals(processDataResult.status, "success", "Task should succeed");

    const output = processDataResult.output as any;
    assertEquals(output.result.sum, 15, "Sum should be correct");
    assertEquals(output.result.avg, 3, "Average should be correct");
    assertEquals(output.result.count, 5, "Count should be correct");
  },
});

Deno.test({
  name: "E2E: Code execution task with intent-based tool injection",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Mock tool executor
    const mockToolExecutor = async () => ({});

    const executor = await createTestExecutor(mockToolExecutor);

    // Build DAG with intent-based code execution
    const dag: DAGStructure = {
      tasks: [
        {
          id: "analyze_with_intent",
          tool: "code_execution",
          type: "code_execution",
          intent: "Calculate fibonacci sequence", // Intent triggers vector search
          code: `
            function fibonacci(n) {
              if (n <= 1) return n;
              return fibonacci(n - 1) + fibonacci(n - 2);
            }
            return fibonacci(10);
          `,
          arguments: {},
          depends_on: [],
        },
      ],
    };

    // Execute
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag)) {
      events.push(event);
    }

    // Verify completion
    const workflowComplete = events.find((e) =>
      e.type === "workflow_complete"
    ) as any;
    assertExists(workflowComplete, "Workflow should complete");
    assertEquals(workflowComplete.successful_tasks, 1, "Task should succeed");

    // Verify result
    const state = executor.getState();
    const taskResult = state?.tasks.find((t) =>
      t.taskId === "analyze_with_intent"
    );
    assertExists(taskResult, "Task result should exist");

    const output = taskResult.output as any;
    assertEquals(output.result, 55, "Fibonacci(10) should be 55");
  },
});

Deno.test({
  name: "E2E: Code execution task error handling and state preservation",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Mock tool executor
    const mockToolExecutor = async () => ({ value: 100 });

    const executor = await createTestExecutor(mockToolExecutor);

    // Build DAG with failing code execution task
    const dag: DAGStructure = {
      tasks: [
        {
          id: "fetch_value",
          tool: "mock:get_value",
          arguments: {},
          depends_on: [],
          type: "mcp_tool",
        },
        {
          id: "process_with_error",
          tool: "code_execution",
          type: "code_execution",
          code: `
            throw new Error("Intentional error for testing");
          `,
          arguments: {},
          depends_on: ["fetch_value"],
        },
      ],
    };

    // Execute and collect events
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag)) {
      events.push(event);
    }

    // Verify first task succeeded
    const fetchSuccess = events.find(
      (e) => e.type === "task_complete" && (e as any).task_id === "fetch_value",
    );
    assertExists(fetchSuccess, "First task should succeed");

    // Verify second task failed
    const processError = events.find(
      (e) => e.type === "task_error" && (e as any).task_id === "process_with_error",
    );
    assertExists(processError, "Code execution task should fail");

    // Verify checkpoint was created after Layer 0
    const checkpoint = events.find((e) => e.type === "checkpoint");
    assertExists(checkpoint, "Checkpoint should be created after Layer 0");

    // Verify state preserves error information
    const state = executor.getState();
    const errorTask = state?.tasks.find((t) =>
      t.taskId === "process_with_error"
    );
    assertExists(errorTask, "Error task should be in state");
    assertEquals(errorTask.status, "error", "Task status should be error");
  },
});

Deno.test({
  name: "E2E: Multiple code execution tasks with dependencies",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = await createTestExecutor(async () => ({}));

    // Build DAG with chained code execution tasks
    const dag: DAGStructure = {
      tasks: [
        {
          id: "generate_data",
          tool: "code_execution",
          type: "code_execution",
          code: "return { values: [10, 20, 30, 40, 50] };",
          arguments: {},
          depends_on: [],
        },
        {
          id: "filter_data",
          tool: "code_execution",
          type: "code_execution",
          code: `
            const data = deps.generate_data;
            const filtered = data.result.values.filter(v => v > 25);
            return { filtered };
          `,
          arguments: {},
          depends_on: ["generate_data"],
        },
        {
          id: "aggregate_data",
          tool: "code_execution",
          type: "code_execution",
          code: `
            const data = deps.filter_data;
            const sum = data.result.filtered.reduce((a, b) => a + b, 0);
            return { sum, count: data.result.filtered.length };
          `,
          arguments: {},
          depends_on: ["filter_data"],
        },
      ],
    };

    // Execute
    const events: ExecutionEvent[] = [];
    for await (const event of executor.executeStream(dag)) {
      events.push(event);
    }

    // Verify all tasks completed
    const workflowComplete = events.find((e) =>
      e.type === "workflow_complete"
    ) as any;
    assertExists(workflowComplete, "Workflow should complete");
    assertEquals(
      workflowComplete.successful_tasks,
      3,
      "All 3 tasks should succeed",
    );

    // Verify final result
    const state = executor.getState();
    const finalTask = state?.tasks.find((t) => t.taskId === "aggregate_data");
    assertExists(finalTask, "Final task should exist");

    const output = finalTask.output as any;
    assertEquals(output.result.sum, 120, "Sum should be 30 + 40 + 50 = 120");
    assertEquals(output.result.count, 3, "Count should be 3");
  },
});
