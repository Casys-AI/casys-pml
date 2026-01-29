/**
 * SHGAT-TF - SuperHyperGraph Attention Networks with TensorFlow.js
 *
 * A TypeScript implementation of SuperHyperGraph Attention Networks using
 * TensorFlow.js for GPU-accelerated training and inference.
 *
 * Key features:
 * - TensorFlow.js backend (WebGPU/WASM acceleration)
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - K-head attention with adaptive head count
 * - Multi-level hierarchy support
 * - GRU-based TransitionModel for path building
 * - Automatic differentiation (no manual backward passes)
 *
 * @example
 * ```typescript
 * import { initTensorFlow, SHGAT, TransitionModel } from "@pml/shgat-tf";
 *
 * // Initialize TensorFlow.js
 * await initTensorFlow();
 *
 * // Create SHGAT
 * const shgat = createSHGATFromCapabilities(capabilities);
 *
 * // Create TransitionModel for path building
 * const transition = new TransitionModel();
 * transition.setToolVocabulary(toolEmbeddings);
 *
 * // Build path: SHGAT scores first tool, TransitionModel builds the rest
 * const firstTool = shgat.scoreCapability(intent, candidates)[0];
 * const path = await transition.buildPath(intent, firstTool);
 * ```
 *
 * @module shgat-tf
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

// ============================================================================
// TensorFlow FFI Backend (libtensorflow - no WASM!)
// ============================================================================

// Core FFI bindings
export * as tff from "./src/tf/tf-ffi.ts";

// High-level API
export {
  initTensorFlow,
  getBackend,
  isInitialized,
  tidy,
  dispose,
  tensor,
  zeros,
  ones,
  matMul,
  softmax,
  gather,
  unsortedSegmentSum,
  Variable,
  variable,
  memory,
  logMemory,
} from "./src/tf/index.ts";

// Layers Trainer (tf.layers.* + model.trainOnBatch - recommended!)
export {
  LayersTrainer,
  initLayersTrainer,
  DEFAULT_LAYERS_TRAINER_CONFIG,
  type LayersTrainerConfig,
  type LayersTrainingMetrics,
} from "./src/training/layers-trainer.ts";

// Custom kernel for UnsortedSegmentSum (enables gather gradients on WASM)
export {
  registerUnsortedSegmentSumKernel,
  isRegistered as isUnsortedSegmentSumRegistered,
} from "./src/tf/kernels/unsorted-segment-sum.ts";
