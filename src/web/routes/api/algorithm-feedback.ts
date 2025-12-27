/**
 * Algorithm Feedback Route Handler (Story 7.6 - ADR-039)
 *
 * POST /api/algorithm-feedback
 *
 * Allows frontend to update trace outcomes when user interacts with suggestions.
 * This enables feedback loop for algorithm tuning.
 *
 * @module web/routes/api/algorithm-feedback
 */

import type { Context } from "fresh";
import { getDb } from "../../../db/mod.ts";
import { AlgorithmTracer, type UserAction } from "../../../telemetry/algorithm-tracer.ts";
import type { AuthState } from "../_middleware.ts";

/**
 * Request body schema
 */
interface FeedbackRequest {
  traceId: string;
  userAction: UserAction;
  executionSuccess?: boolean;
  durationMs?: number;
}

/**
 * Validate user action
 */
function isValidUserAction(action: unknown): action is UserAction {
  return action === "selected" || action === "ignored" || action === "explicit_rejection";
}

export const handler = {
  /**
   * Update algorithm trace outcome
   *
   * Body:
   * - traceId: UUID of the trace to update
   * - userAction: "selected" | "ignored" | "explicit_rejection"
   * - executionSuccess?: boolean (optional, for "selected" actions)
   * - durationMs?: number (optional, execution duration)
   *
   * Protection: In cloud mode, requires authenticated user (AC6)
   */
  async POST(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // AC6: Protected by auth in cloud mode
    if (isCloudMode && (!user || user.id === "local")) {
      return new Response(
        JSON.stringify({ error: "Authentication required in cloud mode" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const body = await ctx.req.json() as Partial<FeedbackRequest>;

      // Validate required fields
      if (!body.traceId || typeof body.traceId !== "string") {
        return new Response(
          JSON.stringify({ error: "traceId is required and must be a string" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!isValidUserAction(body.userAction)) {
        return new Response(
          JSON.stringify({
            error: "userAction must be 'selected', 'ignored', or 'explicit_rejection'",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.traceId)) {
        return new Response(
          JSON.stringify({ error: "traceId must be a valid UUID" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get DB and tracer
      const db = await getDb();
      const tracer = new AlgorithmTracer(db);

      // Update outcome
      await tracer.updateOutcome(body.traceId, {
        userAction: body.userAction,
        executionSuccess: body.executionSuccess,
        durationMs: body.durationMs,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Feedback recorded",
          traceId: body.traceId,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error recording algorithm feedback:", error);

      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to record feedback" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  /**
   * Get algorithm metrics or traces
   *
   * Query params:
   * - type: "metrics" (default) | "traces"
   * - windowHours: number (default: 24) - for metrics
   * - mode: "active_search" | "passive_suggestion" (optional filter)
   * - limit: number (default: 50) - for traces
   * - since: ISO timestamp - for traces (only return newer)
   *
   * Protection: In cloud mode, requires authenticated user
   */
  async GET(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Protected in cloud mode (metrics are sensitive data)
    if (isCloudMode && (!user || user.id === "local")) {
      return new Response(
        JSON.stringify({ error: "Authentication required in cloud mode" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const url = new URL(ctx.req.url);
      const typeParam = url.searchParams.get("type") || "metrics";

      const db = await getDb();
      const tracer = new AlgorithmTracer(db);

      // Return traces list
      if (typeParam === "traces") {
        const limitParam = url.searchParams.get("limit");
        const sinceParam = url.searchParams.get("since");
        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

        const traces = await tracer.getRecentTraces(limit, sinceParam || undefined);

        // Map to snake_case for external API
        const mappedTraces = traces.map((t) => ({
          trace_id: t.traceId,
          timestamp: t.timestamp.toISOString(),
          correlation_id: t.correlationId ?? null,
          algorithm_name: t.algorithmName ?? null,
          algorithm_mode: t.algorithmMode,
          target_type: t.targetType,
          intent: t.intent,
          context_hash: t.contextHash,
          signals: {
            semantic_score: t.signals.semanticScore,
            graph_score: t.signals.graphScore,
            success_rate: t.signals.successRate,
            pagerank: t.signals.pagerank,
            graph_density: t.signals.graphDensity,
            spectral_cluster_match: t.signals.spectralClusterMatch,
            adamic_adar: t.signals.adamicAdar,
            local_alpha: t.signals.localAlpha,
            alpha_algorithm: t.signals.alphaAlgorithm,
            cold_start: t.signals.coldStart,
            // SHGAT V1 K-head attention signals
            num_heads: t.signals.numHeads,
            avg_head_score: t.signals.avgHeadScore,
            head_scores: t.signals.headScores,
            head_weights: t.signals.headWeights,
            recursive_contribution: t.signals.recursiveContribution,
            // Feature contributions
            feature_contrib_semantic: t.signals.featureContribSemantic,
            feature_contrib_structure: t.signals.featureContribStructure,
            feature_contrib_temporal: t.signals.featureContribTemporal,
            feature_contrib_reliability: t.signals.featureContribReliability,
            // Target identification
            target_id: t.signals.targetId,
            target_name: t.signals.targetName,
            target_success_rate: t.signals.targetSuccessRate,
            target_usage_count: t.signals.targetUsageCount,
            reliability_mult: t.signals.reliabilityMult,
            // DRDSP pathfinding signals
            path_found: t.signals.pathFound,
            path_length: t.signals.pathLength,
            path_weight: t.signals.pathWeight,
          },
          params: {
            alpha: t.params.alpha,
            reliability_factor: t.params.reliabilityFactor,
            structural_boost: t.params.structuralBoost,
          },
          final_score: t.finalScore,
          threshold_used: t.thresholdUsed,
          decision: t.decision,
          outcome: t.outcome
            ? {
              user_action: t.outcome.userAction,
              execution_success: t.outcome.executionSuccess,
              duration_ms: t.outcome.durationMs,
            }
            : null,
        }));

        return new Response(
          JSON.stringify({
            success: true,
            traces: mappedTraces,
            count: mappedTraces.length,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Return metrics (default)
      const windowHoursParam = url.searchParams.get("windowHours");
      const modeParam = url.searchParams.get("mode");

      const windowHours = windowHoursParam ? parseInt(windowHoursParam, 10) : 24;

      // Validate windowHours
      if (isNaN(windowHours) || windowHours < 1 || windowHours > 168) {
        return new Response(
          JSON.stringify({ error: "windowHours must be between 1 and 168" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Validate mode if provided
      const validModes = ["active_search", "passive_suggestion"];
      if (modeParam && !validModes.includes(modeParam)) {
        return new Response(
          JSON.stringify({
            error: "mode must be 'active_search' or 'passive_suggestion'",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const metrics = await tracer.getMetrics(
        windowHours,
        modeParam as "active_search" | "passive_suggestion" | undefined,
      );

      return new Response(
        JSON.stringify({
          success: true,
          windowHours,
          mode: modeParam || "all",
          metrics,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error getting algorithm data:", error);
      return new Response(
        JSON.stringify({ error: "Failed to get data" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
