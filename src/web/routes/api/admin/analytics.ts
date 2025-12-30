/**
 * Admin Analytics API Route Handler
 *
 * GET /api/admin/analytics?timeRange=24h|7d|30d
 *
 * Returns platform analytics for admin users.
 * Cloud-only: this route is excluded from public sync.
 *
 * @module web/routes/api/admin/analytics
 */

import type { FreshContext } from "fresh";
import * as log from "@std/log";
import { getRawDb } from "../../../../server/auth/db.ts";
import { getAdminAnalytics, isAdminUser } from "../../../../cloud/admin/mod.ts";
import type { AuthState } from "../../_middleware.ts";
import type { TimeRange } from "../../../../cloud/admin/types.ts";

export const handler = {
  /**
   * Get admin analytics
   */
  async GET(ctx: FreshContext<AuthState>) {
    const { user } = ctx.state;
    const url = new URL(ctx.req.url);

    // Parse query parameters (use "range" for consistency with other APIs)
    const timeRangeParam = url.searchParams.get("range") || "24h";
    const timeRange: TimeRange = ["24h", "7d", "30d"].includes(timeRangeParam)
      ? (timeRangeParam as TimeRange)
      : "24h";

    // Require authentication
    if (!user) {
      log.warn("[AdminAPI] Unauthorized access attempt to /api/admin/analytics");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const db = await getRawDb();

      // Check admin access (pass username for ADMIN_USERNAMES env check)
      const isAdmin = await isAdminUser(db, user.id, user.username);
      if (!isAdmin) {
        log.warn(
          `[AdminAPI] Admin access denied for user: ${user.username} (${user.id})`,
        );
        return new Response(
          JSON.stringify({ error: "Forbidden: Admin access required" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get analytics
      const analytics = await getAdminAnalytics(db, { timeRange });

      return new Response(
        JSON.stringify(analytics),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            // Allow caching for 1 minute (less than service cache)
            "Cache-Control": "private, max-age=60",
          },
        },
      );
    } catch (error) {
      console.error("Error fetching admin analytics:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
