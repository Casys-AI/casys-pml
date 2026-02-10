/**
 * TD Error Calculation for GRU Predictions
 *
 * Computes Temporal Difference errors for prioritizing training examples.
 * TD Error = |actual_outcome - predicted_confidence|
 *
 * Adapted from production `src/capabilities/per-priority.ts` for the
 * standalone GRU lib.
 *
 * @module gru/training/td-error
 */

import type { CompactInformedGRU } from "../transition/gru-model.ts";

// ============================================================================
// Constants
// ============================================================================

/** Default priority for cold start (model not yet trained). */
export const COLD_START_PRIORITY = 0.5;

/** Minimum priority to avoid zero-probability sampling. */
export const MIN_PRIORITY = 0.01;

/** Maximum priority (capped to avoid extreme outliers). */
export const MAX_PRIORITY = 1.0;

// ============================================================================
// Types
// ============================================================================

/** Result of a TD error calculation. */
export interface TDErrorResult {
  /** TD Error: actual - predicted. */
  tdError: number;
  /** Priority = |TD error|, clamped to [MIN_PRIORITY, MAX_PRIORITY]. */
  priority: number;
  /** Model's predicted confidence for the target tool. */
  predicted: number;
  /** Actual outcome (1.0 if tool matches target, 0.0 otherwise). */
  actual: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate TD error for a single prediction step.
 *
 * The "predicted" value is the model's confidence (probability) for the
 * actual target tool. The "actual" outcome is 1.0 (the target was correct).
 *
 * High |TD error| = the model was very wrong = high learning priority.
 * Low |TD error| = the model predicted well = low priority.
 *
 * @param model - Trained CompactInformedGRU instance.
 * @param intentEmb - Intent embedding [1024D].
 * @param contextToolIds - Tools executed so far.
 * @param targetToolId - The actual next tool (ground truth).
 * @param compositeFeatures - Optional SHGAT composite features.
 */
export function calculateTDError(
  model: CompactInformedGRU,
  intentEmb: number[],
  contextToolIds: string[],
  targetToolId: string,
  compositeFeatures?: number[],
): TDErrorResult {
  // Get model's ranked predictions
  // The "predicted" value is the confidence the model assigns to the actual target
  const result = model.predictNextTopK(intentEmb, contextToolIds, 10, compositeFeatures);
  const targetRank = result.ranked.find((r) => r.toolId === targetToolId);
  const predicted = targetRank?.score ?? 0;

  // Actual outcome: 1.0 (the target IS the correct next tool)
  const actual = 1.0;

  // TD Error = actual - predicted
  const tdError = actual - predicted;
  const priority = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.abs(tdError)));

  return { tdError, priority, predicted, actual };
}

/**
 * Calculate TD errors for a batch of examples.
 *
 * Returns an array of priorities (one per example) suitable for
 * updating PERBuffer priorities.
 *
 * @param model - Trained CompactInformedGRU.
 * @param examples - Array of { intentEmb, contextToolIds, targetToolId }.
 */
export function calculateBatchTDErrors(
  model: CompactInformedGRU,
  examples: Array<{
    intentEmb: number[];
    contextToolIds: string[];
    targetToolId: string;
    compositeFeatures?: number[];
  }>,
): TDErrorResult[] {
  return examples.map((ex) =>
    calculateTDError(
      model,
      ex.intentEmb,
      ex.contextToolIds,
      ex.targetToolId,
      ex.compositeFeatures,
    )
  );
}

/**
 * Compute TD error from a training step's loss.
 *
 * Simplified version: uses the per-example loss as a proxy for TD error.
 * This avoids an extra forward pass when TD errors can be extracted
 * from the training loss computation.
 *
 * @param predictedProb - Model's softmax probability for the target tool.
 * @param actual - 1.0 for correct, 0.0 for incorrect.
 */
export function tdErrorFromProbability(
  predictedProb: number,
  actual: number = 1.0,
): TDErrorResult {
  const tdError = actual - predictedProb;
  const priority = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.abs(tdError)));
  return { tdError, priority, predicted: predictedProb, actual };
}
