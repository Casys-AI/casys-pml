/**
 * Delete Account Route Handler
 *
 * DELETE /api/user/delete
 *
 * Permanently deletes the user's account.
 * Destroys all sessions and redirects to landing page.
 *
 * Implements AC #8, #9 (delete account with double confirmation, anonymization)
 *
 * @module web/routes/api/user/delete
 */

import type { FreshContext } from "fresh";
import { getDb } from "../../../../server/auth/db.ts";
import { users } from "../../../../db/schema/users.ts";
import { eq } from "drizzle-orm";
import { destroySession } from "../../../../server/auth/session.ts";
import { getSessionId } from "../../../../server/auth/oauth.ts";
import { getKv } from "../../../../server/auth/kv.ts";
import type { AuthState } from "../../_middleware.ts";

export const handler = {
  /**
   * Delete user account
   * Requires authenticated session in cloud mode
   */
  async DELETE(ctx: FreshContext<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Cannot delete in local mode
    if (!isCloudMode) {
      return new Response(
        JSON.stringify({ error: "Account deletion not available in local mode" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Require authentication and valid user
    if (!user || user.id === "local") {
      return new Response(
        JSON.stringify({ error: "Cannot delete local user" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const db = await getDb();
      const anonymizedId = `deleted-${crypto.randomUUID()}`;

      // AC #9: Anonymize user data instead of hard delete
      // This preserves referential integrity while removing PII
      await db
        .update(users)
        .set({
          githubId: null,
          username: anonymizedId,
          email: null,
          avatarUrl: null,
          apiKeyHash: null,
          apiKeyPrefix: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Destroy session
      const sessionId = await getSessionId(ctx.req);
      if (sessionId) {
        const kv = await getKv();
        await destroySession(kv, sessionId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Account deleted successfully",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error deleting account:", error);
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
