/**
 * SHGAT-TF Training Module
 *
 * Training with TensorFlow.js automatic differentiation.
 * Replaces 3000+ lines of manual backward passes with autograd.
 *
 * Backend selection (2026-02-08):
 * - Training: WebGPU > CPU (full autograd, all kernels)
 * - Inference: WebGPU > WASM > CPU (speed priority)
 * - Dense autograd mode is now the default (sparse deprecated)
 *
 * @module shgat-tf/training
 */

// Autograd trainer (NEW - replaces v1-trainer, multi-level-trainer, etc.)
export {
  AutogradTrainer,
  trainStep,
  forwardScoring,
  kHeadScoring,
  infoNCELoss,
  batchContrastiveLoss,
  initTFParams,
  DEFAULT_TRAINER_CONFIG,
  // Message passing (2026-01-28)
  messagePassingForward,
  buildGraphStructure,
  disposeGraphStructure,
} from "./autograd-trainer.ts";

export type {
  TFParams,
  TrainerConfig,
  TrainingMetrics,
  // Message passing types (2026-01-28)
  GraphStructure,
  CapabilityInfo,
  MessagePassingContext,
} from "./autograd-trainer.ts";

// Sparse message passing (2026-01-28)
export {
  buildSparseConnectivity,
  sparseMPForward,
  sparseMPBackward,
  applySparseMPGradients,
} from "./sparse-mp.ts";

export type {
  SparseConnectivity,
  SparseMPForwardCache,
  SparseMPGradients,
  SparseMPForwardResult,
} from "./sparse-mp.ts";

// PER buffer (kept - no gradients, just replay logic)
export {
  PERBuffer,
  annealBeta,
  annealTemperature,
  type PERConfig,
} from "./per-buffer.ts";
