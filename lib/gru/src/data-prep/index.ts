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
  resolveL2Hierarchy,
} from "./cap-cleanup.ts";
export type { CapData } from "./cap-cleanup.ts";
export {
  buildToolNameResolver,
  buildRenameChain,
} from "./resolve-tool-name.ts";
