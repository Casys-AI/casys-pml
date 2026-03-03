/**
 * Data-prep: intent-based trace deduplication.
 *
 * Pure function — no DB, no runtime-specific imports.
 * Generic over trace type via accessors.
 *
 * @module gru/data-prep/intent-dedup
 */

export interface DedupResult<T> {
  deduped: T[];
  inputCount: number;
  removedCount: number;
}

/**
 * Deduplicate traces by exact intent embedding match within the same group.
 *
 * Two traces are considered duplicates if they share the same groupKey
 * (typically capability_id) AND have identical intent embeddings
 * (compared via toFixed(precision) rounding).
 *
 * Keeps the first occurrence (preserves input order).
 */
export function dedupTracesByIntent<T>(
  traces: T[],
  getGroupKey: (t: T) => string,
  getIntentEmb: (t: T) => number[] | ArrayLike<number>,
  precision = 6,
): DedupResult<T> {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const trace of traces) {
    const groupKey = getGroupKey(trace);
    const emb = getIntentEmb(trace);
    const embKey = Array.from(emb)
      .map((v) => v.toFixed(precision))
      .join(",");
    const dedupKey = `${groupKey}::${embKey}`;

    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    deduped.push(trace);
  }

  return {
    deduped,
    inputCount: traces.length,
    removedCount: traces.length - deduped.length,
  };
}
