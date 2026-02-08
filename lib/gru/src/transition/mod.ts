/**
 * Transition Model Module
 *
 * GRU-based model for predicting tool sequences and goal termination.
 *
 * @module gru/transition
 */

export { TransitionModel } from "./gru-model.ts";
export type {
  TransitionModelConfig,
  TransitionPrediction,
  TransitionExample,
  TransitionMetrics,
  TransitionBatch,
  TransitionModelWeights,
} from "./types.ts";
export { DEFAULT_TRANSITION_CONFIG } from "./types.ts";
