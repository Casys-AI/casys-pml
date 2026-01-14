/**
 * SHGAT - SuperHyperGraph Attention Networks
 *
 * A TypeScript implementation of SuperHyperGraph Attention Networks for
 * learning relationships in hypergraphs with multi-level message passing.
 *
 * Key features:
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - K-head attention with adaptive head count
 * - Multi-level hierarchy support
 * - PER (Prioritized Experience Replay) training
 * - Curriculum learning
 *
 * @example
 * ```typescript
 * import { SHGAT, createSHGATFromCapabilities } from "@pml/shgat";
 *
 * // Create from capabilities
 * const shgat = createSHGATFromCapabilities(capabilities);
 *
 * // Score a capability for an intent
 * const score = shgat.scoreCapability(intentEmbedding, capabilityId, contextTools);
 *
 * // Train on examples
 * const result = shgat.trainBatchV1KHeadBatched(examples, weights);
 * ```
 *
 * @module shgat
 */

// Main SHGAT class and factory functions
export {
  createSHGATFromCapabilities,
  SHGAT,
  trainSHGATOnEpisodes,
  trainSHGATOnEpisodesKHead,
  trainSHGATOnExecution,
} from "./src/core/shgat.ts";

// Re-export from shgat.ts (types and utilities)
export {
  type AttentionResult,
  type CapabilityNode,
  createDefaultTraceFeatures,
  DEFAULT_FEATURE_WEIGHTS,
  DEFAULT_FUSION_WEIGHTS,
  DEFAULT_HYPERGRAPH_FEATURES,
  DEFAULT_SHGAT_CONFIG,
  DEFAULT_TOOL_GRAPH_FEATURES,
  DEFAULT_TRACE_STATS,
  type FeatureWeights,
  type ForwardCache,
  type FusionWeights,
  getAdaptiveConfig,
  type HypergraphFeatures,
  NUM_TRACE_STATS,
  type SHGATConfig,
  type ToolGraphFeatures,
  type ToolNode,
  type TraceFeatures,
  type TraceStats,
  type TrainingExample,
} from "./src/core/shgat.ts";

// Additional types from types.ts
export type { LevelParams, Member } from "./src/core/types.ts";

// Graph construction
export {
  buildMultiLevelIncidence,
  computeHierarchyLevels,
  generateDefaultToolEmbedding,
  GraphBuilder,
  HierarchyCycleError,
  type HierarchyResult,
  type MultiLevelIncidence,
} from "./src/graph/mod.ts";

// Parameter initialization
export {
  countParameters,
  getAdaptiveHeadsByGraphSize,
  initializeLevelParameters,
  initializeParameters,
  seedRng,
  type SHGATParams,
} from "./src/initialization/index.ts";

// Message passing
export {
  DEFAULT_V2V_PARAMS,
  MultiLevelOrchestrator,
  type CooccurrenceEntry,
  type MultiLevelBackwardCache,
  type MultiLevelGradients,
  type V2VParams,
} from "./src/message-passing/index.ts";

// Attention (K-head scoring)
export * from "./src/attention/index.ts";

// Training
export * from "./src/training/index.ts";

// Math utilities
export * as math from "./src/utils/math.ts";

// Logger adapter
export { getLogger, resetLogger, setLogger, type Logger } from "./src/core/logger.ts";
