/**
 * GRU Compact Informed GRU Package
 *
 * GRU-based model for predicting tool sequences and detecting goal termination.
 * Works alongside SHGAT (which handles relevance scoring) to build complete
 * workflow paths. Incorporates structural signals (Jaccard similarity, bigram
 * transitions, capability fingerprints) for informed predictions.
 *
 * ## Architecture
 *
 * - **SHGAT**: Scores tool relevance for an intent -> returns first tool
 * - **CompactInformedGRU**: Predicts next tools step-by-step -> builds complete path
 *
 * ## Usage
 *
 * ```typescript
 * import { CompactInformedGRU, initTensorFlow, computeJaccardMatrix, computeBigramMatrix } from "@pml/gru";
 *
 * // Initialize TF.js
 * await initTensorFlow();
 *
 * // Create model
 * const model = new CompactInformedGRU({ embeddingDim: 1024 });
 *
 * // Set tool vocabulary and capability map
 * model.setToolVocabulary(toolEmbeddings, toolCapMap);
 *
 * // Set structural bias
 * const jaccard = computeJaccardMatrix(toolCapMap);
 * const bigram = computeBigramMatrix(traces, model.getToolToIndex(), numTools);
 * model.setStructuralBias({ jaccardMatrix: jaccard, bigramMatrix: bigram, numTools });
 *
 * // Build path from first tool
 * const path = model.buildPath(intentEmbedding, firstToolId);
 * ```
 *
 * @module gru
 */

// TensorFlow.js backend
export {
  tf,
  initTensorFlow,
  getBackend,
  isInitialized,
  getMemoryInfo,
  logMemory,
  tidy,
  dispose,
} from "./tf/mod.ts";

// CompactInformedGRU
export {
  CompactInformedGRU,
  DEFAULT_CONFIG,
} from "./transition/mod.ts";

export type {
  CompactGRUConfig,
  TransitionExample,
  TrainingMetrics,
  PredictionResult,
  RankedPrediction,
  StructuralBias,
  ToolCapabilityMap,
  SerializedModel,
  CompositeScoring,
  VocabNode,
} from "./transition/mod.ts";

export {
  compositeToFeatures,
  EMPTY_COMPOSITE_FEATURES,
} from "./transition/mod.ts";

// Structural bias utilities
export {
  computeJaccardMatrix,
  computeBigramMatrix,
  computeTransitionFeatures,
  computeCapFingerprint,
} from "./transition/mod.ts";

// Training utilities (DAG-aware examples + K-fold CV)
export {
  buildDAGAwareExamples,
  generateKFolds,
  computeStats,
  formatKFoldMetric,
} from "./training-utils.ts";
export type {
  TaskResultWithLayer,
  TraceExamples,
  FoldResult,
  KFoldMetrics,
} from "./training-utils.ts";

// Advanced training (PER + TD Error + Thompson Sampling)
export {
  PERBuffer,
  calculateTDError,
  calculateBatchTDErrors,
  tdErrorFromProbability,
  ThompsonSampler,
  DEFAULT_PER_ALPHA,
  DEFAULT_BETA_START,
  DEFAULT_THOMPSON_CONFIG,
  COLD_START_PRIORITY,
} from "./training/mod.ts";
export type {
  PERBufferConfig,
  PEREntry,
  PERSampleResult,
  TDErrorResult,
  ThompsonSamplerConfig,
  ToolBetaState,
  SerializedThompsonState,
} from "./training/mod.ts";
