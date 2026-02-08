/**
 * TensorFlow.js Module for GRU TransitionModel
 *
 * @module gru/tf
 */

export {
  tf,
  initTensorFlow,
  getBackend,
  isInitialized,
  getMemoryInfo,
  logMemory,
  disposeAll,
  tidy,
  dispose,
} from "./backend.ts";

export * as ops from "./ops.ts";
