/**
 * SHGAT-TF Training Module
 *
 * Training with TensorFlow.js automatic differentiation.
 * Dense autograd replaces 3000+ lines of manual backward passes.
 *
 * Backend selection:
 * - Training: WebGPU > CPU (full autograd, all kernels)
 * - Inference: WebGPU > WASM > CPU (speed priority)
 *
 * @module shgat-tf/training
 */

// Autograd trainer (dense TF.js autograd)
export {
  AutogradTrainer,
  trainStep,
  forwardScoring,
  kHeadScoring,
  infoNCELoss,
  batchContrastiveLoss,
  initTFParams,
  DEFAULT_TRAINER_CONFIG,
  messagePassingForward,
  buildGraphStructure,
  disposeGraphStructure,
} from "./autograd-trainer.ts";

export type {
  TFParams,
  TrainerConfig,
  TrainingMetrics,
  GraphStructure,
  CapabilityInfo,
  MessagePassingContext,
} from "./autograd-trainer.ts";

// PER buffer (replay logic, no gradients)
export {
  PERBuffer,
  annealBeta,
  annealTemperature,
  type PERConfig,
} from "./per-buffer.ts";
