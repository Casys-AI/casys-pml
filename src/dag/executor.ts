/**
 * Parallel DAG Executor
 *
 * Executes DAG workflows with automatic parallelization based on topological sorting.
 * Independent tasks execute in parallel, dependent tasks execute sequentially.
 *
 * @module dag/executor
 */

import type { DAGStructure, Task } from "../graphrag/types.ts";
import type {
  DAGExecutionResult,
  ExecutorConfig,
  TaskError,
  TaskResult,
  ToolExecutor,
} from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const log = getLogger("default");

/**
 * Parallel executor for DAG workflows
 *
 * Features:
 * - Topological sort to identify parallel execution layers
 * - Promise.allSettled for resilient parallel execution
 * - Partial success handling (continues on task failures)
 * - $OUTPUT[task_id] reference resolution
 * - Performance measurement and speedup calculation
 */
export class ParallelExecutor {
  private config: Required<ExecutorConfig>;

  /**
   * Create a new parallel executor
   *
   * @param toolExecutor - Function to execute individual tools
   * @param config - Executor configuration
   */
  constructor(
    private toolExecutor: ToolExecutor,
    config: ExecutorConfig = {},
  ) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? Infinity,
      taskTimeout: config.taskTimeout ?? 30000,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Execute a DAG workflow with automatic parallelization
   *
   * @param dag - DAG structure to execute
   * @returns Execution result with metrics
   * @throws Error if circular dependency detected
   */
  async execute(dag: DAGStructure): Promise<DAGExecutionResult> {
    const startTime = performance.now();

    if (this.config.verbose) {
      log.info(`Starting DAG execution with ${dag.tasks.length} tasks`);
    }

    // 1. Topological sort to identify parallel execution layers
    const layers = this.topologicalSort(dag);

    if (this.config.verbose) {
      log.info(
        `Identified ${layers.length} parallel execution layers: ${
          layers.map((l) => `[${l.map((t) => t.id).join(",")}]`).join(" → ")
        }`,
      );
    }

    // 2. Execute layer by layer
    const results = new Map<string, TaskResult>();
    const errors: TaskError[] = [];

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];

      if (this.config.verbose) {
        log.info(
          `Executing layer ${layerIdx + 1}/${layers.length} with ${layer.length} task(s) in parallel`,
        );
      }

      // Execute all tasks in this layer in parallel using Promise.allSettled
      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      // Collect results and errors
      for (let i = 0; i < layer.length; i++) {
        const task = layer[i];
        const result = layerResults[i];

        if (result.status === "fulfilled") {
          // Task succeeded
          results.set(task.id, {
            taskId: task.id,
            status: "success",
            output: result.value.output,
            executionTimeMs: result.value.executionTimeMs,
          });

          if (this.config.verbose) {
            log.info(
              `✓ Task ${task.id} succeeded (${result.value.executionTimeMs.toFixed(1)}ms)`,
            );
          }
        } else {
          // Task failed - log but continue execution
          const errorMsg = result.reason?.message || String(result.reason);
          const taskError: TaskError = {
            taskId: task.id,
            error: errorMsg,
            status: "error",
          };

          errors.push(taskError);
          results.set(task.id, {
            taskId: task.id,
            status: "error",
            error: errorMsg,
          });

          if (this.config.verbose) {
            log.warn(`✗ Task ${task.id} failed: ${errorMsg}`);
          }
        }
      }
    }

    const totalTime = performance.now() - startTime;

    const executionResult: DAGExecutionResult = {
      results: Array.from(results.values()),
      executionTimeMs: totalTime,
      parallelizationLayers: layers.length,
      errors,
      totalTasks: dag.tasks.length,
      successfulTasks: Array.from(results.values()).filter((r) => r.status === "success").length,
      failedTasks: errors.length,
    };

    if (this.config.verbose) {
      log.info(
        `DAG execution complete: ${executionResult.successfulTasks}/${executionResult.totalTasks} tasks succeeded in ${totalTime.toFixed(1)}ms (${layers.length} layers)`,
      );
    }

    return executionResult;
  }

  /**
   * Topological sort to identify parallel execution layers
   *
   * @param dag - DAG structure
   * @returns Array of layers, where each layer contains tasks that can execute in parallel
   * @throws Error if circular dependency detected
   */
  protected topologicalSort(dag: DAGStructure): Task[][] {
    const layers: Task[][] = [];
    const completed = new Set<string>();
    const remaining = new Map(dag.tasks.map((t) => [t.id, t]));
    const inProgress = new Set<string>();

    while (remaining.size > 0) {
      // Find tasks with all dependencies satisfied
      const ready: Task[] = [];

      for (const [taskId, task] of remaining) {
        // Check if all dependencies are completed
        const allDepsSatisfied = task.depends_on.every((depId) =>
          completed.has(depId)
        );

        if (allDepsSatisfied && !inProgress.has(taskId)) {
          ready.push(task);
          inProgress.add(taskId);
        }
      }

      // Circular dependency check
      if (ready.length === 0 && remaining.size > 0) {
        const remainingIds = Array.from(remaining.keys());
        throw new Error(
          `Circular dependency detected in DAG. Remaining tasks: ${remainingIds.join(", ")}`,
        );
      }

      // Add ready tasks as a new parallel execution layer
      layers.push(ready);

      // Mark as completed and remove from remaining
      for (const task of ready) {
        completed.add(task.id);
        remaining.delete(task.id);
        inProgress.delete(task.id);
      }
    }

    return layers;
  }

  /**
   * Execute a single task with timeout and error handling
   *
   * @param task - Task to execute
   * @param previousResults - Results from previously executed tasks
   * @returns Task output and execution time
   */
  protected async executeTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const startTime = performance.now();

    try {
      // 1. Resolve $OUTPUT[task_id] references in arguments
      const resolvedArgs = this.resolveArguments(task.arguments, previousResults);

      // 2. Check if dependencies failed
      for (const depId of task.depends_on) {
        const depResult = previousResults.get(depId);
        if (depResult?.status === "error") {
          throw new Error(
            `Dependency task ${depId} failed: ${depResult.error}`,
          );
        }
        if (!depResult) {
          throw new Error(`Dependency task ${depId} not found in results`);
        }
      }

      // 3. Execute tool with timeout
      const output = await this.executeWithTimeout(
        task.tool,
        resolvedArgs,
        this.config.taskTimeout,
      );

      const executionTime = performance.now() - startTime;

      return {
        output,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      throw new Error(
        `Task ${task.id} (${task.tool}) failed after ${executionTime.toFixed(1)}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Execute tool with timeout
   */
  private async executeWithTimeout(
    tool: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    let timeoutId: number | undefined;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Task timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    const executionPromise = this.toolExecutor(tool, args);

    try {
      const result = await Promise.race([executionPromise, timeoutPromise]);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      return result;
    } catch (error) {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }

  /**
   * Resolve $OUTPUT[task_id] references in task arguments
   *
   * Supports:
   * - $OUTPUT[task1] - entire output from task1
   * - $OUTPUT[task1].property - nested property access
   *
   * @param args - Raw arguments with potential $OUTPUT references
   * @param previousResults - Results from previously executed tasks
   * @returns Resolved arguments
   */
  private resolveArguments(
    args: Record<string, unknown>,
    previousResults: Map<string, TaskResult>,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && value.startsWith("$OUTPUT[")) {
        // Extract task ID and optional property path
        // Pattern: $OUTPUT[task1] or $OUTPUT[task1].property.nested
        const match = value.match(/^\$OUTPUT\[([^\]]+)\](\.(.+))?$/);

        if (match) {
          const taskId = match[1];
          const propertyPath = match[3]; // undefined if no property access

          const result = previousResults.get(taskId);

          if (!result) {
            throw new Error(
              `Reference to undefined task output: ${taskId}`,
            );
          }

          if (result.status === "error") {
            throw new Error(
              `Reference to failed task output: ${taskId}`,
            );
          }

          // Get output or nested property
          if (propertyPath) {
            resolved[key] = this.getNestedProperty(result.output, propertyPath);
          } else {
            resolved[key] = result.output;
          }
        } else {
          // Invalid $OUTPUT format, treat as literal string
          resolved[key] = value;
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // Recursively resolve nested objects
        resolved[key] = this.resolveArguments(
          value as Record<string, unknown>,
          previousResults,
        );
      } else {
        // Keep as-is
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Get nested property from object using dot notation
   *
   * @param obj - Object to traverse
   * @param path - Dot-separated property path (e.g., "data.user.name")
   * @returns Property value or undefined
   */
  private getNestedProperty(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: any = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Calculate speedup compared to sequential execution
   *
   * Speedup = (sum of all task execution times) / (actual parallel execution time)
   *
   * @param result - Execution result
   * @returns Speedup factor (e.g., 3.5x)
   */
  calculateSpeedup(result: DAGExecutionResult): number {
    // Sequential time = sum of all individual task times
    const sequentialTime = result.results.reduce(
      (sum, r) => sum + (r.executionTimeMs || 0),
      0,
    );

    // Parallel time = actual total execution time
    const parallelTime = result.executionTimeMs;

    if (parallelTime === 0) return 1;

    return sequentialTime / parallelTime;
  }

  /**
   * Get execution statistics
   */
  getStats(result: DAGExecutionResult): {
    totalTasks: number;
    successRate: number;
    avgTaskTime: number;
    speedup: number;
    parallelizationLayers: number;
  } {
    const successRate = result.totalTasks > 0
      ? (result.successfulTasks / result.totalTasks) * 100
      : 0;

    const avgTaskTime = result.successfulTasks > 0
      ? result.results
        .filter((r) => r.status === "success")
        .reduce((sum, r) => sum + (r.executionTimeMs || 0), 0) /
        result.successfulTasks
      : 0;

    return {
      totalTasks: result.totalTasks,
      successRate,
      avgTaskTime,
      speedup: this.calculateSpeedup(result),
      parallelizationLayers: result.parallelizationLayers,
    };
  }
}
