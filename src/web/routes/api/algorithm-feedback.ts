/**
 * Algorithm Feedback Route Handler (Story 7.6 - ADR-039)
 *
 * POST /api/algorithm-feedback
 * GET /api/algorithm-feedback?type=metrics|traces
 *
 * Thin wrapper - delegates to src/api/algorithm.ts
 *
 * @module web/routes/api/algorithm-feedback
 */

import type { Context } from "fresh";
import type { AuthState } from "../_middleware.ts";
import {
  getAlgorithmMetrics,
  getRecentTraces,
  isValidMode,
  isValidUserAction,
  isValidUUID,
  recordFeedback,
} from "../../../api/algorithm.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handler = {
  async POST(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    if (isCloudMode && (!user || user.id === "local")) {
      return json({ error: "Authentication required in cloud mode" }, 401);
    }

    try {
      const body = await ctx.req.json();

      // Validate
      if (!body.traceId || typeof body.traceId !== "string") {
        return json({ error: "traceId is required and must be a string" }, 400);
      }
      if (!isValidUserAction(body.userAction)) {
        return json({
          error: "userAction must be 'selected', 'ignored', or 'explicit_rejection'",
        }, 400);
      }
      if (!isValidUUID(body.traceId)) {
        return json({ error: "traceId must be a valid UUID" }, 400);
      }

      // Delegate to core
      const result = await recordFeedback({
        traceId: body.traceId,
        userAction: body.userAction,
        executionSuccess: body.executionSuccess,
        durationMs: body.durationMs,
      });

      return json(result);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      console.error("Error recording algorithm feedback:", error);
      return json({ error: "Failed to record feedback" }, 500);
    }
  },

  async GET(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    if (isCloudMode && (!user || user.id === "local")) {
      return json({ error: "Authentication required in cloud mode" }, 401);
    }

    try {
      const url = new URL(ctx.req.url);
      const typeParam = url.searchParams.get("type") || "metrics";

      // Traces
      if (typeParam === "traces") {
        const limitParam = url.searchParams.get("limit");
        const sinceParam = url.searchParams.get("since");
        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

        const result = await getRecentTraces(limit, sinceParam || undefined);
        return json(result);
      }

      // Metrics
      const windowHoursParam = url.searchParams.get("windowHours");
      const modeParam = url.searchParams.get("mode");
      const windowHours = windowHoursParam ? parseInt(windowHoursParam, 10) : 24;

      if (isNaN(windowHours) || windowHours < 1 || windowHours > 168) {
        return json({ error: "windowHours must be between 1 and 168" }, 400);
      }
      if (modeParam && !isValidMode(modeParam)) {
        return json({
          error: "mode must be 'active_search' or 'passive_suggestion'",
        }, 400);
      }

      const result = await getAlgorithmMetrics(
        windowHours,
        modeParam as "active_search" | "passive_suggestion" | undefined,
      );
      return json(result);
    } catch (error) {
      console.error("Error getting algorithm data:", error);
      return json({ error: "Failed to get data" }, 500);
    }
  },
};
