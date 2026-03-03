/**
 * Data-prep barrel export.
 *
 * Shared data cleaning logic for GRU training and benchmarking.
 * Pure functions — no DB, no runtime-specific imports.
 *
 * @module gru/data-prep
 */

export { normalizeToolId, l2Normalize, l2NormalizeMap } from "./normalize.ts";
export {
  resolveExecHashRefs,
  canonicalizeCaps,
  flattenToL0,
} from "./cap-cleanup.ts";
export type { CapData } from "./cap-cleanup.ts";
export {
  buildToolNameResolver,
  buildRenameChain,
} from "./resolve-tool-name.ts";
export { capExamplesPerTarget } from "./cap-frequency-cap.ts";
export type { CapStats } from "./cap-frequency-cap.ts";
export { dedupTracesByIntent } from "./intent-dedup.ts";
export type { DedupResult } from "./intent-dedup.ts";
