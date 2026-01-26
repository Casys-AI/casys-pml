/**
 * Controlled Executor Test Helpers
 *
 * Shared utilities for ControlledExecutor integration tests.
 * Extracted from the monolithic integration test file for reuse.
 *
 * @module tests/dag/test-utils/controlled-executor-helpers
 */

import { ControlledExecutor } from "../../../src/dag/controlled-executor.ts";
import type { DAGStructure } from "../../../src/graphrag/types.ts";
import type { ExecutionEvent, ExecutorConfig, ToolExecutor } from "../../../src/dag/types.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";
import { MockWorkerBridge } from "./mock-worker-bridge.ts";

/**
 * Setup test database with migrations
 *
 * Creates an in-memory PGlite database with all migrations applied.
 * Used for checkpoint persistence tests.
 *
 * @returns Initialized PGliteClient
 */
export async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  return db;
}

/**
 * Options for creating a mock tool executor
 */
export interface MockToolExecutorOptions {
  /**
   * Simulated execution delay in ms (default: 5ms)
   */
  delay?: number;

  /**
   * List of task IDs that should simulate failure
   */
  failOnTasks?: string[];

  /**
   * Custom result generator based on tool name
   */
  resultGenerator?: (tool: string, args: Record<string, unknown>) => unknown;
}

/**
 * Mock tool executor with configurable behavior
 *
 * Creates a ToolExecutor function that simulates tool execution with
 * configurable delay and failure modes.
 *
 * @param options - Configuration options
 * @returns Mock ToolExecutor function
 *
 * @example
 * // Basic executor with default 5ms delay
 * const executor = createMockToolExecutor();
 *
 * // Executor that fails on specific tasks
 * const executor = createMockToolExecutor({ failOnTasks: ["task_2"] });
 *
 * // Executor with custom delay for performance tests
 * const executor = createMockToolExecutor({ delay: 50 });
 */
export function createMockToolExecutor(options?: MockToolExecutorOptions): ToolExecutor {
  const delay = options?.delay ?? 5;
  const failOnTasks = options?.failOnTasks ?? [];
  const resultGenerator = options?.resultGenerator;

  return async (tool: string, args: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Check if this tool should fail
    const taskId = args._taskId as string | undefined;
    if (taskId && failOnTasks.includes(taskId)) {
      throw new Error(`Simulated failure for ${taskId}`);
    }

    if (resultGenerator) {
      return resultGenerator(tool, args);
    }

    return { result: `executed_${tool}`, args };
  };
}

/**
 * Create executor with mock WorkerBridge for code_execution tests
 *
 * Sets up a ControlledExecutor with a MockWorkerBridge injected
 * for testing code_execution tasks without actual worker isolation.
 *
 * @param toolExecutor - ToolExecutor function for MCP tasks
 * @param config - Executor configuration
 * @returns Configured ControlledExecutor with mock WorkerBridge
 */
export function createExecutorWithWorkerBridge(
  toolExecutor: ToolExecutor,
  config: ExecutorConfig = {},
): ControlledExecutor {
  const executor = new ControlledExecutor(toolExecutor, { taskTimeout: 30000, ...config });
  // Set mock WorkerBridge via the internal method (cast needed for test access)
  // deno-lint-ignore no-explicit-any
  (executor as any).workerBridge = new MockWorkerBridge();
  return executor;
}

/**
 * Options for collecting execution events
 */
export interface CollectEventsOptions {
  /**
   * Automatically approve all HIL decision points
   */
  autoApproveHIL?: boolean;

  /**
   * Automatically continue at all AIL decision points
   */
  autoContinueAIL?: boolean;

  /**
   * Custom command handlers called for each event
   */
  commandHandlers?: Array<(event: ExecutionEvent, executor: ControlledExecutor) => void>;
}

/**
 * Collect all events from an execution stream
 *
 * Executes a DAG and collects all emitted events into an array.
 * Supports automatic approval/continuation for decision points.
 *
 * @param executor - ControlledExecutor instance
 * @param dag - DAG to execute
 * @param options - Collection options
 * @returns Array of all emitted ExecutionEvents
 *
 * @example
 * // Collect events with auto-approve for HIL
 * const events = await collectEvents(executor, dag, { autoApproveHIL: true });
 *
 * // Verify workflow completed
 * const complete = events.find(e => e.type === "workflow_complete");
 */
export async function collectEvents(
  executor: ControlledExecutor,
  dag: DAGStructure,
  options?: CollectEventsOptions,
): Promise<ExecutionEvent[]> {
  const events: ExecutionEvent[] = [];
  const streamGen = executor.executeStream(dag);

  for await (const event of streamGen) {
    events.push(event);

    // Auto-approve HIL if requested
    if (
      options?.autoApproveHIL && event.type === "decision_required" && event.decisionType === "HIL"
    ) {
      executor.enqueueCommand({ type: "approval_response", checkpointId: "auto", approved: true });
    }

    // Auto-continue AIL if requested
    if (
      options?.autoContinueAIL && event.type === "decision_required" && event.decisionType === "AIL"
    ) {
      executor.enqueueCommand({ type: "continue", reason: "auto-continue" });
    }

    // Run custom command handlers
    if (options?.commandHandlers) {
      for (const handler of options.commandHandlers) {
        handler(event, executor);
      }
    }
  }

  return events;
}

/**
 * Helper to find specific event types in an event array
 *
 * Type-safe utility for filtering events by type.
 *
 * @param events - Array of events to search
 * @param type - Event type to find
 * @returns Array of events matching the type
 */
export function findEventsByType<T extends ExecutionEvent["type"]>(
  events: ExecutionEvent[],
  type: T,
): Extract<ExecutionEvent, { type: T }>[] {
  return events.filter((e): e is Extract<ExecutionEvent, { type: T }> => e.type === type);
}

/**
 * Count events by type
 *
 * @param events - Array of events to count
 * @param type - Event type to count
 * @returns Number of events matching the type
 */
export function countEventsByType(events: ExecutionEvent[], type: ExecutionEvent["type"]): number {
  return events.filter((e) => e.type === type).length;
}

/**
 * Verify event order within an event stream
 *
 * Checks that events appear in the expected order.
 *
 * @param events - Array of events
 * @param expectedOrder - Array of event types in expected order
 * @returns true if order is correct
 */
export function verifyEventOrder(
  events: ExecutionEvent[],
  expectedOrder: ExecutionEvent["type"][],
): boolean {
  let lastIndex = -1;

  for (const expectedType of expectedOrder) {
    const index = events.findIndex((e, i) => i > lastIndex && e.type === expectedType);
    if (index === -1) {
      return false;
    }
    lastIndex = index;
  }

  return true;
}
