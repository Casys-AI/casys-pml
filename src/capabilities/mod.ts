/**
 * Capabilities Module (Epic 7 - Emergent Capabilities & Learning)
 *
 * Provides capability storage, hashing, and retrieval for learned code patterns.
 *
 * @module capabilities
 */

export { CapabilityStore } from "./capability-store.ts";
export { CapabilityMatcher } from "./matcher.ts";
export { SchemaInferrer } from "./schema-inferrer.ts";
export { CapabilityCodeGenerator } from "./code-generator.ts";
export { CapabilityExecutor } from "./executor.ts";
// Note: hashCodeSync is intentionally not exported - it uses djb2 (32-bit)
// which has higher collision probability. Use hashCode (SHA-256) for production.
export { hashCode, normalizeCode } from "./hash.ts";
export type {
  CacheConfig,
  Capability,
  CapabilityMatch,
  CapabilitySearchResult,
  JSONSchema,
  SaveCapabilityInput,
} from "./types.ts";
