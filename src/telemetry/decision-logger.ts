/**
 * Decision Logger - Clean Architecture Adapter
 *
 * Provides an abstract interface for algorithm decision logging.
 * Uses EventBus-centric architecture: emits events that subscribers handle.
 *
 * Subscribers:
 * - AlgorithmDBSubscriber: writes to Postgres
 * - AlgorithmOTELSubscriber: emits OTEL spans
 * - MetricsCollector: updates counters (via wildcard subscription)
 *
 * @module telemetry/decision-logger
 */

import { eventBus } from "../events/mod.ts";
import type { AlgorithmDecisionPayload } from "../events/types.ts";
import { isPureOperation } from "../capabilities/pure-operations.ts";
import type { AlgorithmMode, AlgorithmParams, AlgorithmSignals, TargetType } from "./algorithm-tracer.ts";

// ============================================================================
// Abstract Interface (Port)
// ============================================================================

/**
 * Decision signals for algorithm decisions (subset of AlgorithmSignals)
 */
export type DecisionSignals = Partial<AlgorithmSignals>;

/**
 * Decision parameters for algorithm decisions (subset of AlgorithmParams)
 */
export type DecisionParams = Partial<AlgorithmParams>;

/**
 * Decision outcome type
 */
export type DecisionOutcome = "accepted" | "rejected" | "rejected_by_threshold" | "filtered_by_reliability";

/**
 * Algorithm decision data (domain-agnostic)
 *
 * This interface is intentionally loose to decouple use-cases
 * from infrastructure-specific types.
 */
export interface AlgorithmDecision {
  algorithm: string;
  mode: AlgorithmMode;
  targetType: TargetType;
  intent: string;
  userId?: string;
  finalScore: number;
  threshold: number;
  decision: DecisionOutcome;
  targetId?: string;
  targetName?: string;
  correlationId?: string;
  contextHash?: string;
  signals?: DecisionSignals;
  params?: DecisionParams;
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
   * @returns Trace ID for follow-up (feedback updates)
   */
  logDecision(decision: AlgorithmDecision): string;
}

// ============================================================================
// Concrete Implementation (Adapter)
// ============================================================================

/**
 * Telemetry Adapter - EventBus-centric implementation
 *
 * Implements IDecisionLogger by emitting events to EventBus.
 * Subscribers handle persistence (DB) and observability (OTEL).
 */
export class TelemetryAdapter implements IDecisionLogger {
  private userId: string | null = null;

  /**
   * Set user ID for multi-tenant trace isolation (Story 9.8)
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  /**
   * Log algorithm decision by emitting event
   *
   * Returns traceId immediately (sync) - subscribers handle async work.
   */
  logDecision(decision: AlgorithmDecision): string {
    const traceId = crypto.randomUUID();

    // Auto-detect pure flag from targetId if not explicitly set
    const pure = decision.targetId ? isPureOperation(decision.targetId) : undefined;

    // Build full payload (use decision.userId or fallback to instance userId)
    const payload: AlgorithmDecisionPayload = {
      traceId,
      userId: decision.userId ?? this.userId ?? undefined,
      correlationId: decision.correlationId,
      algorithmName: decision.algorithm,
      algorithmMode: decision.mode,
      targetType: decision.targetType,
      intent: decision.intent?.substring(0, 200),
      contextHash: decision.contextHash,
      signals: {
        graphDensity: decision.signals?.graphDensity ?? 0,
        spectralClusterMatch: decision.signals?.spectralClusterMatch ?? false,
        semanticScore: decision.signals?.semanticScore,
        graphScore: decision.signals?.graphScore,
        successRate: decision.signals?.successRate,
        pagerank: decision.signals?.pagerank,
        adamicAdar: decision.signals?.adamicAdar,
        localAlpha: decision.signals?.localAlpha,
        alphaAlgorithm: decision.signals?.alphaAlgorithm,
        coldStart: decision.signals?.coldStart,
        numHeads: decision.signals?.numHeads,
        avgHeadScore: decision.signals?.avgHeadScore,
        headScores: decision.signals?.headScores,
        headWeights: decision.signals?.headWeights,
        recursiveContribution: decision.signals?.recursiveContribution,
        featureContribSemantic: decision.signals?.featureContribSemantic,
        featureContribStructure: decision.signals?.featureContribStructure,
        featureContribTemporal: decision.signals?.featureContribTemporal,
        featureContribReliability: decision.signals?.featureContribReliability,
        targetId: decision.targetId,
        targetName: decision.targetName,
        targetSuccessRate: decision.signals?.targetSuccessRate,
        targetUsageCount: decision.signals?.targetUsageCount,
        reliabilityMult: decision.signals?.reliabilityMult,
        pathFound: decision.signals?.pathFound,
        pathLength: decision.signals?.pathLength,
        pathWeight: decision.signals?.pathWeight,
        pure,
      },
      params: {
        alpha: decision.params?.alpha ?? 0,
        reliabilityFactor: decision.params?.reliabilityFactor ?? 1.0,
        structuralBoost: decision.params?.structuralBoost ?? 0,
      },
      finalScore: decision.finalScore,
      thresholdUsed: decision.threshold,
      decision: decision.decision,
    };

    // Emit event - subscribers handle the rest
    eventBus.emit({
      type: "algorithm.decision",
      source: "telemetry-adapter",
      payload,
    });

    return traceId;
  }
}

/**
 * No-op decision logger for testing
 */
export class NoOpDecisionLogger implements IDecisionLogger {
  logDecision(_decision: AlgorithmDecision): string {
    return crypto.randomUUID();
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let _adapter: TelemetryAdapter | null = null;

/**
 * Get the singleton TelemetryAdapter instance
 */
export function getTelemetryAdapter(): TelemetryAdapter {
  if (!_adapter) {
    _adapter = new TelemetryAdapter();
  }
  return _adapter;
}
