/**
 * Fresh Authentication Middleware
 *
 * Protects dashboard and settings routes with session-based auth.
 * In local mode, auth is bypassed and user_id = "local".
 *
 * Protected routes:
 * - /dashboard/*
 * - /settings/*
 *
 * Public routes:
 * - /
 * - /auth/*
 * - /blog/*
 *
 * @module web/routes/_middleware
 */

import type {Context } from "fresh";
import { isCloudMode, validateApiKeyFromDb } from "../../lib/auth.ts";
import { getSessionFromRequest } from "../../server/auth/session.ts";
import { isProtectedRoute, isPublicRoute } from "../route-guards.ts";

// Dev mode detection (Deno.env is available at runtime)
const isDev = Deno.env.get("DENO_ENV") !== "production" &&
  !Deno.env.get("DENO_DEPLOYMENT_ID");

/**
 * User state injected into Fresh context
 */
export interface AuthState {
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode: boolean;
}

/**
 * Fresh 2.x middleware handler
 * Note: Fresh 2.x uses single argument ctx with ctx.req
 */
export async function handler(
  ctx: Context<AuthState>,
): Promise<Response> {
  const url = new URL(ctx.req.url);
  const pathname = url.pathname;

  // Initialize state
  ctx.state.isCloudMode = isCloudMode();
  ctx.state.user = null;

  // Local mode: bypass auth, inject local user
  if (!isCloudMode()) {
    ctx.state.user = {
      id: "local",
      username: "local",
      avatarUrl: undefined,
    };
    return ctx.next();
  }

  // Cloud mode: check API key first, then session
  // API key auth (x-api-key header) - for programmatic access (PML CLI, curl, etc.)
  const apiKey = ctx.req.headers.get("x-api-key");
  if (apiKey) {
    const authResult = await validateApiKeyFromDb(apiKey);
    if (authResult) {
      ctx.state.user = {
        id: authResult.user_id,
        username: authResult.username ?? "unknown",
        avatarUrl: undefined,
      };
      return ctx.next();
    }
    // Invalid API key - don't fall through, return 401
    return new Response(JSON.stringify({ error: "Invalid API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Session auth (cookie) - for dashboard/browser access
  if (isProtectedRoute(pathname)) {
    const session = await getSessionFromRequest(ctx.req);

    if (!session) {
      // Redirect to signin with return URL
      const returnUrl = encodeURIComponent(pathname + url.search);
      return new Response(null, {
        status: 302,
        headers: { Location: `/auth/signin?return=${returnUrl}` },
      });
    }

    // Inject user into context
    ctx.state.user = {
      id: session.userId,
      username: session.username,
      avatarUrl: session.avatarUrl,
    };
  } else if (!isPublicRoute(pathname)) {
    // For non-protected, non-public routes, try to get session but don't require it
    const session = await getSessionFromRequest(ctx.req);
    if (session) {
      ctx.state.user = {
        id: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
      };
    }
  }

  const response = await ctx.next();

  // In dev mode, add anti-cache headers to prevent stale content issues
  // This helps with port forwarding scenarios and HMR
  if (isDev && response.headers.get("Content-Type")?.includes("text/html")) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}
