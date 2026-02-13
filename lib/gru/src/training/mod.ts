/**
 * Training Utilities — PER, TD Error, Thompson Sampling
 *
 * Advanced training components for the GRU transition model,
 * adapted from the production SHGAT+PER architecture.
 *
 * @module gru/training
 */

// PER Buffer
export { PERBuffer } from "./per-buffer.ts";
export type { PERBufferConfig, PEREntry, PERSampleResult } from "./per-buffer.ts";
export {
  DEFAULT_BETA_START,
  DEFAULT_CAPACITY,
  DEFAULT_MAX_PRIORITY,
  DEFAULT_MIN_PRIORITY,
  DEFAULT_PER_ALPHA,
} from "./per-buffer.ts";

// TD Error
// Note: MIN_PRIORITY and MAX_PRIORITY are the same values as DEFAULT_MIN_PRIORITY
// and DEFAULT_MAX_PRIORITY from per-buffer.ts — export only COLD_START_PRIORITY
// to avoid naming conflicts.
export {
  calculateBatchTDErrors,
  calculateTDError,
  COLD_START_PRIORITY,
  tdErrorFromProbability,
} from "./td-error.ts";
export type { TDErrorResult } from "./td-error.ts";

// Thompson Sampler
export { ThompsonSampler } from "./thompson-sampler.ts";
export type {
  SerializedThompsonState,
  ThompsonSamplerConfig,
  ToolBetaState,
} from "./thompson-sampler.ts";
export { DEFAULT_THOMPSON_CONFIG } from "./thompson-sampler.ts";

// Training Loop
export { evaluateGRU, trainGRU } from "./train-loop.ts";
export type {
  GRUEpochLog,
  GRUTrainingConfig,
  GRUTrainingData,
  GRUTrainingResult,
  TestEvalResult,
} from "./train-loop.ts";
