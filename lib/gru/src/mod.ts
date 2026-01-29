/**
 * GRU TransitionModel Package
 *
 * GRU-based model for predicting tool sequences and detecting goal termination.
 * Works alongside SHGAT (which handles relevance scoring) to build complete
 * workflow paths.
 *
 * ## Architecture
 *
 * - **SHGAT**: Scores tool relevance for an intent → returns first tool
 * - **GRU TransitionModel**: Predicts next tools step-by-step → builds complete path
 *
 * ## Usage
 *
 * ```typescript
 * import { TransitionModel, initTensorFlow } from "@pml/gru";
 *
 * // Initialize TF.js
 * await initTensorFlow("wasm");
 *
 * // Create model
 * const model = new TransitionModel({
 *   embeddingDim: 1024,
 *   hiddenDim: 256,
 * });
 *
 * // Set tool vocabulary (from SHGAT or embedding store)
 * model.setToolVocabulary(toolEmbeddings);
 *
 * // Build path from first tool
 * const path = await model.buildPath(intentEmbedding, firstToolId);
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

// TransitionModel
export {
  TransitionModel,
  DEFAULT_TRANSITION_CONFIG,
} from "./transition/mod.ts";

export type {
  TransitionModelConfig,
  TransitionPrediction,
  TransitionExample,
  TransitionMetrics,
  TransitionBatch,
  TransitionModelWeights,
} from "./transition/mod.ts";
