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

const logger = getLogger("default");

export class CapabilityMatcher {
  constructor(
    private capabilityStore: CapabilityStore,
    private adaptiveThresholds: AdaptiveThresholdManager,
  ) {}

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

      // 4. Calculate Final Score
      let score = candidate.similarity * reliabilityFactor;

      // Cap at 0.95 (ADR-038 Global Cap)
      score = Math.min(score, 0.95);

      logger.debug("Capability candidate scored", {
        id: candidate.capability.id,
        semantic: candidate.similarity.toFixed(2),
        reliability: reliabilityFactor,
        final: score.toFixed(2),
        threshold,
      });

      // 5. Check against Threshold
      if (score >= threshold) {
        // Keep the best one
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            capability: candidate.capability,
            score,
            semanticScore: candidate.similarity,
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
    } else {
      logger.debug("No capability match above threshold", { intent, threshold });
    }

    return bestMatch;
  }
}
