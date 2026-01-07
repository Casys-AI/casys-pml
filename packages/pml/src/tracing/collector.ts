/**
 * Trace Collector for packages/pml
 *
 * Story 14.5b: Accumulates execution trace data during sandbox execution.
 *
 * The TraceCollector is created per capability execution and:
 * 1. Records each mcp.* call with timing
 * 2. Accumulates task results
 * 3. Finalizes into a LocalExecutionTrace on completion
 *
 * @module tracing/collector
 */

import type {
  BranchDecision,
  JsonValue,
  LocalExecutionTrace,
  TraceTaskResult,
} from "./types.ts";
import { sanitizeTrace } from "./sanitizer.ts";

/**
 * TraceCollector - Accumulates execution trace data.
 *
 * Created per capability execution. Thread-safe within a single Worker.
 *
 * @example
 * ```typescript
 * const collector = new TraceCollector();
 *
 * // Record mcp.* calls as they happen
 * collector.recordMcpCall("filesystem:read_file", { path: "/tmp/test.txt" }, { content: "..." }, 50, true);
 * collector.recordMcpCall("json:parse", { input: "..." }, { data: {} }, 10, true);
 *
 * // Finalize when execution completes
 * const trace = collector.finalize("casys.tools.example:run", true);
 * ```
 */
export class TraceCollector {
  /** Recorded task results */
  private taskResults: TraceTaskResult[] = [];

  /** Branch decisions (for capabilities with control flow) */
  private decisions: BranchDecision[] = [];

  /** Start time for duration calculation */
  private readonly startTime: number;

  /** Counter for generating unique task IDs */
  private taskCounter = 0;

  /** Whether the collector has been finalized */
  private finalized = false;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Record an mcp.* call result.
   *
   * Called by the RPC handler when a sandbox mcp.* call completes.
   *
   * @param toolId - Tool identifier in "namespace:action" format
   * @param args - Arguments passed to the tool
   * @param result - Result returned by the tool
   * @param durationMs - Call duration in milliseconds
   * @param success - Whether the call succeeded
   */
  recordMcpCall(
    toolId: string,
    args: unknown,
    result: unknown,
    durationMs: number,
    success: boolean,
  ): void {
    if (this.finalized) {
      throw new Error("TraceCollector has been finalized, cannot record more calls");
    }

    this.taskCounter++;
    const taskId = `t${this.taskCounter}`;

    this.taskResults.push({
      taskId,
      tool: toolId,
      args: (args ?? {}) as Record<string, JsonValue>,
      result: result as JsonValue,
      success,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record a branch decision (for capabilities with control flow).
   *
   * @param nodeId - ID of the decision node
   * @param outcome - Outcome taken (e.g., "true", "false")
   * @param condition - Condition expression (optional)
   */
  recordBranchDecision(
    nodeId: string,
    outcome: string,
    condition?: string,
  ): void {
    if (this.finalized) {
      throw new Error("TraceCollector has been finalized, cannot record more decisions");
    }

    this.decisions.push({
      nodeId,
      outcome,
      condition,
    });
  }

  /**
   * Get the number of recorded mcp.* calls.
   */
  getCallCount(): number {
    return this.taskResults.length;
  }

  /**
   * Get the elapsed time since collector creation.
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Finalize the trace after execution completes.
   *
   * Creates a LocalExecutionTrace with sanitized data ready for storage/sync.
   * Once finalized, no more calls can be recorded.
   *
   * @param capabilityId - FQDN of the executed capability
   * @param success - Whether execution completed successfully
   * @param error - Error message if failed (optional)
   * @param userId - User ID for multi-tenancy (optional)
   * @returns Sanitized LocalExecutionTrace
   */
  finalize(
    capabilityId: string,
    success: boolean,
    error?: string,
    userId?: string,
  ): LocalExecutionTrace {
    if (this.finalized) {
      throw new Error("TraceCollector has already been finalized");
    }

    this.finalized = true;

    const trace: LocalExecutionTrace = {
      capabilityId,
      success,
      error,
      durationMs: Date.now() - this.startTime,
      taskResults: this.taskResults,
      decisions: this.decisions,
      timestamp: new Date().toISOString(),
      userId,
    };

    // Sanitize before returning (AC5-6)
    return sanitizeTrace(trace);
  }

  /**
   * Check if the collector has been finalized.
   */
  isFinalized(): boolean {
    return this.finalized;
  }

  /**
   * Get a snapshot of current task results (for debugging).
   *
   * Returns a copy to prevent external modification.
   */
  getSnapshot(): TraceTaskResult[] {
    return [...this.taskResults];
  }
}
