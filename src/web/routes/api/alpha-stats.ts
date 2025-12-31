/**
 * Alpha Statistics Route Handler (ADR-048)
 *
 * GET /api/alpha-stats
 *
 * Thin wrapper - delegates to src/api/algorithm.ts
 *
 * @module web/routes/api/alpha-stats
 */

import type { Context } from "fresh";
import type { AuthState } from "../_middleware.ts";
import { getAlphaStats } from "../../../api/algorithm.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handler = {
  async GET(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    if (isCloudMode && (!user || user.id === "local")) {
      return json({ error: "Authentication required in cloud mode" }, 401);
    }

    try {
      const url = new URL(ctx.req.url);
      const windowHoursParam = url.searchParams.get("windowHours");
      const windowHours = windowHoursParam ? parseInt(windowHoursParam, 10) : 24;

      if (isNaN(windowHours) || windowHours < 1 || windowHours > 168) {
        return json({ error: "windowHours must be between 1 and 168" }, 400);
      }

      const result = await getAlphaStats(windowHours);
      return json(result);
    } catch (error) {
      console.error("Error getting alpha stats:", error);
      return json({ error: "Failed to get alpha statistics" }, 500);
    }
  },
};
