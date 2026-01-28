/**
 * Topological Sort Utilities for DAG Layer Computation
 *
 * Story 11.4: Extracted from ParallelExecutor to be reusable by:
 * - ParallelExecutor.topologicalSort (existing)
 * - code-execution-handler for execute_locally response
 *
 * @module dag/topological-sort
 */

/**
 * Error thrown when circular dependency detected in DAG
 */
export class CircularDependencyError extends Error {
  constructor(remainingTaskIds: string[]) {
    super(`Circular dependency detected in DAG. Remaining tasks: ${remainingTaskIds.join(", ")}`);
    this.name = "CircularDependencyError";
  }
}

/**
 * Topological sort to identify parallel execution layers.
 *
 * Groups tasks by execution layer based on dependencies.
 * Tasks with no dependencies are in layer 0.
 * Tasks depending only on layer N tasks are in layer N+1.
 *
 * @param tasks - Array of tasks with id and dependsOn
 * @returns Array of layers, where each layer contains tasks that can execute in parallel
 * @throws CircularDependencyError if circular dependency detected
 */
export function topologicalSortTasks<T extends { id: string; dependsOn: string[] }>(
  tasks: T[],
): T[][] {
  if (tasks.length === 0) {
    return [];
  }

  const layers: T[][] = [];
  const completed = new Set<string>();
  const remaining = new Map(tasks.map((t) => [t.id, t]));
  const inProgress = new Set<string>();

  while (remaining.size > 0) {
    // Find tasks with all dependencies satisfied
    const ready: T[] = [];

    for (const [taskId, task] of remaining) {
      // Check if all dependencies are completed
      const allDepsSatisfied = task.dependsOn.every((depId: string) => completed.has(depId));

      if (allDepsSatisfied && !inProgress.has(taskId)) {
        ready.push(task);
        inProgress.add(taskId);
      }
    }

    // Circular dependency check
    if (ready.length === 0 && remaining.size > 0) {
      const remainingIds = Array.from(remaining.keys());
      throw new CircularDependencyError(remainingIds);
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
 * Compute layerIndex for each task based on dependencies.
 *
 * Story 11.4: Used to include layerIndex in execute_locally response
 * so client can track layers during local execution without recomputing.
 *
 * @param tasks - Array of tasks with id and dependsOn
 * @returns Same tasks with layerIndex added
 */
export function computeLayerIndexForTasks<T extends { id: string; dependsOn: string[] }>(
  tasks: T[],
): (T & { layerIndex: number })[] {
  if (tasks.length === 0) {
    return [];
  }

  // Reuse topologicalSortTasks to get layers
  const layers = topologicalSortTasks(tasks);

  // Build taskId → layerIndex map
  const taskToLayer = new Map<string, number>();
  layers.forEach((layer, layerIndex) => {
    for (const task of layer) {
      taskToLayer.set(task.id, layerIndex);
    }
  });

  // Return tasks with layerIndex added
  return tasks.map((task) => ({
    ...task,
    layerIndex: taskToLayer.get(task.id) ?? 0,
  }));
}
