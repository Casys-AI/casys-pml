/**
 * Tracing Module for packages/pml
 *
 * Story 14.5b: Execution trace collection and sync for sandboxed capabilities.
 *
 * Provides:
 * - TraceCollector: Accumulates execution data during sandbox runs
 * - TraceSyncer: Async batch sync to cloud
 * - Sanitization: Redacts sensitive data, masks PII, truncates large payloads
 *
 * @example
 * ```typescript
 * import { TraceCollector, TraceSyncer } from "./tracing/mod.ts";
 *
 * // Create syncer (once per loader)
 * const syncer = new TraceSyncer({
 *   cloudUrl: "https://pml.casys.ai",
 *   apiKey: process.env.PML_API_KEY,
 * });
 *
 * // Per-execution collector
 * const collector = new TraceCollector();
 *
 * // Record mcp.* calls
 * collector.recordMcpCall("filesystem:read_file", { path: "/tmp/test" }, { content: "..." }, 50, true);
 *
 * // Finalize and sync
 * const trace = collector.finalize("casys.tools.example:run", true);
 * syncer.enqueue(trace);
 * ```
 *
 * @module tracing
 */

// Types
export type {
  BranchDecision,
  JsonValue,
  LocalExecutionTrace,
  TraceSyncConfig,
  TraceSyncResponse,
  TraceTaskResult,
} from "./types.ts";

export { DEFAULT_SYNC_CONFIG } from "./types.ts";

// Collector
export { TraceCollector } from "./collector.ts";

// Syncer
export { TraceSyncer } from "./syncer.ts";

// Sanitization
export {
  getSerializedSize,
  sanitizeTaskResult,
  sanitizeTrace,
  sanitizeValue,
} from "./sanitizer.ts";
