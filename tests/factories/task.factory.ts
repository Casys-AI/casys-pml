/**
 * Task Factory - Test data factories for Task creation
 *
 * Provides type-safe factory functions for creating test tasks
 * with sensible defaults and easy overrides.
 *
 * @module tests/factories/task.factory
 */

import type { DAGStructure } from "../../src/graphrag/types.ts";

/**
 * Task type from DAGStructure
 */
export type Task = DAGStructure["tasks"][number];

/**
 * Create a base task with sensible defaults
 *
 * @param overrides - Partial task properties to override defaults
 * @returns Complete Task object
 *
 * @example
 * // Simple task
 * const task = createTask({ id: "my-task" });
 *
 * // Task with custom tool
 * const task = createTask({ id: "fetch", tool: "api:fetch", arguments: { url: "..." } });
 */
export function createTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? `task_${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    type: "mcp_tool",
    tool: "mock:tool",
    arguments: {},
    dependsOn: [],
    ...overrides,
  };
}

/**
 * Create a code_execution task
 *
 * @param overrides - Partial task properties to override defaults
 * @returns Task with type="code_execution"
 *
 * @example
 * const codeTask = createCodeTask({
 *   id: "transform",
 *   code: "return { result: deps.input.value * 2 };"
 * });
 */
export function createCodeTask(overrides: Partial<Task> = {}): Task {
  return createTask({
    type: "code_execution",
    tool: "sandbox",
    code: overrides.code ?? "return { result: 'mock' };",
    ...overrides,
  });
}

/**
 * Create an MCP tool task
 *
 * @param overrides - Partial task properties to override defaults
 * @returns Task with type="mcp_tool"
 *
 * @example
 * const mcpTask = createMCPTask({ tool: "api:fetch", arguments: { url: "test" } });
 */
export function createMCPTask(overrides: Partial<Task> = {}): Task {
  return createTask({
    type: "mcp_tool",
    ...overrides,
  });
}

/**
 * Create a task with specific dependencies
 *
 * @param id - Task ID
 * @param dependsOn - Array of task IDs this task depends on
 * @param overrides - Additional overrides
 * @returns Task with specified dependencies
 */
export function createDependentTask(
  id: string,
  dependsOn: string[],
  overrides: Partial<Task> = {},
): Task {
  return createTask({
    id,
    dependsOn,
    ...overrides,
  });
}

/**
 * Create a task that should fail (for error testing)
 *
 * @param id - Task ID
 * @param overrides - Additional overrides
 * @returns Task configured to trigger failure via _taskId argument
 */
export function createFailingTask(id: string, overrides: Partial<Task> = {}): Task {
  return createTask({
    id,
    tool: "test:fail",
    arguments: { _taskId: id },
    ...overrides,
  });
}

/**
 * Create a pure task (safe-to-fail, skips HIL)
 *
 * @param id - Task ID
 * @param overrides - Additional overrides
 * @returns Task with metadata.pure = true
 */
export function createPureTask(id: string, overrides: Partial<Task> = {}): Task {
  return createTask({
    id,
    metadata: { pure: true },
    ...overrides,
  });
}

/**
 * Create a safe-to-fail code task
 *
 * @param id - Task ID
 * @param code - JavaScript code to execute
 * @param overrides - Additional overrides
 * @returns Code task that will emit task_warning on failure instead of task_error
 */
export function createSafeToFailCodeTask(
  id: string,
  code: string,
  overrides: Partial<Task> = {},
): Task {
  return createCodeTask({
    id,
    code,
    ...overrides,
  });
}
