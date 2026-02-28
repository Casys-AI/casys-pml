/**
 * Shared tracing types — HTTP contract between PML client and server.
 *
 * These types define what crosses the wire (JSON-RPC).
 * Both `packages/pml/` and `src/` import from here and extend locally
 * for their specific needs (Phase 2a enrichments, ML fields, etc.).
 *
 * @module @casys/pml-types/tracing
 */

/**
 * JSON-serializable value for tool arguments and results.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Task result recorded during execution.
 *
 * Base contract: fields present in BOTH PML client and server traces.
 * Server extends this with Phase 2a fields (isFused, logicalOperations, loops).
 * PML client uses this as-is.
 */
export interface TraceTaskResult {
  /** Unique ID for this task */
  taskId: string;

  /** Tool identifier in "namespace:action" format */
  tool: string;

  /** Arguments passed to the tool (sanitized) */
  args: Record<string, JsonValue>;

  /** Result returned by the tool (sanitized) */
  result: JsonValue;

  /** Whether the tool call succeeded */
  success: boolean;

  /** Call duration in milliseconds */
  durationMs: number;

  /** ISO timestamp when call was made */
  timestamp: string;

  /**
   * DAG layer index for parallel execution groups.
   * Layer 0 = root tasks, Layer N = depends on layer N-1.
   */
  layerIndex?: number;
}

/**
 * Branch decision during execution (control flow).
 *
 * Identical on both sides — no drift.
 */
export interface BranchDecision {
  /** ID of the decision node */
  nodeId: string;

  /** Outcome taken (e.g., "true", "false", "case:value") */
  outcome: string;

  /** Condition expression (optional, for debugging) */
  condition?: string;
}

/**
 * Base execution trace — the HTTP contract between PML client and server.
 *
 * PML client extends with: workflowId
 * Server extends with: intentText, intentEmbedding, priority, executedPath, initialContext
 *
 * Field naming decisions (arbitrated case-by-case):
 * - `traceId` (not `id`) — more explicit, PML convention wins
 * - `errorMessage` (not `error`) — more descriptive, server convention wins
 * - `timestamp` ISO string (not `executedAt` Date) — JSON-serializable, PML convention wins
 * - `capabilityId` as string — FQDN in transit, UUID after server resolution
 */
export interface BaseExecutionTrace {
  /** Unique trace ID (UUID) */
  traceId: string;

  /** Parent trace ID for nested capability calls (UUID) */
  parentTraceId?: string;

  /** FQDN of the executed capability */
  capabilityId?: string;

  /** Whether execution completed successfully */
  success: boolean;

  /** Error message if failed */
  errorMessage?: string;

  /** Total execution duration in milliseconds */
  durationMs: number;

  /** Results from each tool invocation */
  taskResults: TraceTaskResult[];

  /** Branch decisions made during execution */
  decisions: BranchDecision[];

  /** ISO timestamp when trace was created */
  timestamp: string;

  /** User ID for multi-tenancy (UUID) */
  userId?: string;
}
