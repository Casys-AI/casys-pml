/**
 * Capability Matcher (Story 7.3a)
 *
 * Helper class for DAGSuggester to find capabilities matching a user intent.
 * Implements the "Active Search" algorithm from ADR-038.
 *
 * Algorithm:
 * Score = SemanticSimilarity * ReliabilityFactor
 *
 * Reliability Factor:
 * - success_rate < 0.5 => 0.1 (Penalty)
 * - success_rate > 0.9 => 1.2 (Boost)
 * - otherwise => 1.0
 *
 * @module capabilities/matcher
 */

import type { CapabilityStore } from "./capability-store.ts";
import type { AdaptiveThresholdManager } from "../mcp/adaptive-threshold.ts";
import type { CapabilityMatch } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";
// Story 6.5: EventBus integration (ADR-036)
import { eventBus } from "../events/mod.ts";
// Story 7.6: Algorithm tracing (ADR-039)
import type { AlgorithmTracer, DecisionType } from "../telemetry/algorithm-tracer.ts";

const logger = getLogger("default");

export class CapabilityMatcher {
  private algorithmTracer: AlgorithmTracer | null = null;

  constructor(
    private capabilityStore: CapabilityStore,
    private adaptiveThresholds: AdaptiveThresholdManager,
    algorithmTracer?: AlgorithmTracer,
  ) {
    this.algorithmTracer = algorithmTracer || null;
  }

  /**
   * Set algorithm tracer for observability (Story 7.6 - ADR-039)
   *
   * @param tracer - AlgorithmTracer instance
   */
  setAlgorithmTracer(tracer: AlgorithmTracer): void {
    this.algorithmTracer = tracer;
    logger.debug("Algorithm tracer configured for CapabilityMatcher");
  }

  /**
   * Find the best capability matching the intent
   *
   * @param intent - User intent (natural language)
   * @returns Best match or null if no match above threshold
   */
  async findMatch(intent: string): Promise<CapabilityMatch | null> {
    // 1. Get adaptive threshold for "capability_matching" context
    // Note: Story 7.3a specifies using suggestionThreshold
    const thresholds = this.adaptiveThresholds.getThresholds();
    const threshold = thresholds.suggestionThreshold || 0.70;

    // 2. Semantic Search (Vector Similarity)
    // We fetch top 5 candidates to filter them
    const candidates = await this.capabilityStore.searchByIntent(intent, 5);

    if (candidates.length === 0) {
      return null;
    }

    let bestMatch: CapabilityMatch | null = null;

    for (const candidate of candidates) {
      // 3. Calculate Reliability Factor (ADR-038)
      let reliabilityFactor = 1.0;
      if (candidate.capability.successRate < 0.5) {
        reliabilityFactor = 0.1; // Penalize unreliable
      } else if (candidate.capability.successRate > 0.9) {
        reliabilityFactor = 1.2; // Boost highly reliable
      }

      // 4. Calculate Final Score (semanticScore harmonized with HybridSearchResult)
      let score = candidate.semanticScore * reliabilityFactor;

      // Cap at 0.95 (ADR-038 Global Cap)
      score = Math.min(score, 0.95);

      // 5. Determine decision for tracing
      let decision: DecisionType;
      if (reliabilityFactor === 0.1 && score < threshold) {
        decision = "filtered_by_reliability";
      } else if (score >= threshold) {
        decision = "accepted";
      } else {
        decision = "rejected_by_threshold";
      }

      logger.debug("Capability candidate scored", {
        id: candidate.capability.id,
        semanticScore: candidate.semanticScore.toFixed(2),
        reliability: reliabilityFactor,
        final: score.toFixed(2),
        threshold,
        decision,
      });

      // Story 7.6: Log trace for each candidate (fire-and-forget)
      this.algorithmTracer?.logTrace({
        algorithmMode: "active_search",
        targetType: "capability",
        intent: intent.substring(0, 200),
        signals: {
          semanticScore: candidate.semanticScore,
          successRate: candidate.capability.successRate,
          graphDensity: 0, // Not used in active search
          spectralClusterMatch: false, // Not used in active search
        },
        params: {
          alpha: 1.0, // Pure semantic for active search
          reliabilityFactor,
          structuralBoost: 0, // Not used in active search
        },
        finalScore: score,
        thresholdUsed: threshold,
        decision,
      });

      // 6. Check against Threshold
      if (score >= threshold) {
        // Keep the best one
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            capability: candidate.capability,
            score,
            semanticScore: candidate.semanticScore,
            thresholdUsed: threshold,
            parametersSchema: candidate.capability.parametersSchema || null,
          };
        }
      }
    }

    if (bestMatch) {
      logger.info("Capability match found", {
        id: bestMatch.capability.id,
        score: bestMatch.score.toFixed(2),
        intent,
      });

      // Story 6.5: Emit capability.matched event (ADR-036)
      // Convention: camelCase for event payload fields (per implementation-patterns.md)
      eventBus.emit({
        type: "capability.matched",
        source: "capability-matcher",
        payload: {
          capabilityId: bestMatch.capability.id,
          name: bestMatch.capability.name ?? "unknown",
          intent: intent.substring(0, 100),
          score: bestMatch.score,
          semanticScore: bestMatch.semanticScore,
          thresholdUsed: bestMatch.thresholdUsed,
          selected: true,
        },
      });
    } else {
      logger.debug("No capability match above threshold", { intent, threshold });
    }

    return bestMatch;
  }
}
