/**
 * Capabilities Module (Epic 7 - Emergent Capabilities & Learning)
 *
 * Provides capability storage, hashing, and retrieval for learned code patterns.
 *
 * @module capabilities
 */

export { CapabilityStore } from "./capability-store.ts";
export { hashCode, hashCodeSync, normalizeCode } from "./hash.ts";
export type {
  Capability,
  CacheConfig,
  CapabilitySearchResult,
  JSONSchema,
  SaveCapabilityInput,
  WorkflowPatternRow,
} from "./types.ts";
