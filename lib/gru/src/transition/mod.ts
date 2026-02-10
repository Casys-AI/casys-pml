/**
 * Transition Model Module
 *
 * Compact Informed GRU for predicting tool sequences and goal termination,
 * leveraging structural signals (Jaccard, bigram, capability fingerprints).
 *
 * @module gru/transition
 */

export { CompactInformedGRU } from "./gru-model.ts";

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
} from "./types.ts";
export {
  DEFAULT_CONFIG,
  compositeToFeatures,
  EMPTY_COMPOSITE_FEATURES,
} from "./types.ts";

export {
  computeJaccardMatrix,
  computeBigramMatrix,
  computeTransitionFeatures,
  computeCapFingerprint,
} from "./structural-bias.ts";
