/**
 * Result Factory - Test data factories for TaskResult and ExecutionEvent creation
 *
 * Provides factory functions for creating test task results and execution events
 * with sensible defaults.
 *
 * @module tests/factories/result.factory
 */

import type { TaskResult, ExecutionEvent } from "../../src/dag/types.ts";

/**
 * Create a successful TaskResult
 *
 * @param overrides - Partial TaskResult to override defaults
 * @returns Complete TaskResult with status="success"
 *
 * @example
 * const result = createTaskResult({ taskId: "my-task", output: { data: "test" } });
 */
export function createTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: overrides.taskId ?? "task_1",
    status: "success",
    output: { result: "mock" },
    executionTimeMs: 100,
    ...overrides,
  };
}

/**
 * Create an error TaskResult
 *
 * @param taskId - ID of the failed task
 * @param error - Error message
 * @param overrides - Additional overrides
 * @returns TaskResult with status="error"
 */
export function createErrorResult(
  taskId: string,
  error: string,
  overrides: Partial<TaskResult> = {},
): TaskResult {
  return {
    taskId,
    status: "error",
    error,
    executionTimeMs: overrides.executionTimeMs ?? 50,
    ...overrides,
  };
}

/**
 * Create a safe-to-fail TaskResult
 *
 * @param taskId - ID of the failed task
 * @param error - Error message
 * @param overrides - Additional overrides
 * @returns TaskResult with status="failed_safe"
 */
export function createFailedSafeResult(
  taskId: string,
  error: string,
  overrides: Partial<TaskResult> = {},
): TaskResult {
  return {
    taskId,
    status: "failed_safe",
    error,
    executionTimeMs: overrides.executionTimeMs ?? 50,
    ...overrides,
  };
}

/**
 * Create multiple TaskResults for a batch of tasks
 *
 * @param taskIds - Array of task IDs
 * @param status - Status for all results (default: "success")
 * @returns Array of TaskResults
 */
export function createTaskResults(
  taskIds: string[],
  status: TaskResult["status"] = "success",
): TaskResult[] {
  return taskIds.map((taskId) =>
    createTaskResult({
      taskId,
      status,
      output: { result: `output_${taskId}` },
    })
  );
}

/**
 * Create a workflow_start event
 *
 * @param workflowId - Workflow UUID
 * @param totalLayers - Number of layers in DAG
 * @returns workflow_start ExecutionEvent
 */
export function createWorkflowStartEvent(
  workflowId: string,
  totalLayers: number,
): ExecutionEvent {
  return {
    type: "workflow_start",
    timestamp: Date.now(),
    workflowId,
    totalLayers,
  };
}

/**
 * Create a workflow_complete event
 *
 * @param workflowId - Workflow UUID
 * @param successfulTasks - Number of successful tasks
 * @param failedTasks - Number of failed tasks
 * @param totalTimeMs - Total execution time in ms
 * @returns workflow_complete ExecutionEvent
 */
export function createWorkflowCompleteEvent(
  workflowId: string,
  successfulTasks: number,
  failedTasks: number,
  totalTimeMs: number,
): ExecutionEvent {
  return {
    type: "workflow_complete",
    timestamp: Date.now(),
    workflowId,
    totalTimeMs,
    successfulTasks,
    failedTasks,
  };
}

/**
 * Create a layer_start event
 *
 * @param workflowId - Workflow UUID
 * @param layerIndex - Layer index (0-based)
 * @param tasksCount - Number of tasks in layer
 * @returns layer_start ExecutionEvent
 */
export function createLayerStartEvent(
  workflowId: string,
  layerIndex: number,
  tasksCount: number,
): ExecutionEvent {
  return {
    type: "layer_start",
    timestamp: Date.now(),
    workflowId,
    layerIndex,
    tasksCount,
  };
}

/**
 * Create a task_start event
 *
 * @param workflowId - Workflow UUID
 * @param taskId - Task ID
 * @param tool - Tool name
 * @returns task_start ExecutionEvent
 */
export function createTaskStartEvent(
  workflowId: string,
  taskId: string,
  tool: string,
): ExecutionEvent {
  return {
    type: "task_start",
    timestamp: Date.now(),
    workflowId,
    taskId,
    tool,
  };
}

/**
 * Create a task_complete event
 *
 * @param workflowId - Workflow UUID
 * @param taskId - Task ID
 * @param executionTimeMs - Execution time in ms
 * @returns task_complete ExecutionEvent
 */
export function createTaskCompleteEvent(
  workflowId: string,
  taskId: string,
  executionTimeMs: number,
): ExecutionEvent {
  return {
    type: "task_complete",
    timestamp: Date.now(),
    workflowId,
    taskId,
    executionTimeMs,
  };
}

/**
 * Create a task_error event
 *
 * @param workflowId - Workflow UUID
 * @param taskId - Task ID
 * @param error - Error message
 * @returns task_error ExecutionEvent
 */
export function createTaskErrorEvent(
  workflowId: string,
  taskId: string,
  error: string,
): ExecutionEvent {
  return {
    type: "task_error",
    timestamp: Date.now(),
    workflowId,
    taskId,
    error,
  };
}

/**
 * Create a task_warning event (for safe-to-fail tasks)
 *
 * @param workflowId - Workflow UUID
 * @param taskId - Task ID
 * @param error - Error message
 * @param message - Warning message
 * @returns task_warning ExecutionEvent
 */
export function createTaskWarningEvent(
  workflowId: string,
  taskId: string,
  error: string,
  message: string,
): ExecutionEvent {
  return {
    type: "task_warning",
    timestamp: Date.now(),
    workflowId,
    taskId,
    error,
    message,
  };
}

/**
 * Create a checkpoint event
 *
 * @param workflowId - Workflow UUID
 * @param checkpointId - Checkpoint UUID
 * @param layerIndex - Layer index where checkpoint was created
 * @returns checkpoint ExecutionEvent
 */
export function createCheckpointEvent(
  workflowId: string,
  checkpointId: string,
  layerIndex: number,
): ExecutionEvent {
  return {
    type: "checkpoint",
    timestamp: Date.now(),
    workflowId,
    checkpointId,
    layerIndex,
  };
}
