/**
 * Emergence Metrics API Route Handler
 *
 * Handles /api/metrics/emergence endpoint for CAS (Complex Adaptive Systems) metrics.
 * Based on SYMBIOSIS/ODI framework (arxiv:2503.13754) and Holland's CAS theory.
 *
 * @module mcp/routing/handlers/emergence
 */

import * as log from "@std/log";
import type { RouteContext } from "../types.ts";
import { errorResponse, jsonResponse } from "../types.ts";

/**
 * Time range for emergence metrics
 */
export type EmergenceTimeRange = "1h" | "24h" | "7d" | "30d";

/**
 * Trend direction for metrics
 */
export type Trend = "rising" | "falling" | "stable";

/**
 * Phase transition type per SYMBIOSIS/ODI
 */
export interface PhaseTransition {
  detected: boolean;
  type: "expansion" | "consolidation" | "none";
  confidence: number;
  description: string;
}

/**
 * Recommendation from emergence analysis
 */
export interface Recommendation {
  type: "warning" | "info" | "success";
  metric: string;
  message: string;
  action?: string;
}

/**
 * Emergence metrics response (SYMBIOSIS-aligned)
 */
export interface EmergenceMetricsResponse {
  current: {
    graphEntropy: number;
    clusterStability: number;
    capabilityDiversity: number;
    learningVelocity: number;
    speculationAccuracy: number;
    thresholdConvergence: number;
    capabilityCount: number;
    parallelizationRate: number;
  };
  trends: {
    graphEntropy: Trend;
    clusterStability: Trend;
    capabilityDiversity: Trend;
    learningVelocity: Trend;
    speculationAccuracy: Trend;
  };
  phaseTransition: PhaseTransition;
  recommendations: Recommendation[];
  timeseries: {
    entropy: Array<{ timestamp: string; value: number }>;
    stability: Array<{ timestamp: string; value: number }>;
    velocity: Array<{ timestamp: string; value: number }>;
  };
  thresholds: {
    entropyHealthy: [number, number];
    stabilityHealthy: number;
    diversityHealthy: number;
  };
}

// History for phase transition detection (in-memory, resets on restart)
const emergenceHistory: Array<{ timestamp: number; entropy: number; stability: number }> = [];
const MAX_HISTORY_SIZE = 20;

/**
 * Compute Shannon entropy of edge weight distribution
 */
function computeGraphEntropy(edgeWeights: number[]): number {
  if (edgeWeights.length === 0) return 0;

  const total = edgeWeights.reduce((sum, w) => sum + w, 0);
  if (total === 0) return 0;

  const probs = edgeWeights.map((w) => w / total);
  const entropy = -probs.reduce((h, p) => h + (p > 0 ? p * Math.log2(p) : 0), 0);

  // Normalize to 0-1 range
  const maxEntropy = Math.log2(edgeWeights.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Compute trend from current vs previous value
 */
function computeTrend(current: number, previous: number): Trend {
  const threshold = 0.05; // 5% change threshold
  const delta = current - previous;

  if (delta > threshold) return "rising";
  if (delta < -threshold) return "falling";
  return "stable";
}

/**
 * Detect phase transition per ODI paper (arxiv:2503.13754)
 */
function detectPhaseTransition(
  history: Array<{ entropy: number }>,
): PhaseTransition {
  if (history.length < 10) {
    return { detected: false, type: "none", confidence: 0, description: "" };
  }

  const recent = history.slice(-5);
  const older = history.slice(-10, -5);

  const recentAvg = recent.reduce((s, m) => s + m.entropy, 0) / recent.length;
  const olderAvg = older.reduce((s, m) => s + m.entropy, 0) / older.length;
  const entropyDelta = recentAvg - olderAvg;

  if (Math.abs(entropyDelta) > 0.2) {
    return {
      detected: true,
      type: entropyDelta > 0 ? "expansion" : "consolidation",
      confidence: Math.min(Math.abs(entropyDelta) / 0.3, 1),
      description: entropyDelta > 0
        ? "System expanding - new patterns emerging"
        : "System consolidating - patterns stabilizing",
    };
  }

  return { detected: false, type: "none", confidence: 0, description: "" };
}

/**
 * Generate recommendations based on metrics
 */
function generateRecommendations(
  metrics: EmergenceMetricsResponse["current"],
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Entropy warnings
  if (metrics.graphEntropy > 0.7) {
    recs.push({
      type: "warning",
      metric: "graphEntropy",
      message: `Entropy high (${metrics.graphEntropy.toFixed(2)}), system may be chaotic`,
      action: "Consider pruning stale edges or consolidating capabilities",
    });
  }
  if (metrics.graphEntropy < 0.3 && metrics.graphEntropy > 0) {
    recs.push({
      type: "warning",
      metric: "graphEntropy",
      message: `Entropy low (${metrics.graphEntropy.toFixed(2)}), system may be rigid`,
      action: "Encourage exploration of new tool combinations",
    });
  }

  // Stability warnings
  if (metrics.clusterStability < 0.8 && metrics.clusterStability > 0) {
    recs.push({
      type: "warning",
      metric: "clusterStability",
      message: `Cluster stability low (${metrics.clusterStability.toFixed(2)})`,
      action: "Patterns not yet mature, continue observation",
    });
  }

  // Success indicators
  if (metrics.speculationAccuracy > 0.8) {
    recs.push({
      type: "success",
      metric: "speculationAccuracy",
      message: `Speculation accuracy excellent (${(metrics.speculationAccuracy * 100).toFixed(0)}%)`,
    });
  }

  // Diversity info
  if (metrics.capabilityDiversity > 0.7) {
    recs.push({
      type: "success",
      metric: "capabilityDiversity",
      message: `High pattern diversity (${metrics.capabilityDiversity.toFixed(2)})`,
    });
  }

  return recs;
}

/**
 * Generate mock timeseries data for the given range
 * TODO: Replace with actual historical data from database
 */
function generateTimeseries(
  range: EmergenceTimeRange,
  currentEntropy: number,
  currentStability: number,
  currentVelocity: number,
): EmergenceMetricsResponse["timeseries"] {
  const now = Date.now();
  const points =
    range === "1h" ? 12 : range === "24h" ? 24 : range === "7d" ? 28 : 30;
  const interval =
    range === "1h"
      ? 5 * 60 * 1000
      : range === "24h"
        ? 60 * 60 * 1000
        : range === "7d"
          ? 6 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

  const entropy: Array<{ timestamp: string; value: number }> = [];
  const stability: Array<{ timestamp: string; value: number }> = [];
  const velocity: Array<{ timestamp: string; value: number }> = [];

  for (let i = points - 1; i >= 0; i--) {
    const timestamp = new Date(now - i * interval).toISOString();
    // Add some variance around current values
    const variance = 0.1;
    entropy.push({
      timestamp,
      value: Math.max(
        0,
        Math.min(1, currentEntropy + (Math.random() - 0.5) * variance),
      ),
    });
    stability.push({
      timestamp,
      value: Math.max(
        0,
        Math.min(1, currentStability + (Math.random() - 0.5) * variance),
      ),
    });
    velocity.push({
      timestamp,
      value: Math.max(0, currentVelocity + (Math.random() - 0.5) * variance * 10),
    });
  }

  return { entropy, stability, velocity };
}

/**
 * GET /api/metrics/emergence
 *
 * Returns CAS emergence metrics for the specified time range
 *
 * Query params:
 * - range: Time range (1h, 24h, 7d, 30d) (default: 24h)
 */
export async function handleEmergenceMetrics(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const range = (url.searchParams.get("range") || "24h") as EmergenceTimeRange;

    // Validate range parameter
    if (!["1h", "24h", "7d", "30d"].includes(range)) {
      return errorResponse(
        `Invalid range parameter: ${range}. Must be one of: 1h, 24h, 7d, 30d`,
        400,
        corsHeaders,
      );
    }

    // Get base metrics from graph engine
    const baseMetrics = await ctx.graphEngine.getMetrics(
      range === "30d" ? "7d" : range,
    );

    // Extract edge weights for entropy calculation
    const snapshot = await ctx.graphEngine.getSnapshot();
    const edgeWeights = snapshot.edges.map((e: { weight: number }) => e.weight || 1);

    // Compute emergence metrics
    const graphEntropy = computeGraphEntropy(edgeWeights);
    const clusterStability = baseMetrics.current?.communitiesCount
      ? Math.min(1, 0.5 + baseMetrics.current.communitiesCount * 0.05)
      : 0.75; // Placeholder

    const capabilityCount = baseMetrics.current?.capabilitiesCount || 0;
    const nodeCount = baseMetrics.current?.nodeCount || 1;
    const capabilityDiversity = nodeCount > 0 ? Math.min(1, capabilityCount / nodeCount) : 0;

    const learningVelocity = baseMetrics.period?.newEdgesCreated || 0;
    const speculationAccuracy = baseMetrics.algorithm?.acceptanceRate || 0;
    const thresholdConvergence = baseMetrics.current?.adaptiveAlpha || 0.5;
    const parallelizationRate = 0.3; // Placeholder - would need workflow execution data

    const currentMetrics = {
      graphEntropy,
      clusterStability,
      capabilityDiversity,
      learningVelocity,
      speculationAccuracy,
      thresholdConvergence,
      capabilityCount,
      parallelizationRate,
    };

    // Update history for phase transition detection
    emergenceHistory.push({
      timestamp: Date.now(),
      entropy: graphEntropy,
      stability: clusterStability,
    });
    if (emergenceHistory.length > MAX_HISTORY_SIZE) {
      emergenceHistory.shift();
    }

    // Get previous values for trend computation
    const prevEntry = emergenceHistory[emergenceHistory.length - 2];
    const prevEntropy = prevEntry?.entropy ?? graphEntropy;
    const prevStability = prevEntry?.stability ?? clusterStability;

    const trends = {
      graphEntropy: computeTrend(graphEntropy, prevEntropy),
      clusterStability: computeTrend(clusterStability, prevStability),
      capabilityDiversity: "stable" as Trend,
      learningVelocity: "stable" as Trend,
      speculationAccuracy: "stable" as Trend,
    };

    const phaseTransition = detectPhaseTransition(emergenceHistory);
    const recommendations = generateRecommendations(currentMetrics);
    const timeseries = generateTimeseries(
      range,
      graphEntropy,
      clusterStability,
      learningVelocity,
    );

    const response: EmergenceMetricsResponse = {
      current: currentMetrics,
      trends,
      phaseTransition,
      recommendations,
      timeseries,
      thresholds: {
        entropyHealthy: [0.3, 0.7],
        stabilityHealthy: 0.8,
        diversityHealthy: 0.5,
      },
    };

    return jsonResponse(response, 200, corsHeaders);
  } catch (error) {
    log.error(`Failed to get emergence metrics: ${error}`);
    return errorResponse(`Failed to get emergence metrics: ${error}`, 500, corsHeaders);
  }
}

/**
 * Route /api/metrics/emergence requests
 */
export async function handleEmergenceRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (url.pathname === "/api/metrics/emergence" && req.method === "GET") {
    return await handleEmergenceMetrics(req, url, ctx, corsHeaders);
  }
  return null;
}
