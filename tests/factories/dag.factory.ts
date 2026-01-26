/**
 * DAG Factory - Test data factories for DAG creation
 *
 * Provides factory functions for creating various DAG structures
 * commonly used in testing: linear chains, parallel batches, diamond patterns, etc.
 *
 * @module tests/factories/dag.factory
 */

import type { DAGStructure } from "../../src/graphrag/types.ts";
import { createTask, createCodeTask, createMCPTask, type Task } from "./task.factory.ts";

/**
 * Create a DAG from an array of tasks
 *
 * @param tasks - Array of tasks
 * @returns DAGStructure containing the tasks
 */
export function createDAG(tasks: Task[]): DAGStructure {
  return { tasks };
}

/**
 * Create a linear DAG (chain of dependent tasks)
 *
 * Each task depends on the previous one.
 * Layer 0: task_1
 * Layer 1: task_2 (depends on task_1)
 * Layer 2: task_3 (depends on task_2)
 * ...
 *
 * @param count - Number of tasks
 * @param prefix - Task ID prefix (default: "task")
 * @returns Linear DAG structure
 *
 * @example
 * const dag = createLinearDAG(3);
 * // Creates: task_1 -> task_2 -> task_3
 */
export function createLinearDAG(count: number, prefix: string = "task"): DAGStructure {
  return {
    tasks: Array.from({ length: count }, (_, i) =>
      createTask({
        id: `${prefix}_${i + 1}`,
        tool: `test:tool${i + 1}`,
        dependsOn: i > 0 ? [`${prefix}_${i}`] : [],
      })
    ),
  };
}

/**
 * Create a parallel DAG (all tasks independent)
 *
 * All tasks execute in parallel (layer 0).
 *
 * @param count - Number of tasks
 * @param prefix - Task ID prefix (default: "task")
 * @returns Parallel DAG structure
 *
 * @example
 * const dag = createParallelDAG(4);
 * // Creates: task_1, task_2, task_3, task_4 (all in layer 0)
 */
export function createParallelDAG(count: number, prefix: string = "task"): DAGStructure {
  return {
    tasks: Array.from({ length: count }, (_, i) =>
      createTask({
        id: `${prefix}_${i + 1}`,
        tool: `test:tool${i + 1}`,
        dependsOn: [],
      })
    ),
  };
}

/**
 * Create a diamond DAG pattern
 *
 * Layer 0: source
 * Layer 1: left, right (both depend on source)
 * Layer 2: sink (depends on left and right)
 *
 * @param prefix - Task ID prefix (default: "")
 * @returns Diamond-shaped DAG
 *
 * @example
 * const dag = createDiamondDAG();
 * // Creates:
 * //        source
 * //       /      \
 * //     left    right
 * //       \      /
 * //        sink
 */
export function createDiamondDAG(prefix: string = ""): DAGStructure {
  const p = prefix ? `${prefix}_` : "";
  return {
    tasks: [
      createTask({ id: `${p}source`, tool: "test:source", dependsOn: [] }),
      createTask({ id: `${p}left`, tool: "test:left", dependsOn: [`${p}source`] }),
      createTask({ id: `${p}right`, tool: "test:right", dependsOn: [`${p}source`] }),
      createTask({ id: `${p}sink`, tool: "test:sink", dependsOn: [`${p}left`, `${p}right`] }),
    ],
  };
}

/**
 * Create a mixed task type DAG
 *
 * Includes both MCP tools and code_execution tasks to test task routing.
 *
 * Layer 0: fetch1 (MCP), fetch2 (MCP)
 * Layer 1: process (code, depends on fetch1, fetch2)
 * Layer 2: store (MCP, depends on process)
 *
 * @returns Mixed-type DAG structure
 */
export function createMixedTypeDAG(): DAGStructure {
  return {
    tasks: [
      createMCPTask({
        id: "fetch1",
        tool: "api:fetch",
        arguments: { url: "test1" },
        dependsOn: [],
      }),
      createMCPTask({
        id: "fetch2",
        tool: "api:fetch",
        arguments: { url: "test2" },
        dependsOn: [],
      }),
      createCodeTask({
        id: "process",
        code: `
          const data1 = deps.fetch1;
          const data2 = deps.fetch2;
          return { processed: true, count: 2, hasData: !!data1 && !!data2 };
        `,
        dependsOn: ["fetch1", "fetch2"],
      }),
      createMCPTask({
        id: "store",
        tool: "db:store",
        arguments: {},
        dependsOn: ["process"],
      }),
    ],
  };
}

/**
 * Create a multi-layer DAG with specified width per layer
 *
 * @param layers - Array of task counts per layer
 * @returns DAG with specified layer structure
 *
 * @example
 * const dag = createMultiLayerDAG([2, 3, 1]);
 * // Layer 0: 2 tasks (l0_t1, l0_t2)
 * // Layer 1: 3 tasks (l1_t1, l1_t2, l1_t3) - each depends on all layer 0 tasks
 * // Layer 2: 1 task (l2_t1) - depends on all layer 1 tasks
 */
export function createMultiLayerDAG(layers: number[]): DAGStructure {
  const tasks: Task[] = [];
  let previousLayerIds: string[] = [];

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const taskCount = layers[layerIdx];
    const currentLayerIds: string[] = [];

    for (let taskIdx = 0; taskIdx < taskCount; taskIdx++) {
      const id = `l${layerIdx}_t${taskIdx + 1}`;
      currentLayerIds.push(id);
      tasks.push(
        createTask({
          id,
          tool: `test:tool_${layerIdx}_${taskIdx + 1}`,
          dependsOn: [...previousLayerIds],
        })
      );
    }

    previousLayerIds = currentLayerIds;
  }

  return { tasks };
}

/**
 * Create a DAG with a specific task that will fail
 *
 * Useful for testing error handling and partial failure scenarios.
 *
 * @param failingTaskId - ID of the task that should fail
 * @param totalTasks - Total number of tasks (default: 3)
 * @returns DAG with one failing task
 */
export function createDAGWithFailure(
  failingTaskId: string = "failing_task",
  totalTasks: number = 3,
): DAGStructure {
  const tasks: Task[] = [];

  for (let i = 0; i < totalTasks; i++) {
    const id = i === 0 ? failingTaskId : `task_${i + 1}`;
    tasks.push(
      createTask({
        id,
        tool: i === 0 ? "test:fail" : `test:tool${i + 1}`,
        arguments: i === 0 ? { _taskId: failingTaskId } : {},
        dependsOn: [],
      })
    );
  }

  return { tasks };
}

/**
 * Create a DAG for testing dependency resolution with code tasks
 *
 * @returns DAG with source MCP task and dependent code task
 */
export function createDependencyResolutionDAG(): DAGStructure {
  return {
    tasks: [
      createMCPTask({
        id: "source",
        tool: "data:get",
        arguments: { key: "test" },
        dependsOn: [],
      }),
      createCodeTask({
        id: "transform",
        code: `
          const input = deps.source;
          if (!input || input.status !== 'success') {
            throw new Error('Source dependency not properly resolved');
          }
          return { transformed: true, inputType: typeof input.output };
        `,
        dependsOn: ["source"],
      }),
    ],
  };
}
