/**
 * Trace Syncer for packages/pml
 *
 * Story 14.5b: Async batch sync of execution traces to cloud.
 *
 * The TraceSyncer handles:
 * - Queuing traces for batch sync
 * - Periodic flush to cloud API
 * - Retry logic for failed syncs
 * - Graceful degradation in standalone mode
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
 * TraceSyncer - Async batch sync of traces to cloud.
 *
 * In standalone mode (cloudUrl = null), traces are only logged locally.
 *
 * @example
 * ```typescript
 * const syncer = new TraceSyncer({
 *   cloudUrl: "https://pml.casys.ai",
 *   batchSize: 10,
 *   flushIntervalMs: 5000,
 *   maxRetries: 3,
 *   apiKey: "pml_xxx",
 * });
 *
 * // Enqueue traces (non-blocking)
 * syncer.enqueue(trace);
 *
 * // Manual flush (optional)
 * await syncer.flush();
 *
 * // Cleanup on shutdown
 * await syncer.shutdown();
 * ```
 */
export class TraceSyncer {
  /** Queue of traces pending sync */
  private queue: LocalExecutionTrace[] = [];

  /** Timer for periodic flush */
  private flushTimer: number | null = null;

  /** Whether syncer is active */
  private active = true;

  /** Retry count per trace (for retry logic) */
  private retryCount = new Map<string, number>();

  /** Configuration */
  private readonly config: TraceSyncConfig;

  constructor(config: Partial<TraceSyncConfig> = {}) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };

    // Start periodic flush timer if cloud URL is configured
    if (this.config.cloudUrl) {
      this.startFlushTimer();
      logDebug(`TraceSyncer started - cloud URL: ${this.config.cloudUrl}`);
    } else {
      logDebug("TraceSyncer started - standalone mode (no sync)");
    }
  }

  /**
   * Enqueue a trace for sync.
   *
   * Non-blocking - trace is added to queue for batch sync.
   * In standalone mode, trace is logged but not synced.
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

    // Flush immediately if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      this.flush().catch((error) => {
        logWarn(`Batch flush failed: ${error}`);
      });
    }
  }

  /**
   * Flush queued traces to cloud.
   *
   * Sends current batch to cloud API. Failed traces are re-queued
   * for retry up to maxRetries times.
   */
  async flush(): Promise<void> {
    if (!this.config.cloudUrl || this.queue.length === 0) {
      return;
    }

    // Take a batch from queue
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

    // Add API key if configured
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
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
    return `${trace.capabilityId}:${trace.timestamp}`;
  }

  /**
   * Start the periodic flush timer.
   */
  private startFlushTimer(): void {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush().catch((error) => {
          logWarn(`Periodic flush failed: ${error}`);
        });
      }
    }, this.config.flushIntervalMs);

    // Mark as unref so it doesn't keep the process alive
    if (typeof Deno !== "undefined") {
      Deno.unrefTimer(this.flushTimer);
    }
  }

  /**
   * Stop the periodic flush timer.
   */
  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get the number of traces in queue.
   */
  getQueueSize(): number {
    return this.queue.length;
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
   * Stops the flush timer and attempts to flush remaining traces.
   */
  async shutdown(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.stopFlushTimer();

    // Final flush attempt
    if (this.queue.length > 0 && this.config.cloudUrl) {
      logDebug(`Shutdown: flushing ${this.queue.length} remaining traces`);
      try {
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
