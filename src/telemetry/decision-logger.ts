/**
 * Decision Logger - Clean Architecture Adapter
 *
 * Provides an abstract interface for algorithm decision logging.
 * Combines DB logging (AlgorithmTracer) with OTEL spans.
 *
 * @module telemetry/decision-logger
 */

import { recordAlgorithmDecision, isOtelEnabled } from "./otel.ts";
import type { AlgorithmTracer } from "./algorithm-tracer.ts";

// ============================================================================
// Abstract Interface (Port)
// ============================================================================

/**
 * Algorithm decision data (domain-agnostic)
 *
 * This interface is intentionally loose to decouple use-cases
 * from infrastructure-specific types.
 */
export interface AlgorithmDecision {
  /** Algorithm name (e.g., "SHGAT", "DRDSP") */
  algorithm: string;
  /** Algorithm mode (e.g., "passive_suggestion", "active_search") */
  mode: string;
  /** Target type (e.g., "tool", "capability") */
  targetType: string;
  /** User intent (truncated) */
  intent: string;
  /** Final computed score */
  finalScore: number;
  /** Threshold used for decision */
  threshold: number;
  /** Decision outcome */
  decision: "accepted" | "rejected";
  /** Optional target ID */
  targetId?: string;
  /** Optional correlation ID for tracing */
  correlationId?: string;
  /** Additional signals (algorithm-specific) */
  signals?: Record<string, unknown>;
  /** Algorithm parameters used */
  params?: Record<string, unknown>;
}

/**
 * Decision logger interface (Port)
 *
 * Use-cases depend on this abstraction, not concrete implementations.
 */
export interface IDecisionLogger {
  /**
   * Log an algorithm decision
   * @param decision - The decision data
   * @returns Optional trace ID for follow-up
   */
  logDecision(decision: AlgorithmDecision): void | Promise<string | void>;
}

// ============================================================================
// Concrete Implementation (Adapter)
// ============================================================================

/**
 * Telemetry Adapter - combines DB + OTEL logging
 *
 * Implements IDecisionLogger by delegating to:
 * 1. AlgorithmTracer (DB logging for analysis)
 * 2. OTEL spans (distributed tracing when enabled)
 */
export class TelemetryAdapter implements IDecisionLogger {
  constructor(
    private readonly algorithmTracer?: AlgorithmTracer,
  ) {}

  /**
   * Log algorithm decision to DB and OTEL
   */
  async logDecision(decision: AlgorithmDecision): Promise<string | void> {
    // 1. Log to OTEL if enabled (fire-and-forget)
    if (isOtelEnabled()) {
      recordAlgorithmDecision(decision.algorithm, {
        "algorithm.name": decision.algorithm,
        "algorithm.mode": decision.mode,
        "algorithm.intent": decision.intent.substring(0, 200),
        "algorithm.target_type": decision.targetType,
        "algorithm.final_score": decision.finalScore,
        "algorithm.threshold": decision.threshold,
        "algorithm.decision": decision.decision,
        "algorithm.target_id": decision.targetId,
      }, decision.decision === "accepted");
    }

    // 2. Log to DB via AlgorithmTracer if available
    if (this.algorithmTracer) {
      // Map to AlgorithmTracer's strict types with required defaults
      const signals = decision.signals ?? {};
      const params = decision.params ?? {};

      const traceId = await this.algorithmTracer.logTrace({
        correlationId: decision.correlationId,
        algorithmName: decision.algorithm as "SHGAT" | "DRDSP" | "CapabilityMatcher" | "DAGSuggester" | "HybridSearch" | "AlternativesPrediction" | "CapabilitiesPrediction",
        algorithmMode: decision.mode as "active_search" | "passive_suggestion",
        targetType: decision.targetType as "tool" | "capability",
        intent: decision.intent.substring(0, 200),
        signals: {
          // Required fields with sensible defaults
          graphDensity: (signals.graphDensity as number) ?? 0,
          spectralClusterMatch: (signals.spectralClusterMatch as boolean) ?? false,
          // Optional fields passthrough
          semanticScore: signals.semanticScore as number | undefined,
          targetId: decision.targetId ?? (signals.targetId as string | undefined),
          pathFound: signals.pathFound as boolean | undefined,
          pathLength: signals.pathLength as number | undefined,
          pathWeight: signals.pathWeight as number | undefined,
        },
        params: {
          // Required fields with sensible defaults
          alpha: (params.alpha as number) ?? 0,
          reliabilityFactor: (params.reliabilityFactor as number) ?? 1.0,
          structuralBoost: (params.structuralBoost as number) ?? 0,
        },
        finalScore: decision.finalScore,
        thresholdUsed: decision.threshold,
        decision: decision.decision === "accepted"
          ? "accepted"
          : "rejected_by_threshold",
      });
      return traceId;
    }
  }
}

/**
 * No-op decision logger for testing
 */
export class NoOpDecisionLogger implements IDecisionLogger {
  logDecision(_decision: AlgorithmDecision): void {
    // No-op
  }
}
