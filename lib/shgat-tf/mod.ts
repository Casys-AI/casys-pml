/**
 * SHGAT-TF - SuperHyperGraph Attention Networks with TensorFlow FFI
 *
 * A TypeScript/Deno implementation of SuperHyperGraph Attention Networks using
 * libtensorflow via FFI for high-performance training and inference.
 *
 * Key features:
 * - Dense TF.js autograd for training (CPU/WebGPU backends)
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - K-head attention (16 heads) with InfoNCE contrastive loss
 * - Multi-level hierarchy support (n-SuperHyperGraph)
 * - Prioritized Experience Replay (PER) for sample efficiency
 * - Optional libtensorflow FFI backend for native performance
 *
 * @example Recommended: Builder API (training + inference)
 * ```typescript
 * import { SHGATBuilder } from "@casys/shgat-tf";
 *
 * const nodes = [
 *   { id: "tool-a", embedding: toolAEmb, children: [] },
 *   { id: "tool-b", embedding: toolBEmb, children: [] },
 *   { id: "cap-1",  embedding: capEmb,   children: ["tool-a", "tool-b"] },
 * ];
 *
 * const shgat = await SHGATBuilder.create()
 *   .nodes(nodes)
 *   .training({ learningRate: 0.05, temperature: 0.10 })
 *   .build();
 *
 * // Score nodes
 * const scores = shgat.score(intentEmbedding, ["cap-1"]);
 *
 * // Train
 * const metrics = await shgat.trainBatch(examples);
 *
 * // Cleanup
 * shgat.dispose();
 * ```
 *
 * @example Legacy: createSHGAT (inference only)
 * ```typescript
 * import { createSHGAT, type Node } from "@casys/shgat-tf";
 *
 * const nodes: Node[] = [
 *   { id: "tool-a", embedding: toolAEmb, children: [], level: 0 },
 *   { id: "cap-1",  embedding: capEmb,   children: ["tool-a", "tool-b"], level: 0 },
 * ];
 * const shgat = createSHGAT(nodes);
 * const scores = shgat.scoreNodes(intentEmbedding, 1);
 * ```
 *
 * @module shgat-tf
 */

// ============================================================================
// Recommended API: Builder + Ports
// ============================================================================

// Builder (fluent API for constructing SHGAT instances)
export { SHGATBuilder } from "./src/core/builder.ts";

// Port interfaces (for dependency injection / hexagonal architecture)
export type {
  SHGATScorer,
  SHGATTrainer,
  SHGATTrainerScorer,
  NodeInput,
  TrainingOptions,
  ArchitectureOptions,
} from "./src/core/builder.ts";

// ============================================================================
// Legacy API (still works, but prefer SHGATBuilder for new code)
// ============================================================================

// SHGAT class and factory
export {
  createSHGAT,
  SHGAT,
} from "./src/core/shgat.ts";

// Types and configuration
export {
  type AttentionResult,
  createDefaultTraceFeatures,
  DEFAULT_HYPERGRAPH_FEATURES,
  DEFAULT_SHGAT_CONFIG,
  DEFAULT_TOOL_GRAPH_FEATURES,
  DEFAULT_TRACE_STATS,
  type ForwardCache,
  type HypergraphFeatures,
  NUM_TRACE_STATS,
  type SHGATConfig,
  type ToolGraphFeatures,
  type TraceFeatures,
  type TraceStats,
  type TrainingExample,
} from "./src/core/shgat.ts";

// Legacy types (kept for backward compatibility — prefer Node type)
export {
  type CapabilityNode,
  type ToolNode,
  type FeatureWeights,
  type FusionWeights,
  DEFAULT_FEATURE_WEIGHTS,
  DEFAULT_FUSION_WEIGHTS,
  getAdaptiveConfig,
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

// Backend mode selection (training vs inference)
export {
  switchBackend,
  supportsAutograd,
  type BackendMode,
} from "./src/tf/backend.ts";

// Layers Trainer (alternative: tf.layers.* + model.trainOnBatch)
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
