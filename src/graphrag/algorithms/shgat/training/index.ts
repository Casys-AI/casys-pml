/**
 * SHGAT Training Module
 *
 * Training logic for SHGAT networks.
 *
 * @module graphrag/algorithms/shgat/training
 */

// V1 Training (3-head architecture)
export {
  type V1GradientAccumulators,
  type TrainingResult,
  initV1Gradients,
  resetV1Gradients,
  computeFusionWeights,
  backward,
  accumulateW_intentGradients,
  applyLayerGradients,
  applyFusionGradients,
  applyFeatureGradients,
  applyW_intentGradients,
  trainOnEpisodes,
} from "./v1-trainer.ts";

// V2 Training (multi-head with TraceFeatures)
export {
  type V2ForwardCache,
  traceStatsToVector,
  forwardV2WithCache,
  backwardV2,
  applyV2Gradients,
  buildTraceFeatures,
  createDefaultTraceStatsFromFeatures,
  computeHeadScores,
  fusionMLPForward,
} from "./v2-trainer.ts";
