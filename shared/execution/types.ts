/**
 * Shared execution types — DAG task and approval contracts.
 *
 * @module @casys/pml-types/execution
 */

/**
 * A single task in a DAG execution plan.
 */
export interface DAGTask {
  /** Unique task identifier */
  id: string;

  /** Tool to execute in "namespace:action" format */
  tool: string;

  /** Arguments for the tool */
  arguments?: Record<string, unknown>;

  /** IDs of tasks this depends on */
  dependsOn: string[];

  /** Parallel execution layer (0 = no dependencies) */
  layerIndex: number;
}

/**
 * Types of approval that can be required during execution.
 */
export type ApprovalType =
  | "tool_permission"
  | "dependency"
  | "api_key_required"
  | "integrity"
  | "oauth_connect";
