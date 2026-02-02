/**
 * Trace Syncer for packages/pml
 *
 * Story 14.5b / ADR-041: Batch sync of execution traces to cloud.
 *
 * TraceSyncer is a simple queue + explicit flush mechanism:
 * - Enqueue traces during execution (no auto-sync)
 * - Sort by dependency (parents before children)
 * - Flush explicitly at end of complete execution
 *
 * This ensures FK constraints are satisfied (parent traces exist before children).
 *
 * @module tracing/syncer
 */

import type {
  LocalExecutionTrace,
  TraceSyncConfig,
  TraceSyncResponse,
} from "./types.ts";
import { DEFAULT_SYNC_CONFIG } from "./types.ts";
import * as log from "@std/log";
import { uuidv7 } from "../utils/uuid.ts";

/**
 * Log debug message for tracing operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:tracing] ${message}`);
}

/**
 * Log warning message.
 */
function logWarn(message: string): void {
  log.warn(`[pml:tracing] ${message}`);
}

/**
 * TraceSyncer - Queue + explicit flush for trace sync.
 *
 * In standalone mode (cloudUrl = null), traces are only logged locally.
 *
 * @example
 * ```typescript
 * const syncer = new TraceSyncer({
 *   cloudUrl: "https://pml.casys.ai",
 *   apiKey: "pml_xxx",
 * });
 *
 * // Enqueue traces during execution
 * syncer.enqueue(trace1);
 * syncer.enqueue(trace2);
 *
 * // Sort and flush at end of execution
 * syncer.sortQueueByDependency();
 * await syncer.flush();
 *
 * // Cleanup on shutdown
 * await syncer.shutdown();
 * ```
 */
export class TraceSyncer {
  /** Queue of traces pending sync */
  private queue: LocalExecutionTrace[] = [];

  /** Whether syncer is active */
  private active = true;

  /** Retry count per trace (for retry logic) */
  private retryCount = new Map<string, number>();

  /** Configuration */
  private readonly config: TraceSyncConfig;

  constructor(config: Partial<TraceSyncConfig> = {}) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };

    if (this.config.cloudUrl) {
      logDebug(`TraceSyncer started - cloud URL: ${this.config.cloudUrl}`);
    } else {
      logDebug("TraceSyncer started - standalone mode (no sync)");
    }
  }

  /**
   * Enqueue a trace for sync.
   *
   * Non-blocking - trace is added to queue.
   * In standalone mode, trace is logged but not queued.
   *
   * @param trace - Sanitized trace to sync
   */
  enqueue(trace: LocalExecutionTrace): void {
    if (!this.active) {
      logWarn("TraceSyncer is shutdown, dropping trace");
      return;
    }

    // In standalone mode, just log the trace
    if (!this.config.cloudUrl) {
      logDebug(`Trace logged (standalone): ${trace.capabilityId} - ${trace.success ? "success" : "failure"} in ${trace.durationMs}ms`);
      return;
    }

    this.queue.push(trace);
    logDebug(`Trace queued: ${trace.capabilityId} (queue size: ${this.queue.length})`);
  }

  /**
   * Flush all queued traces to cloud.
   *
   * Sends traces in batches to cloud API. Failed traces are re-queued
   * for retry up to maxRetries times.
   */
  async flush(): Promise<void> {
    if (!this.config.cloudUrl || this.queue.length === 0) {
      return;
    }

    // Flush all traces in batches
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.config.batchSize);

      logDebug(`Flushing ${batch.length} traces to cloud`);

      try {
        const response = await this.sendBatch(batch);

        if (response.stored === batch.length) {
          logDebug(`Successfully synced ${response.stored} traces`);
          // Clear retry counts for synced traces
          for (const trace of batch) {
            this.retryCount.delete(this.getTraceKey(trace));
          }
        } else if (response.errors && response.errors.length > 0) {
          logWarn(`Partial sync: ${response.stored}/${batch.length} - errors: ${response.errors.join(", ")}`);
        }
      } catch (error) {
        // Re-queue failed batch for retry
        this.handleSyncFailure(batch, error);
        // Stop flushing on error to avoid infinite loop
        break;
      }
    }
  }

  /**
   * Send a batch of traces to cloud API.
   */
  private async sendBatch(batch: LocalExecutionTrace[]): Promise<TraceSyncResponse> {
    const url = `${this.config.cloudUrl}/api/traces`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add API key if configured (server expects x-api-key header)
    if (this.config.apiKey) {
      headers["x-api-key"] = this.config.apiKey;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ traces: batch }),
    });

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(`Rate limited, retry after: ${retryAfter ?? "unknown"}`);
      }

      throw new Error(`Cloud sync failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as TraceSyncResponse;
  }

  /**
   * Handle sync failure with retry logic.
   */
  private handleSyncFailure(batch: LocalExecutionTrace[], error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logWarn(`Sync failed: ${errorMessage}`);

    // Check retry counts and re-queue eligible traces
    for (const trace of batch) {
      const key = this.getTraceKey(trace);
      const retries = this.retryCount.get(key) ?? 0;

      if (retries < this.config.maxRetries) {
        this.retryCount.set(key, retries + 1);
        this.queue.unshift(trace); // Add to front for priority retry
        logDebug(`Re-queued trace for retry ${retries + 1}/${this.config.maxRetries}: ${trace.capabilityId}`);
      } else {
        logWarn(`Dropping trace after ${this.config.maxRetries} retries: ${trace.capabilityId}`);
        this.retryCount.delete(key);
      }
    }
  }

  /**
   * Generate a unique key for a trace (for retry tracking).
   */
  private getTraceKey(trace: LocalExecutionTrace): string {
    return `${trace.traceId}:${trace.timestamp}`;
  }

  /**
   * Get the number of traces in queue.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get a copy of the current queue (for testing/debugging).
   */
  getQueue(): LocalExecutionTrace[] {
    return [...this.queue];
  }

  /**
   * Sort the queue so parent traces come before children.
   *
   * Traces without parentTraceId are considered roots and go first.
   * This ensures FK constraints are satisfied when inserting in order.
   */
  sortQueueByDependency(): void {
    if (this.queue.length <= 1) return;

    // Build a map of traceId -> trace for quick lookup
    const traceMap = new Map<string, LocalExecutionTrace>();
    for (const trace of this.queue) {
      if (trace.traceId) {
        traceMap.set(trace.traceId, trace);
      }
    }

    // Topological sort: traces without parentTraceId first, then children
    const sorted: LocalExecutionTrace[] = [];
    const visited = new Set<string>();

    const visit = (trace: LocalExecutionTrace) => {
      const traceId = trace.traceId ?? uuidv7();
      if (visited.has(traceId)) return;

      // Visit parent first if it's in the queue
      if (trace.parentTraceId && traceMap.has(trace.parentTraceId)) {
        const parent = traceMap.get(trace.parentTraceId)!;
        visit(parent);
      }

      visited.add(traceId);
      sorted.push(trace);
    };

    for (const trace of this.queue) {
      visit(trace);
    }

    this.queue = sorted;
    logDebug(`Queue sorted by dependency: ${sorted.length} traces`);
  }

  /**
   * Check if syncer is in standalone mode (no cloud URL).
   */
  isStandalone(): boolean {
    return this.config.cloudUrl === null;
  }

  /**
   * Check if syncer is active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Shutdown the syncer.
   *
   * Flushes remaining traces if any.
   */
  async shutdown(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.active = false;

    // Final flush attempt
    if (this.queue.length > 0 && this.config.cloudUrl) {
      logDebug(`Shutdown: flushing ${this.queue.length} remaining traces`);
      try {
        this.sortQueueByDependency();
        await this.flush();
      } catch (error) {
        logWarn(`Shutdown flush failed: ${error}`);
      }
    }

    // Clear retry counts
    this.retryCount.clear();

    logDebug("TraceSyncer shutdown complete");
  }
}
