/**
 * DAG Executor Types
 *
 * @module dag/types
 */

/**
 * Result of a single task execution
 */
export interface TaskResult {
  taskId: string;
  status: "success" | "error";
  output?: unknown;
  error?: string;
  executionTimeMs?: number;
}

/**
 * Error information for a failed task
 */
export interface TaskError {
  taskId: string;
  error: string;
  status: "error";
}

/**
 * Complete execution result with aggregated metrics
 */
export interface DAGExecutionResult {
  results: TaskResult[];
  executionTimeMs: number;
  parallelizationLayers: number;
  errors: TaskError[];
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
}

/**
 * Configuration for the parallel executor
 */
export interface ExecutorConfig {
  /**
   * Maximum concurrent tasks per layer (default: unlimited)
   */
  maxConcurrency?: number;

  /**
   * Timeout for individual task execution in ms (default: 30000)
   */
  taskTimeout?: number;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;
}

/**
 * Mock tool executor function signature for testing
 */
export type ToolExecutor = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
