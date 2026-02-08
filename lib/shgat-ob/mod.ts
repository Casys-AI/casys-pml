/**
 * SHGAT-OB (OpenBLAS) - SuperHyperGraph Attention Networks
 *
 * Pure TypeScript + OpenBLAS FFI implementation.
 * Production-proven (~80% Hit@1), manual backward pass.
 *
 * Key features:
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - K-head attention with adaptive head count
 * - Multi-level hierarchy support
 * - PER (Prioritized Experience Replay) training
 * - Curriculum learning
 * - OpenBLAS FFI acceleration
 *
 * @example
 * ```typescript
 * import { SHGAT, createSHGATFromCapabilities } from "@pml/shgat-ob";
 *
 * const shgat = createSHGATFromCapabilities(capabilities);
 * const score = shgat.scoreCapability(intentEmbedding, capabilityId, contextTools);
 * const result = shgat.trainBatchV1KHeadBatched(examples, weights);
 * ```
 *
 * @module shgat-ob
 */

// Main SHGAT class and factory functions
export {
  createSHGAT,
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
export type { BatchedEmbeddings, LevelParams, Member, Node } from "./src/core/types.ts";
export {
  batchGetEmbeddings,
  batchGetEmbeddingsByLevel,
  batchGetNodes,
  buildAllIncidenceMatrices,
  buildGraph,
  buildIncidenceMatrix,
  computeAllLevels,
  groupNodesByLevel,
} from "./src/core/types.ts";

// Batched operations for unified Node type
export type {
  BatchedForwardResult,
  BatchedGraphStructure,
  BatchedScoringCache,
} from "./src/core/batched-ops.ts";
export {
  batchedBackwardKHead,
  batchedDownwardPass,
  batchedForward,
  batchedKHeadScoring,
  batchedUpwardPass,
  batchScoreAllNodes,
  precomputeAllK,
  precomputeGraphStructure,
} from "./src/core/batched-ops.ts";

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
