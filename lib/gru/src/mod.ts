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
} from "./transition/mod.ts";

// Structural bias utilities
export {
  computeJaccardMatrix,
  computeBigramMatrix,
  computeTransitionFeatures,
  computeCapFingerprint,
} from "./transition/mod.ts";
