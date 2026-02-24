/**
 * Trace Path Extraction — Single source of truth
 *
 * Extracts clean tool paths from ExecutionTrace, consolidating 4 duplicate
 * implementations across per-priority.ts, path-level-features.ts,
 * per-training.ts, and initializer.ts.
 *
 * Primary: taskResults (structured, 0% corruption).
 * Fallback: executedPath (legacy, may contain UUIDs/FQDN).
 *
 * @module capabilities/trace-path
 */

import type { ExecutionTrace } from "./types.ts";
import { normalizeToolId } from "./routing-resolver.ts";
import { isInternalOperation, isLoopOperation } from "./pure-operations.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * Get clean tool path from a trace for ML/compute usage.
 *
 * 1. If taskResults non-empty → sort by layerIndex, extract tool (resolve $cap: via resolvedTool)
 * 2. Otherwise fallback to executedPath
 * 3. normalizeToolId() on each entry
 * 4. Filter UUIDs + internal operations (code:*, loop:*)
 */
export function getCleanToolPath(
  trace: Pick<ExecutionTrace, "executedPath"> & Partial<Pick<ExecutionTrace, "taskResults">>,
): string[] {
  let raw: string[] = [];
  if (trace.taskResults && trace.taskResults.length > 0) {
    const sorted = [...trace.taskResults].sort(
      (a, b) => (a.layerIndex ?? 0) - (b.layerIndex ?? 0),
    );
    for (const tr of sorted) {
      const toolId =
        tr.tool.startsWith("$cap:") && tr.resolvedTool
          ? tr.resolvedTool
          : tr.tool;
      // Loop entries: expand bodyTools (deduplicated static list) instead of opaque loop:* entry
      if (isLoopOperation(toolId)) {
        if (tr.bodyTools && tr.bodyTools.length > 0) {
          raw.push(...tr.bodyTools);
        }
        continue;
      }
      if (toolId) raw.push(toolId);
    }
  }
  if (raw.length === 0) {
    raw = trace.executedPath ?? [];
  }
  return raw
    .map(normalizeToolId)
    .filter(
      (id) =>
        id.length > 0 && !UUID_PATTERN.test(id) && !isInternalOperation(id),
    );
}

/**
 * Clean a raw tool ID array (no taskResults logic, just normalize + filter).
 *
 * Used by callers that already have a plain string[] (e.g. from executed_path
 * column directly) rather than a full ExecutionTrace.
 */
export function cleanToolIds(
  ids: string[] | null | undefined,
): string[] {
  if (!ids) return [];
  return ids
    .map(normalizeToolId)
    .filter(
      (id) =>
        id.length > 0 && !UUID_PATTERN.test(id) && !isInternalOperation(id),
    );
}
