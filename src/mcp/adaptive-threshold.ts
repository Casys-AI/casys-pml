/**
 * Adaptive Threshold Learning Manager
 *
 * Learns optimal confidence thresholds based on execution feedback.
 * Adjusts thresholds dynamically to minimize false positives and false negatives.
 *
 * @module mcp/adaptive-threshold
 */

import * as log from "@std/log";
import type { ExecutionRecord, SpeculativeMetrics } from "../graphrag/types.ts";

/**
 * Adaptive threshold configuration
 */
interface AdaptiveConfig {
  initialExplicitThreshold: number;
  initialSuggestionThreshold: number;
  learningRate: number;
  minThreshold: number;
  maxThreshold: number;
  windowSize: number; // Number of recent executions to consider
}

/**
 * Threshold adjustment result
 */
interface ThresholdAdjustment {
  explicitThreshold?: number;
  suggestionThreshold?: number;
  reason: string;
}

/**
 * Adaptive Threshold Manager
 *
 * Uses sliding window of recent executions to adjust thresholds dynamically.
 * Increases thresholds if too many false positives (failed speculative executions).
 * Decreases thresholds if too many false negatives (successful manual confirmations).
 */
export class AdaptiveThresholdManager {
  private config: AdaptiveConfig;
  private executionHistory: ExecutionRecord[] = [];
  private currentThresholds: {
    explicitThreshold?: number;
    suggestionThreshold?: number;
  } = {};

  constructor(config?: Partial<AdaptiveConfig>) {
    this.config = {
      initialExplicitThreshold: 0.50,
      initialSuggestionThreshold: 0.70,
      learningRate: 0.05,
      minThreshold: 0.40,
      maxThreshold: 0.90,
      windowSize: 50,
      ...config,
    };
  }

  /**
   * Record execution result for adaptive learning
   *
   * @param record - Execution record with confidence, mode, and outcome
   */
  recordExecution(record: ExecutionRecord): void {
    this.executionHistory.push(record);

    // Keep only recent executions (sliding window)
    if (this.executionHistory.length > this.config.windowSize) {
      this.executionHistory.shift();
    }

    // Adjust thresholds every 10 executions
    if (this.executionHistory.length % 10 === 0 && this.executionHistory.length >= 20) {
      this.adjustThresholds();
    }
  }

  /**
   * Adjust thresholds based on execution history
   *
   * Strategy:
   * - False positive (FP): Speculative execution failed → Increase threshold
   * - False negative (FN): Manual confirmation succeeded with high confidence → Decrease threshold
   * - True positive (TP): Speculative execution succeeded → Maintain threshold
   * - True negative (TN): Low confidence correctly required manual input → Maintain threshold
   */
  private adjustThresholds(): void {
    const recentExecutions = this.executionHistory.slice(-20);
    if (recentExecutions.length < 20) return;

    // Calculate metrics
    const speculativeExecs = recentExecutions.filter((e) => e.mode === "speculative");
    const suggestionExecs = recentExecutions.filter((e) => e.mode === "suggestion");

    // False positives: Speculative executions that failed
    const falsePositives = speculativeExecs.filter((e) => !e.success).length;
    const falsePositiveRate = speculativeExecs.length > 0 ? falsePositives / speculativeExecs.length : 0;

    // False negatives: Suggestions with high confidence that user accepted
    const falseNegatives = suggestionExecs.filter(
      (e) => e.userAccepted && e.confidence >= (this.config.initialSuggestionThreshold - 0.1),
    ).length;
    const falseNegativeRate = suggestionExecs.length > 0 ? falseNegatives / suggestionExecs.length : 0;

    // Adjustment logic
    const adjustment: ThresholdAdjustment = { reason: "" };

    if (falsePositiveRate > 0.2) {
      // Too many failed speculative executions → Increase threshold
      const increase = this.config.learningRate * falsePositiveRate;
      const newThreshold = Math.min(
        (this.currentThresholds.suggestionThreshold ?? this.config.initialSuggestionThreshold) + increase,
        this.config.maxThreshold,
      );

      adjustment.suggestionThreshold = newThreshold;
      adjustment.reason = `High false positive rate (${(falsePositiveRate * 100).toFixed(0)}%) → Increased threshold to ${newThreshold.toFixed(2)}`;
    } else if (falseNegativeRate > 0.3) {
      // Too many unnecessary manual confirmations → Decrease threshold
      const decrease = this.config.learningRate * falseNegativeRate;
      const newThreshold = Math.max(
        (this.currentThresholds.suggestionThreshold ?? this.config.initialSuggestionThreshold) - decrease,
        this.config.minThreshold,
      );

      adjustment.suggestionThreshold = newThreshold;
      adjustment.reason = `High false negative rate (${(falseNegativeRate * 100).toFixed(0)}%) → Decreased threshold to ${newThreshold.toFixed(2)}`;
    }

    // Apply adjustment
    if (adjustment.suggestionThreshold) {
      this.currentThresholds.suggestionThreshold = adjustment.suggestionThreshold;
      log.info(`Adaptive threshold adjustment: ${adjustment.reason}`);
    }
  }

  /**
   * Get current thresholds (adaptive or default)
   *
   * @returns Current thresholds
   */
  getThresholds(): { explicitThreshold?: number; suggestionThreshold?: number } {
    return {
      explicitThreshold: this.currentThresholds.explicitThreshold ?? this.config.initialExplicitThreshold,
      suggestionThreshold: this.currentThresholds.suggestionThreshold ?? this.config.initialSuggestionThreshold,
    };
  }

  /**
   * Get speculative execution metrics
   *
   * @returns Metrics for monitoring and debugging
   */
  getMetrics(): SpeculativeMetrics {
    const speculativeExecs = this.executionHistory.filter((e) => e.mode === "speculative");

    const successfulExecutions = speculativeExecs.filter((e) => e.success).length;
    const failedExecutions = speculativeExecs.filter((e) => !e.success).length;

    const avgExecutionTime = speculativeExecs.length > 0
      ? speculativeExecs.reduce((sum, e) => sum + (e.executionTime || 0), 0) / speculativeExecs.length
      : 0;

    const avgConfidence = speculativeExecs.length > 0
      ? speculativeExecs.reduce((sum, e) => sum + e.confidence, 0) / speculativeExecs.length
      : 0;

    // Wasted compute: Failed executions
    const wastedComputeCost = failedExecutions * avgExecutionTime;

    // Saved latency: Successful speculative executions (no user wait time)
    const savedLatency = successfulExecutions * 2000; // Assume 2s saved per speculative execution

    return {
      totalSpeculativeAttempts: speculativeExecs.length,
      successfulExecutions,
      failedExecutions,
      avgExecutionTime,
      avgConfidence,
      wastedComputeCost,
      savedLatency,
    };
  }

  /**
   * Reset adaptive learning (for testing)
   */
  reset(): void {
    this.executionHistory = [];
    this.currentThresholds = {};
  }
}
