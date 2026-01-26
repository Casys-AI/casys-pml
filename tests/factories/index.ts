/**
 * Test Data Factories
 *
 * Central export point for all test data factories.
 * Use these factories to create consistent, type-safe test data.
 *
 * @module tests/factories
 *
 * @example
 * import {
 *   createTask,
 *   createLinearDAG,
 *   createTaskResult,
 * } from "../factories/index.ts";
 *
 * const task = createTask({ id: "my-task" });
 * const dag = createLinearDAG(3);
 * const result = createTaskResult({ taskId: "my-task" });
 */

// Task factories
export {
  createTask,
  createCodeTask,
  createMCPTask,
  createDependentTask,
  createFailingTask,
  createPureTask,
  createSafeToFailCodeTask,
  type Task,
} from "./task.factory.ts";

// DAG factories
export {
  createDAG,
  createLinearDAG,
  createParallelDAG,
  createDiamondDAG,
  createMixedTypeDAG,
  createMultiLayerDAG,
  createDAGWithFailure,
  createDependencyResolutionDAG,
} from "./dag.factory.ts";

// Result factories
export {
  createTaskResult,
  createErrorResult,
  createFailedSafeResult,
  createTaskResults,
  createWorkflowStartEvent,
  createWorkflowCompleteEvent,
  createLayerStartEvent,
  createTaskStartEvent,
  createTaskCompleteEvent,
  createTaskErrorEvent,
  createTaskWarningEvent,
  createCheckpointEvent,
} from "./result.factory.ts";
